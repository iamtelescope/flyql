package matcher

import (
	"errors"
	"fmt"
	"log"
	"math"
	"regexp"
	"strings"
	"time"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/flyqltype"
	"github.com/iamtelescope/flyql/golang/literal"
	"github.com/iamtelescope/flyql/golang/transformers"
)

// datetimeShapedStrRE matches strings carrying a time-of-day component
// after a T or space separator (HH:MM at minimum). Used by the Type.Date
// migration warning to avoid false positives on trailing whitespace /
// bare `T` / names that happen to contain a space.
var datetimeShapedStrRE = regexp.MustCompile(`\d[T ]\d{2}:\d{2}`)

// Evaluator matches parsed flyql expressions against a Record. An Evaluator
// may optionally be constructed with a *flyql.ColumnSchema to enable
// schema-driven temporal coercion for columns declared Type.Date or
// Type.DateTime.
//
// @threadsafe: no — construct one Evaluator per request/goroutine. All
// internal caches (regexCache, tzCache, migrationWarned) are unprotected
// mutable maps. Sharing an Evaluator across goroutines risks a data race.
//
// Logging channel: invalid timezones and Date→DateTime migration warnings
// are emitted via the stdlib log package (log.Printf). Python's matcher
// emits via both warnings.warn(UserWarning) and logging.getLogger("flyql");
// JS via console.warn. Decision 25 accepts this per-language divergence.
type Evaluator struct {
	regexCache      map[string]*regexp.Regexp
	registry        *transformers.TransformerRegistry
	DefaultTimezone string
	Columns         *flyql.ColumnSchema
	tzCache         map[string]*time.Location
	migrationWarned map[string]struct{}
	invalidTzWarned map[string]struct{}
	tzNamesSeen     map[string]struct{}
}

func NewEvaluator() *Evaluator {
	return NewEvaluatorWithRegistry(nil)
}

func NewEvaluatorWithRegistry(registry *transformers.TransformerRegistry) *Evaluator {
	return newEvaluator(registry, "UTC", nil)
}

// NewEvaluatorWithSchema constructs an Evaluator with a column schema so
// Date/DateTime columns drive temporal coercion. Backwards compatible —
// the zero-schema constructors remain unchanged. Go's explicit signature
// diverges from Python's kwarg / JS's options-bag by language convention
// (see Decision 24).
func NewEvaluatorWithSchema(registry *transformers.TransformerRegistry, defaultTz string, columns *flyql.ColumnSchema) *Evaluator {
	if defaultTz == "" {
		defaultTz = "UTC"
	}
	return newEvaluator(registry, defaultTz, columns)
}

func newEvaluator(registry *transformers.TransformerRegistry, defaultTz string, columns *flyql.ColumnSchema) *Evaluator {
	if registry == nil {
		registry = transformers.DefaultRegistry()
	}
	if defaultTz == "" {
		defaultTz = "UTC"
	}
	return &Evaluator{
		regexCache:      make(map[string]*regexp.Regexp),
		registry:        registry,
		DefaultTimezone: defaultTz,
		Columns:         columns,
		tzCache:         make(map[string]*time.Location),
		migrationWarned: make(map[string]struct{}),
		invalidTzWarned: make(map[string]struct{}),
		tzNamesSeen:     make(map[string]struct{}),
	}
}

func (e *Evaluator) getRegex(pattern string) (*regexp.Regexp, error) {
	if cached, ok := e.regexCache[pattern]; ok {
		return cached, nil
	}

	regex, err := regexp.Compile(pattern)
	if err != nil {
		return nil, fmt.Errorf("invalid regex: %s -> %w", pattern, err)
	}

	e.regexCache[pattern] = regex
	return regex, nil
}

