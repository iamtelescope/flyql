package matcher

import (
	"fmt"
	"regexp"
	"strings"
	"time"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/transformers"
	"github.com/iamtelescope/flyql/golang/types"
)

type Evaluator struct {
	regexCache      map[string]*regexp.Regexp
	registry        *transformers.TransformerRegistry
	DefaultTimezone string
}

func NewEvaluator() *Evaluator {
	return NewEvaluatorWithRegistry(nil)
}

func NewEvaluatorWithRegistry(registry *transformers.TransformerRegistry) *Evaluator {
	if registry == nil {
		registry = transformers.DefaultRegistry()
	}
	return &Evaluator{
		regexCache:      make(map[string]*regexp.Regexp),
		registry:        registry,
		DefaultTimezone: "UTC",
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

func (e *Evaluator) evalExpression(expr *flyql.Expression, record *Record) (bool, error) {
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
	if expr.ValueType == types.Column {
		if strVal, ok := exprValue.(string); ok {
			rhsKey := NewKey(strVal)
			if _, exists := record.data[rhsKey.Value]; exists {
				exprValue = record.GetValue(rhsKey)
			}
		}
	}

	// Resolve FUNCTION-typed RHS values to milliseconds since epoch
	if expr.ValueType == types.Function {
		fc, ok := expr.Value.(*flyql.FunctionCall)
		if !ok {
			return false, fmt.Errorf("expected FunctionCall value for function type")
		}
		defaultTz := e.DefaultTimezone
		if defaultTz == "" {
			defaultTz = "UTC"
		}
		ms, err := evaluateFunctionCall(fc, defaultTz)
		if err != nil {
			return false, err
		}
		exprValue = ms

		// Coerce the LHS record value to milliseconds for comparison
		value = coerceToMillis(value)
		if value == nil {
			return false, nil
		}
	}

	switch expr.Operator {
	case flyql.OpTruthy:
		return isTruthy(value), nil
	case flyql.OpEquals:
		return compareEqual(value, exprValue), nil
	case flyql.OpNotEquals:
		return !compareEqual(value, exprValue), nil
	case flyql.OpRegex:
		regex, err := e.getRegex(toString(exprValue))
		if err != nil {
			return false, err
		}
		return regex.MatchString(toString(value)), nil
	case flyql.OpNotRegex:
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
		resolvedValues := e.resolveInValues(expr, record)
		return valueInList(value, resolvedValues), nil
	case flyql.OpNotIn:
		if len(expr.Values) == 0 {
			return true, nil
		}
		resolvedValues := e.resolveInValues(expr, record)
		return !valueInList(value, resolvedValues), nil
	case flyql.OpHas:
		return evalHas(value, exprValue), nil
	case flyql.OpNotHas:
		if value == nil {
			return true, nil
		}
		return !evalHas(value, exprValue), nil
	default:
		return false, fmt.Errorf("unknown expression operator: %s", expr.Operator)
	}
}

func (e *Evaluator) resolveInValues(expr *flyql.Expression, record *Record) []any {
	if len(expr.ValuesTypes) == 0 {
		return expr.Values
	}
	resolved := make([]any, len(expr.Values))
	for i, v := range expr.Values {
		if i < len(expr.ValuesTypes) && expr.ValuesTypes[i] == types.Column {
			if strVal, ok := v.(string); ok {
				rhsKey := NewKey(strVal)
				if _, exists := record.data[rhsKey.Value]; exists {
					resolved[i] = record.GetValue(rhsKey)
					continue
				}
			}
		}
		resolved[i] = v
	}
	return resolved
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

func evaluateFunctionCall(fc *flyql.FunctionCall, defaultTz string) (int64, error) {
	switch fc.Name {
	case "now":
		return time.Now().UnixMilli(), nil

	case "ago":
		offset := sumDurations(fc.DurationArgs)
		return time.Now().UnixMilli() - offset, nil

	case "today":
		tz := fc.Timezone
		if tz == "" {
			tz = defaultTz
		}
		loc, err := time.LoadLocation(tz)
		if err != nil {
			return 0, fmt.Errorf("invalid timezone %q: %w", tz, err)
		}
		now := time.Now().In(loc)
		midnight := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
		return midnight.UnixMilli(), nil

	case "startOf":
		tz := fc.Timezone
		if tz == "" {
			tz = defaultTz
		}
		loc, err := time.LoadLocation(tz)
		if err != nil {
			return 0, fmt.Errorf("invalid timezone %q: %w", tz, err)
		}
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

func coerceToMillis(value any) any {
	if value == nil {
		return nil
	}
	switch v := value.(type) {
	case int64:
		return v
	case int:
		return int64(v)
	case uint64:
		return int64(v)
	case float64:
		return int64(v)
	case string:
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			// Try RFC3339Nano as well
			t, err = time.Parse(time.RFC3339Nano, v)
			if err != nil {
				return nil
			}
		}
		return t.UnixMilli()
	default:
		return nil
	}
}