// resolveTz applies the tz-fallback order from Decision 25:
// colTz → fcTz → Evaluator.DefaultTimezone → "UTC". Invalid names warn
// once and degrade to UTC (F60).
func (e *Evaluator) resolveTz(colTz, fcTz string) *time.Location {
	name := colTz
	if name == "" {
		name = fcTz
	}
	if name == "" {
		name = e.DefaultTimezone
	}
	if name == "" {
		name = "UTC"
	}
	if loc, ok := e.tzCache[name]; ok {
		return loc
	}
	loc, err := time.LoadLocation(name)
	if err != nil {
		if _, warned := e.invalidTzWarned[name]; !warned {
			e.invalidTzWarned[name] = struct{}{}
			log.Printf("flyql: invalid timezone %q — falling back to UTC. Fix the column.tz / default_timezone / toDateTime() tz argument.", name)
		}
		utcLoc, ok := e.tzCache["UTC"]
		if !ok {
			utcLoc, _ = time.LoadLocation("UTC")
			if utcLoc == nil {
				utcLoc = time.UTC
			}
			e.tzCache["UTC"] = utcLoc
		}
		e.tzCache[name] = utcLoc
		e.tzNamesSeen[name] = struct{}{}
		return utcLoc
	}
	e.tzCache[name] = loc
	e.tzNamesSeen[name] = struct{}{}
	return loc
}

// resolveColumn looks up the Column schema entry for an Expression.
// Uncached: Go's pointer addresses can be reused after GC, which would
// make a pointer-keyed cache return stale hits for differently-keyed
// Expressions allocated at the reclaimed address (P1). The underlying
// ColumnSchema.Resolve is already an O(1) map lookup, so the win from
// caching was marginal compared to the correctness risk.
func (e *Evaluator) resolveColumn(expr *flyql.Expression) *flyql.Column {
	if expr == nil {
		return nil
	}
	if e.Columns != nil && len(expr.Key.Segments) > 0 {
		return e.Columns.Resolve(expr.Key.Segments)
	}
	return nil
}

func isFalsy(value any) bool {
	if value == nil {
		return true
	}
	switch v := value.(type) {
	case bool:
		return !v
	case int:
		return v == 0
	case int64:
		return v == 0
	case uint64:
		return v == 0
	case float64:
		return v == 0
	case string:
		return v == ""
	case []any:
		return len(v) == 0
	case map[string]any:
		return len(v) == 0
	}
	return false
}

func isTruthy(value any) bool {
	return !isFalsy(value)
}

func (e *Evaluator) Evaluate(node *flyql.Node, record *Record) (bool, error) {
	if node == nil {
		return false, nil
	}

	var result bool

	if node.Expression != nil {
		r, err := e.evalExpression(node.Expression, record)
		if err != nil {
			return false, err
		}
		result = r
	} else {
		var left, right *bool

		if node.Left != nil {
			r, err := e.Evaluate(node.Left, record)
			if err != nil {
				return false, err
			}
			left = &r
		}

		if node.Right != nil {
			r, err := e.Evaluate(node.Right, record)
			if err != nil {
				return false, err
			}
			right = &r
		}

		if left != nil && right != nil {
			switch node.BoolOperator {
			case flyql.BoolOpAnd:
				result = *left && *right
			case flyql.BoolOpOr:
				result = *left || *right
			default:
				return false, fmt.Errorf("unknown boolean operator: %s", node.BoolOperator)
			}
		} else if left != nil {
			result = *left
		} else if right != nil {
			result = *right
		} else {
			result = false
		}
	}

	if node.Negated {
		result = !result
	}

	return result, nil
}

var temporalEligibleKinds = map[literal.LiteralKind]struct{}{
	literal.String:   {},
	literal.Function: {},
	literal.Integer:  {},
	literal.Float:    {},
	literal.BigInt:   {},
}

func (e *Evaluator) evalExpression(expr *flyql.Expression, record *Record) (bool, error) {
	if expr.ValueType == literal.Parameter {
		if p, ok := expr.Value.(*flyql.Parameter); ok {
			return false, fmt.Errorf("unbound parameter '$%s' — call BindParams() before evaluating", p.Name)
		}
		return false, fmt.Errorf("unbound parameter — call BindParams() before evaluating")
	}
	for _, v := range expr.Values {
		if p, ok := v.(*flyql.Parameter); ok {
			return false, fmt.Errorf("unbound parameter '$%s' in IN list — call BindParams() before evaluating", p.Name)
		}
	}
	if fc, ok := expr.Value.(*flyql.FunctionCall); ok && len(fc.ParameterArgs) > 0 {
		return false, fmt.Errorf("unbound parameter(s) in function %s() — call BindParams() before evaluating", fc.Name)
	}
	key := NewKey(expr.Key.Raw)
	value := record.GetValue(key)

	if len(expr.Key.Transformers) > 0 {
		for _, t := range expr.Key.Transformers {
			transformer := e.registry.Get(t.Name)
			if transformer == nil {
				return false, fmt.Errorf("unknown transformer: %s", t.Name)
			}
			value = transformer.Apply(value, t.Arguments)
		}
	}

	// Resolve COLUMN-typed RHS values from the record
	exprValue := expr.Value
	if expr.ValueType == literal.Column {
		if strVal, ok := exprValue.(string); ok {
			rhsKey := NewKey(strVal)
			if _, exists := record.data[rhsKey.Value]; exists {
				exprValue = record.GetValue(rhsKey)
			}
		}
	}

	// Determine temporal context: schema-driven Date/DateTime OR
	// no-schema fallback (Go has no schemaless runtime introspection —
	// native time.Time values without schema flow through the legacy
	// coerceToMillis path via the FUNCTION branch below).
	col := e.resolveColumn(expr)
	var isDateCol, isDateTimeCol bool
	if col != nil {
		switch col.Type {
		case flyqltype.Date:
			isDateCol = true
		case flyqltype.DateTime:
			isDateTimeCol = true
		}
	}

	if isDateCol && col != nil {
		e.maybeWarnDateMigration(col, value)
	}

	temporal := isDateCol || isDateTimeCol
	coerced := false
	_, eligibleKind := temporalEligibleKinds[expr.ValueType]

	if temporal && eligibleKind && expr.Operator != flyql.OpIn && expr.Operator != flyql.OpNotIn {
		if isDateTimeCol {
			recCoerced, recOk := e.coerceToMillis(value, col)
			rhsCoerced, rhsOk, err := e.coerceLiteralToMs(exprValue, expr.ValueType, col)
			if err != nil {
				return false, err
			}
			if !recOk || !rhsOk {
				return false, nil
			}
			value = recCoerced
			exprValue = rhsCoerced
		} else {
			recCoerced, recOk := e.coerceToDate(value, col)
			rhsCoerced, rhsOk, err := e.coerceLiteralToDate(exprValue, expr.ValueType, col)
			if err != nil {
				return false, err
			}
			if !recOk || !rhsOk {
				return false, nil
			}
			value = recCoerced
			exprValue = rhsCoerced
		}
		coerced = true
	}

	// Schema-free legacy FUNCTION path
	if !coerced && expr.ValueType == literal.Function && expr.Operator != flyql.OpIn && expr.Operator != flyql.OpNotIn {
		fc, ok := expr.Value.(*flyql.FunctionCall)
		if !ok {
			return false, fmt.Errorf("expected FunctionCall value for function type")
		}
		ms, err := e.evaluateFunctionCall(fc)
		if err != nil {
			return false, err
		}
		exprValue = ms

		recMs, ok := e.coerceToMillis(value, nil)
		if !ok {
			return false, nil
		}
		value = recMs
	}

	switch expr.Operator {
	case flyql.OpTruthy:
		return isTruthy(value), nil
	case flyql.OpEquals:
		return compareEqual(value, exprValue), nil
	case flyql.OpNotEquals:
		if exprValue == nil {
			return !compareEqual(value, exprValue), nil
		}
		if value == nil {
			return false, nil
		}
		return !compareEqual(value, exprValue), nil
	case flyql.OpRegex:
		regex, err := e.getRegex(toString(exprValue))
		if err != nil {
			return false, err
		}
		return regex.MatchString(toString(value)), nil
	case flyql.OpNotRegex:
		if value == nil {
			return false, nil
		}
		regex, err := e.getRegex(toString(exprValue))
		if err != nil {
			return false, err
		}
		return !regex.MatchString(toString(value)), nil
	case flyql.OpLike:
		regex, err := e.getRegex(likeToRegex(toString(exprValue)))
		if err != nil {
			return false, err
		}
		return regex.MatchString(toString(value)), nil
	case flyql.OpNotLike:
		if value == nil {
			return false, nil
		}
		regex, err := e.getRegex(likeToRegex(toString(exprValue)))
		if err != nil {
			return false, err
		}
		return !regex.MatchString(toString(value)), nil
	case flyql.OpILike:
		regex, err := e.getRegex("(?i)" + likeToRegex(toString(exprValue)))
		if err != nil {
			return false, err
		}
		return regex.MatchString(toString(value)), nil
	case flyql.OpNotILike:
		if value == nil {
			return false, nil
		}
		regex, err := e.getRegex("(?i)" + likeToRegex(toString(exprValue)))
		if err != nil {
			return false, err
		}
		return !regex.MatchString(toString(value)), nil
	case flyql.OpGreater:
		return compareGreater(value, exprValue), nil
	case flyql.OpLess:
		return compareLess(value, exprValue), nil
	case flyql.OpGreaterOrEquals:
		return compareGreaterOrEqual(value, exprValue), nil
	case flyql.OpLessOrEquals:
		return compareLessOrEqual(value, exprValue), nil
	case flyql.OpIn:
		if len(expr.Values) == 0 {
			return false, nil
		}
		resolvedValues, err := e.resolveInValues(expr, record, col, isDateCol, isDateTimeCol)
		if err != nil {
			return false, err
		}
		if temporal {
			coercedVal, ok := e.coerceValueForTemporal(value, col, isDateCol)
			if !ok {
				return false, nil
			}
			value = coercedVal
		}
		return valueInList(value, resolvedValues), nil
	case flyql.OpNotIn:
		if len(expr.Values) == 0 {
			return true, nil
		}
		if value == nil {
			return false, nil
		}
		resolvedValues, err := e.resolveInValues(expr, record, col, isDateCol, isDateTimeCol)
		if err != nil {
			return false, err
		}
		if temporal {
			coercedVal, ok := e.coerceValueForTemporal(value, col, isDateCol)
			if !ok {
				return false, nil
			}
			value = coercedVal
		}
		return !valueInList(value, resolvedValues), nil
	case flyql.OpHas:
		return evalHas(value, exprValue), nil
	case flyql.OpNotHas:
		if value == nil {
			return false, nil
		}
		return !evalHas(value, exprValue), nil
	default:
		return false, fmt.Errorf("unknown expression operator: %s", expr.Operator)
	}
}

func (e *Evaluator) coerceValueForTemporal(value any, col *flyql.Column, isDateCol bool) (any, bool) {
	if isDateCol {
		return e.coerceToDate(value, col)
	}
	return e.coerceToMillis(value, col)
}

func (e *Evaluator) resolveInValues(expr *flyql.Expression, record *Record, col *flyql.Column, isDateCol, isDateTimeCol bool) ([]any, error) {
	resolved := make([]any, 0, len(expr.Values))
	for i, v := range expr.Values {
		var vt literal.LiteralKind
		if i < len(expr.ValuesTypes) {
			vt = expr.ValuesTypes[i]
		}
		if vt == literal.Column {
			if strVal, ok := v.(string); ok {
				rhsKey := NewKey(strVal)
				if _, exists := record.data[rhsKey.Value]; exists {
					resolved = append(resolved, record.GetValue(rhsKey))
					continue
				}
			}
			resolved = append(resolved, v)
			continue
		}
		if _, eligible := temporalEligibleKinds[vt]; (isDateCol || isDateTimeCol) && eligible {
			var coercedVal any
			var ok bool
			var err error
			if isDateTimeCol {
				coercedVal, ok, err = e.coerceLiteralToMs(v, vt, col)
			} else {
				coercedVal, ok, err = e.coerceLiteralToDate(v, vt, col)
			}
			if err != nil {
				return nil, err
			}
			if ok {
				resolved = append(resolved, coercedVal)
			}
			continue
		}
		resolved = append(resolved, v)
	}
	return resolved, nil
}

func (e *Evaluator) coerceLiteralToMs(v any, vt literal.LiteralKind, col *flyql.Column) (int64, bool, error) {
	if vt == literal.Function {
		fc, ok := v.(*flyql.FunctionCall)
		if !ok {
			return 0, false, nil
		}
		ms, err := e.evaluateFunctionCall(fc)
		if err != nil {
			return 0, false, err
		}
		return ms, true, nil
	}
	ms, ok := e.coerceToMillis(v, col)
	if !ok {
		return 0, false, nil
	}
	// coerceToMillis returns any; it must be int64.
	msInt, okInt := ms.(int64)
	if !okInt {
		return 0, false, nil
	}
	return msInt, true, nil
}

func (e *Evaluator) coerceLiteralToDate(v any, vt literal.LiteralKind, col *flyql.Column) (int64, bool, error) {
	if vt == literal.Function {
		fc, ok := v.(*flyql.FunctionCall)
		if !ok {
			return 0, false, nil
		}
		ms, err := e.evaluateFunctionCall(fc)
		if err != nil {
			return 0, false, err
		}
		loc := e.resolveTz(colTz(col), "")
		t := time.UnixMilli(ms).In(loc)
		return packDate(t.Year(), int(t.Month()), t.Day()), true, nil
	}
	packed, ok := e.coerceToDate(v, col)
	if !ok {
		return 0, false, nil
	}
	packedInt, okInt := packed.(int64)
	if !okInt {
		return 0, false, nil
	}
	return packedInt, true, nil
}

func (e *Evaluator) maybeWarnDateMigration(col *flyql.Column, value any) {
	key := col.MatchName
	if key == "" {
		key = col.Name
	}
	if _, ok := e.migrationWarned[key]; ok {
		return
	}
	triggered := false
	switch v := value.(type) {
	case time.Time:
		triggered = true
		_ = v
	case string:
		if datetimeShapedStrRE.MatchString(v) {
			triggered = true
		}
	}
	if !triggered {
		return
	}
	e.migrationWarned[key] = struct{}{}
	log.Printf("flyql: column %q is declared Type.Date but received a datetime-shaped value — did you mean Type.DateTime? See migration guide: https://docs.flyql.dev/syntax/dates", col.Name)
}

func colTz(col *flyql.Column) string {
	if col == nil {
		return ""
	}
	return col.TZ
}

func colUnit(col *flyql.Column) string {
	if col == nil {
		return ""
	}
	return col.Unit
}

func likeToRegex(pattern string) string {
	var result strings.Builder
	result.WriteByte('^')
	runes := []rune(pattern)
	for i := 0; i < len(runes); i++ {
		ch := runes[i]
		if ch == '\\' && i+1 < len(runes) {
			next := runes[i+1]
			if next == '%' || next == '_' {
				// Escaped wildcard: literal character
				result.WriteRune(next)
				i++
				continue
			}
		}
		switch ch {
		case '%':
			result.WriteString(".*")
		case '_':
			result.WriteByte('.')
		case '.', '[', ']', '{', '(', ')', '*', '+', '?', '^', '$', '|', '\\':
			result.WriteByte('\\')
			result.WriteRune(ch)
		default:
			result.WriteRune(ch)
		}
	}
	result.WriteByte('$')
	return result.String()
}

func toString(v any) string {
	if v == nil {
		return ""
	}
	switch val := v.(type) {
	case string:
		return val
	case float64:
		return fmt.Sprintf("%v", val)
	case int:
		return fmt.Sprintf("%d", val)
	default:
		return fmt.Sprintf("%v", val)
	}
}

func toFloat(v any) (float64, bool) {
	switch val := v.(type) {
	case float64:
		return val, true
	case int:
		return float64(val), true
	case int64:
		return float64(val), true
	case uint64:
		return float64(val), true
	default:
		return 0, false
	}
}

type intVal struct {
	i64    int64
	u64    uint64
	isUint bool
}

func toIntVal(v any) (intVal, bool) {
	switch val := v.(type) {
	case int:
		return intVal{i64: int64(val)}, true
	case int64:
		return intVal{i64: val}, true
	case uint64:
		return intVal{u64: val, isUint: true}, true
	}
	return intVal{}, false
}

func compareIntVals(a, b intVal) int {
	if !a.isUint && !b.isUint {
		if a.i64 < b.i64 {
			return -1
		}
		if a.i64 > b.i64 {
			return 1
		}
		return 0
	}
	if a.isUint && b.isUint {
		if a.u64 < b.u64 {
			return -1
		}
		if a.u64 > b.u64 {
			return 1
		}
		return 0
	}
	if a.isUint {
		if b.i64 < 0 {
			return 1
		}
		if a.u64 < uint64(b.i64) {
			return -1
		}
		if a.u64 > uint64(b.i64) {
			return 1
		}
		return 0
	}
	if a.i64 < 0 {
		return -1
	}
	if uint64(a.i64) < b.u64 {
		return -1
	}
	if uint64(a.i64) > b.u64 {
		return 1
	}
	return 0
}

func tryCompareInts(a, b any) (int, bool) {
	ai, aOk := toIntVal(a)
	bi, bOk := toIntVal(b)
	if !aOk || !bOk {
		return 0, false
	}
	return compareIntVals(ai, bi), true
}

func compareEqual(a, b any) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}

	if cmp, ok := tryCompareInts(a, b); ok {
		return cmp == 0
	}

	aFloat, aIsNum := toFloat(a)
	bFloat, bIsNum := toFloat(b)

	if aIsNum && bIsNum {
		return aFloat == bFloat
	}

	return a == b
}

func compareGreater(a, b any) bool {
	if cmp, ok := tryCompareInts(a, b); ok {
		return cmp > 0
	}
	aFloat, aOk := toFloat(a)
	bFloat, bOk := toFloat(b)
	if aOk && bOk {
		return aFloat > bFloat
	}
	if aStr, ok := a.(string); ok {
		if bStr, ok := b.(string); ok {
			return aStr > bStr
		}
	}
	return false
}

func compareLess(a, b any) bool {
	if cmp, ok := tryCompareInts(a, b); ok {
		return cmp < 0
	}
	aFloat, aOk := toFloat(a)
	bFloat, bOk := toFloat(b)
	if aOk && bOk {
		return aFloat < bFloat
	}
	if aStr, ok := a.(string); ok {
		if bStr, ok := b.(string); ok {
			return aStr < bStr
		}
	}
	return false
}

func compareGreaterOrEqual(a, b any) bool {
	if cmp, ok := tryCompareInts(a, b); ok {
		return cmp >= 0
	}
	aFloat, aOk := toFloat(a)
	bFloat, bOk := toFloat(b)
	if aOk && bOk {
		return aFloat >= bFloat
	}
	if aStr, ok := a.(string); ok {
		if bStr, ok := b.(string); ok {
			return aStr >= bStr
		}
	}
	return false
}

func compareLessOrEqual(a, b any) bool {
	if cmp, ok := tryCompareInts(a, b); ok {
		return cmp <= 0
	}
	aFloat, aOk := toFloat(a)
	bFloat, bOk := toFloat(b)
	if aOk && bOk {
		return aFloat <= bFloat
	}
	if aStr, ok := a.(string); ok {
		if bStr, ok := b.(string); ok {
			return aStr <= bStr
		}
	}
	return false
}

func evalHas(value any, exprValue any) bool {
	if value == nil {
		return false
	}
	switch v := value.(type) {
	case string:
		return strings.Contains(v, toString(exprValue))
	case map[string]any:
		_, exists := v[toString(exprValue)]
		return exists
	case []any:
		for _, item := range v {
			if compareEqual(item, exprValue) {
				return true
			}
		}
		return false
	default:
		return false
	}
}

func valueInList(value any, list []any) bool {
	for _, item := range list {
		if compareEqual(value, item) {
			return true
		}
	}
	return false
}

var durationUnitToMs = map[string]int64{
	"s": 1000,
	"m": 60000,
	"h": 3600000,
	"d": 86400000,
	"w": 604800000,
}

func sumDurations(durations []flyql.Duration) int64 {
	var total int64
	for _, d := range durations {
		multiplier, ok := durationUnitToMs[d.Unit]
		if ok {
			total += d.Value * multiplier
		}
	}
	return total
}

func (e *Evaluator) evaluateFunctionCall(fc *flyql.FunctionCall) (int64, error) {
	switch fc.Name {
	case "now":
		return time.Now().UnixMilli(), nil

	case "ago":
		offset := sumDurations(fc.DurationArgs)
		return time.Now().UnixMilli() - offset, nil

	case "today":
		loc := e.resolveTz("", fc.Timezone)
		now := time.Now().In(loc)
		midnight := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
		return midnight.UnixMilli(), nil

	case "startOf":
		loc := e.resolveTz("", fc.Timezone)
		now := time.Now().In(loc)

		switch fc.Unit {
		case "day":
			midnight := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
			return midnight.UnixMilli(), nil
		case "week":
			weekday := now.Weekday()
			daysFromMonday := (int(weekday) + 6) % 7
			monday := now.AddDate(0, 0, -daysFromMonday)
			start := time.Date(monday.Year(), monday.Month(), monday.Day(), 0, 0, 0, 0, loc)
			return start.UnixMilli(), nil
		case "month":
			start := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, loc)
			return start.UnixMilli(), nil
		default:
			return 0, fmt.Errorf("unsupported startOf unit: %s", fc.Unit)
		}

	default:
		return 0, fmt.Errorf("unsupported function: %s", fc.Name)
	}
}

// packDate packs a Y/M/D triple into a single int64 (Y*10000 + M*100 + D)
// whose numeric ordering mirrors calendar ordering (Decision 27).
func packDate(year, month, day int) int64 {
	return int64(year)*10000 + int64(month)*100 + int64(day)
}

func numericToMs(f float64, unit string) (int64, bool) {
	// P5: explicit bounds check for int64 before conversion. Without it,
	// `int64(f * 1000)` silently wraps for float values beyond the int64
	// range, producing garbage ms. NaN/Inf also return false.
	const int64MaxFloat = float64(math.MaxInt64)
	const int64MinFloat = float64(math.MinInt64)
	var scaled float64
	switch unit {
	case "", "ms":
		scaled = f
	case "s":
		scaled = f * 1000
	case "ns":
		scaled = f / 1_000_000
	default:
		return 0, false
	}
	if math.IsNaN(scaled) || math.IsInf(scaled, 0) {
		return 0, false
	}
	if scaled > int64MaxFloat || scaled < int64MinFloat {
		return 0, false
	}
	return int64(scaled), true
}

func numericUnitToMs(value any, unit string) (int64, bool) {
	// Explicit bool rejection (P11) — Go's type switch normally routes
	// bool to the default case, but we reject bool values explicitly so
	// the Python/Go/JS contract is identical: a boolean record value on
	// a DateTime column is un-coerceable and skips the record.
	if _, isBool := value.(bool); isBool {
		return 0, false
	}
	switch v := value.(type) {
	case int:
		return numericToMs(float64(v), unit)
	case int8:
		return numericToMs(float64(v), unit)
	case int16:
		return numericToMs(float64(v), unit)
	case int32:
		return numericToMs(float64(v), unit)
	case int64:
		return numericToMs(float64(v), unit)
	case uint:
		return numericToMs(float64(v), unit)
	case uint8:
		return numericToMs(float64(v), unit)
	case uint16:
		return numericToMs(float64(v), unit)
	case uint32:
		return numericToMs(float64(v), unit)
	case uint64:
		return numericToMs(float64(v), unit)
	case float32:
		return numericToMs(float64(v), unit)
	case float64:
		return numericToMs(v, unit)
	default:
		return 0, false
	}
}

// coerceToMillis returns (int64, true) on success or (nil, false) on failure.
// The old (schema-free) signature `coerceToMillis(value) any` is preserved
// for backward compat via the one-arg wrapper when col is nil.
func (e *Evaluator) coerceToMillis(value any, col *flyql.Column) (any, bool) {
	if value == nil {
		return nil, false
	}
	switch v := value.(type) {
	case time.Time:
		return v.UnixMilli(), true
	}
	if ms, ok := numericUnitToMs(value, colUnit(col)); ok {
		return ms, true
	}
	switch v := value.(type) {
	case string:
		return e.parseIsoStringToMs(v, col)
	}
	return nil, false
}

// coerceToDate returns (int64 packed Y*10000+M*100+D, true) or (nil, false).
func (e *Evaluator) coerceToDate(value any, col *flyql.Column) (any, bool) {
	if value == nil {
		return nil, false
	}
	switch v := value.(type) {
	case time.Time:
		loc := e.resolveTz(colTz(col), "")
		local := v.In(loc)
		return packDate(local.Year(), int(local.Month()), local.Day()), true
	}
	if ms, ok := numericUnitToMs(value, colUnit(col)); ok {
		loc := e.resolveTz(colTz(col), "")
		t := time.UnixMilli(ms).In(loc)
		return packDate(t.Year(), int(t.Month()), t.Day()), true
	}
	if s, ok := value.(string); ok {
		// Date-only YYYY-MM-DD fast path
		if len(s) == 10 && s[4] == '-' && s[7] == '-' {
			t, err := time.Parse("2006-01-02", s)
			if err == nil {
				return packDate(t.Year(), int(t.Month()), t.Day()), true
			}
		}
		msAny, ok := e.parseIsoStringToMs(s, col)
		if !ok {
			return nil, false
		}
		ms, _ := msAny.(int64)
		loc := e.resolveTz(colTz(col), "")
		t := time.UnixMilli(ms).In(loc)
		return packDate(t.Year(), int(t.Month()), t.Day()), true
	}
	return nil, false
}

// parseIsoStringToMs parses a lenient iso8601 string to UnixMilli.
// Fast-path rejects strings with no date-shape characters. Splits
// offset-bearing layouts (time.Parse) from naive layouts
// (time.ParseInLocation) per F6.
func (e *Evaluator) parseIsoStringToMs(s string, col *flyql.Column) (any, bool) {
	if s == "" {
		return nil, false
	}
	// Fast-path: if no date-shape delimiters and all digits, skip.
	hasDelim := strings.ContainsAny(s, "-T:/")
	if !hasDelim {
		digitsOnly := true
		for _, r := range s {
			if r < '0' || r > '9' {
				digitsOnly = false
				break
			}
		}
		if digitsOnly {
			return nil, false
		}
	}

	// Try offset-bearing layouts first.
	offsetLayouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02T15:04:05.999999999Z07:00",
		"2006-01-02T15:04:05Z07:00",
		"2006-01-02 15:04:05Z07:00",
	}
	for _, layout := range offsetLayouts {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UnixMilli(), true
		}
	}

	// Naive layouts (no offset) — use ParseInLocation so column tz applies.
	loc := e.resolveTz(colTz(col), "")
	naiveLayouts := []string{
		"2006-01-02T15:04:05.999999999",
		"2006-01-02T15:04:05",
		"2006-01-02 15:04:05.999999999",
		"2006-01-02 15:04:05",
		"2006-01-02",
	}
	for _, layout := range naiveLayouts {
		t, err := time.ParseInLocation(layout, s, loc)
		if err != nil {
			continue
		}
		// DST spring-forward detection (Decision 19): re-project and
		// compare. Go's ParseInLocation silently normalizes forward,
		// so an explicit check is required.
		roundtrip := t.In(loc).Format(layout)
		if roundtrip != s {
			// Only reject when mismatch is time-of-day-significant
			// (not a trailing-zero difference).
			if !equalIgnoringFractional(roundtrip, s) {
				return nil, false
			}
		}
		return t.UnixMilli(), true
	}
	return nil, false
}

// fractionalSecondsRE matches the sub-second fragment ".ddd..." so the
// lenient compare in equalIgnoringFractional can strip fractional
// precision differences without also stripping arbitrary trailing zeros
// from other fields (P9).
var fractionalSecondsRE = regexp.MustCompile(`\.\d+`)

// equalIgnoringFractional compares two formatted timestamps treating
// only sub-second differences as equivalent (trailing-zero rounding
// from Go's Format output). Any difference in Y/M/D/H/M/S is a genuine
// mismatch and returns false — so a DST-gap forward-normalization
// (e.g. 02:30 → 03:30) is always rejected.
func equalIgnoringFractional(a, b string) bool {
	strip := func(s string) string { return fractionalSecondsRE.ReplaceAllString(s, "") }
	return strip(a) == strip(b)
}

// ErrNilColumn is returned by internal helpers when a column is required.
var ErrNilColumn = errors.New("nil column")
