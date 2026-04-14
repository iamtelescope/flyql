package postgresql

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/flyqltype"
	"github.com/iamtelescope/flyql/golang/literal"
	"github.com/iamtelescope/flyql/golang/transformers"
)

func applyTransformerSQL(columnRef string, keyTransformers []flyql.Transformer, dialect string, registry *transformers.TransformerRegistry) (string, error) {
	result := columnRef
	for _, t := range keyTransformers {
		transformer := registry.Get(t.Name)
		if transformer == nil {
			return "", fmt.Errorf("unknown transformer: %s", t.Name)
		}
		schema := transformer.ArgSchema()
		requiredCount := 0
		for _, s := range schema {
			if s.Required {
				requiredCount++
			}
		}
		maxCount := len(schema)
		got := len(t.Arguments)
		if got < requiredCount || got > maxCount {
			if requiredCount == maxCount {
				return "", fmt.Errorf("%s expects %d arguments, got %d", t.Name, requiredCount, got)
			}
			return "", fmt.Errorf("%s expects %d..%d arguments, got %d", t.Name, requiredCount, maxCount, got)
		}
		result = transformer.SQL(dialect, result, t.Arguments)
	}
	return result, nil
}

func validateTransformerChain(keyTransformers []flyql.Transformer, registry *transformers.TransformerRegistry) error {
	currentType := flyqltype.String
	for i, t := range keyTransformers {
		transformer := registry.Get(t.Name)
		if transformer == nil {
			return fmt.Errorf("unknown transformer: %s", t.Name)
		}
		if transformer.InputType() != currentType {
			return fmt.Errorf("transformer chain type error: '%s' at position %d requires %s input, but received %s",
				t.Name, i, transformer.InputType(), currentType)
		}
		currentType = transformer.OutputType()
	}
	return nil
}

var validOperators = map[string]bool{
	flyql.OpEquals:          true,
	flyql.OpNotEquals:       true,
	flyql.OpRegex:           true,
	flyql.OpNotRegex:        true,
	flyql.OpGreater:         true,
	flyql.OpLess:            true,
	flyql.OpGreaterOrEquals: true,
	flyql.OpLessOrEquals:    true,
	flyql.OpIn:              true,
	flyql.OpNotIn:           true,
	flyql.OpHas:             true,
	flyql.OpNotHas:          true,
	flyql.OpLike:            true,
	flyql.OpNotLike:         true,
	flyql.OpILike:           true,
	flyql.OpNotILike:        true,
}

var validBoolOperators = map[string]bool{
	flyql.BoolOpAnd: true,
	flyql.BoolOpOr:  true,
}

var boolOpToSQL = map[string]string{
	flyql.BoolOpAnd: "AND",
	flyql.BoolOpOr:  "OR",
}

func validateOperator(op string) error {
	if !validOperators[op] {
		return fmt.Errorf("invalid operator: %s", op)
	}
	return nil
}

func validateBoolOperator(op string) error {
	if !validBoolOperators[op] {
		return fmt.Errorf("invalid bool operator: %s", op)
	}
	return nil
}

var jsonKeyPattern = regexp.MustCompile(`^[a-zA-Z_][.a-zA-Z0-9_-]*$`)

var escapeCharsMap = map[rune]string{
	'\b':   "\\b",
	'\f':   "\\f",
	'\r':   "\\r",
	'\n':   "\\n",
	'\t':   "\\t",
	'\x00': "\\0",
	'\a':   "\\a",
	'\v':   "\\v",
	'\\':   "\\\\",
	'\'':   "\\'",
}

func validateJSONPathPart(part string, quoted bool) error {
	if quoted {
		return nil
	}
	if part == "" {
		return fmt.Errorf("invalid JSON path part")
	}
	if idx, err := strconv.Atoi(part); err == nil && idx >= 0 {
		return nil
	}
	if !jsonKeyPattern.MatchString(part) {
		return fmt.Errorf("invalid JSON path part")
	}
	return nil
}

type GeneratorOptions struct {
	DefaultTimezone string
}

func NewGeneratorOptions() *GeneratorOptions {
	return &GeneratorOptions{DefaultTimezone: "UTC"}
}

var durationUnitToPostgreSQL = map[string]string{
	"s": "seconds",
	"m": "minutes",
	"h": "hours",
	"d": "days",
}

func escapeStringValue(s string) string {
	var sb strings.Builder
	sb.WriteRune('\'')
	for _, c := range s {
		if escaped, ok := escapeCharsMap[c]; ok {
			sb.WriteString(escaped)
		} else {
			sb.WriteRune(c)
		}
	}
	sb.WriteRune('\'')
	return sb.String()
}

func functionCallToPostgreSQLSQL(fc *flyql.FunctionCall, defaultTz string) (string, error) {
	resolveTz := func(explicit string) string {
		if explicit != "" {
			return explicit
		}
		if defaultTz != "" {
			return defaultTz
		}
		return "UTC"
	}

	switch fc.Name {
	case "ago":
		var parts []string
		for _, d := range fc.DurationArgs {
			val := d.Value
			unit := d.Unit
			if unit == "w" {
				val = val * 7
				unit = "d"
			}
			pgUnit, ok := durationUnitToPostgreSQL[unit]
			if !ok {
				return "", fmt.Errorf("unsupported duration unit: %s", unit)
			}
			parts = append(parts, fmt.Sprintf("INTERVAL '%d %s'", val, pgUnit))
		}
		return "(NOW() - " + strings.Join(parts, " - ") + ")", nil

	case "now":
		return "NOW()", nil

	case "today":
		tz := resolveTz(fc.Timezone)
		return fmt.Sprintf("(NOW() AT TIME ZONE %s)::date", escapeStringValue(tz)), nil

	case "startOf":
		tz := resolveTz(fc.Timezone)
		escapedTz := escapeStringValue(tz)
		switch fc.Unit {
		case "day":
			return fmt.Sprintf("date_trunc('day', NOW() AT TIME ZONE %s) AT TIME ZONE %s", escapedTz, escapedTz), nil
		case "week":
			return fmt.Sprintf("date_trunc('week', NOW() AT TIME ZONE %s) AT TIME ZONE %s", escapedTz, escapedTz), nil
		case "month":
			return fmt.Sprintf("date_trunc('month', NOW() AT TIME ZONE %s) AT TIME ZONE %s", escapedTz, escapedTz), nil
		default:
			return "", fmt.Errorf("unsupported startOf unit: %s", fc.Unit)
		}

	default:
		return "", fmt.Errorf("unsupported function: %s", fc.Name)
	}
}

func escapeLikeParam(value string) string {
	runes := []rune(value)
	var likeEscaped strings.Builder
	for i := 0; i < len(runes); i++ {
		c := runes[i]
		if c == '\\' {
			if i+1 < len(runes) && (runes[i+1] == '%' || runes[i+1] == '_') {
				likeEscaped.WriteRune(c)
				likeEscaped.WriteRune(runes[i+1])
				i++
			} else {
				likeEscaped.WriteString("\\\\")
			}
		} else {
			likeEscaped.WriteRune(c)
		}
	}
	result, _ := EscapeParam(likeEscaped.String())
	return result
}

func EscapeParam(item any) (string, error) {
	if item == nil {
		return "NULL", nil
	}

	switch v := item.(type) {
	case string:
		var sb strings.Builder
		sb.WriteRune('\'')
		for _, c := range v {
			if escaped, ok := escapeCharsMap[c]; ok {
				sb.WriteString(escaped)
			} else {
				sb.WriteRune(c)
			}
		}
		sb.WriteRune('\'')
		return sb.String(), nil
	case bool:
		if v {
			return "true", nil
		}
		return "false", nil
	case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64:
		return fmt.Sprintf("%d", v), nil
	case float32:
		if math.IsInf(float64(v), 0) || math.IsNaN(float64(v)) {
			return "", fmt.Errorf("unsupported numeric value for EscapeParam: %v", v)
		}
		return strconv.FormatFloat(float64(v), 'f', -1, 32), nil
	case float64:
		if math.IsInf(v, 0) || math.IsNaN(v) {
			return "", fmt.Errorf("unsupported numeric value for EscapeParam: %v", v)
		}
		return strconv.FormatFloat(v, 'f', -1, 64), nil
	default:
		return "", fmt.Errorf("unsupported type for EscapeParam: %T", v)
	}
}

func EscapeIdentifier(name string) string {
	escaped := strings.ReplaceAll(name, `"`, `""`)
	return fmt.Sprintf(`"%s"`, escaped)
}

// getIdentifier returns the SQL identifier for a column. If the column has a
// RawIdentifier set it is returned as-is; otherwise the column Name is escaped
// with double quotes via EscapeIdentifier.
func getIdentifier(column *Column) string {
	if column.RawIdentifier != "" {
		return column.RawIdentifier
	}
	return EscapeIdentifier(column.Name)
}

func IsNumber(value any) bool {
	switch v := value.(type) {
	case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64, float32, float64:
		return true
	case string:
		if _, err := strconv.ParseFloat(v, 64); err == nil {
			return true
		}
		if _, err := strconv.ParseInt(v, 10, 64); err == nil {
			return true
		}
		return false
	default:
		return false
	}
}

func resolveRhsColumnRef(value string, columns map[string]*Column) (string, bool) {
	key, err := flyql.ParseKey(value, 0)
	if err != nil {
		return "", false
	}
	column, path, pathQuoted, err := resolveColumn(key, columns)
	if err != nil {
		return "", false
	}
	ref, err := buildSelectExpr(getIdentifier(column), column, path, pathQuoted)
	if err != nil {
		return "", false
	}
	return ref, true
}

func ExpressionToSQL(expr *flyql.Expression, columns map[string]*Column, registry ...*transformers.TransformerRegistry) (string, error) {
	return ExpressionToSQLWithOptions(expr, columns, nil, registry...)
}

func ExpressionToSQLWithOptions(expr *flyql.Expression, columns map[string]*Column, options *GeneratorOptions, registry ...*transformers.TransformerRegistry) (string, error) {
	if expr.ValueType == literal.Parameter {
		if p, ok := expr.Value.(*flyql.Parameter); ok {
			return "", fmt.Errorf("unbound parameter '$%s' — call BindParams() before generating SQL", p.Name)
		}
		return "", fmt.Errorf("unbound parameter — call BindParams() before generating SQL")
	}
	for _, v := range expr.Values {
		if p, ok := v.(*flyql.Parameter); ok {
			return "", fmt.Errorf("unbound parameter '$%s' in IN list — call BindParams() before generating SQL", p.Name)
		}
	}
	if fc, ok := expr.Value.(*flyql.FunctionCall); ok && len(fc.ParameterArgs) > 0 {
		return "", fmt.Errorf("unbound parameter(s) in function %s() — call BindParams() before generating SQL", fc.Name)
	}
	var reg *transformers.TransformerRegistry
	if len(registry) > 0 && registry[0] != nil {
		reg = registry[0]
	} else {
		reg = transformers.DefaultRegistry()
	}
	if expr.Operator == flyql.OpTruthy {
		return truthyExpressionToSQL(expr, columns)
	}
	if expr.Operator == flyql.OpIn || expr.Operator == flyql.OpNotIn {
		return inExpressionToSQL(expr, columns)
	}
	if expr.Operator == flyql.OpHas || expr.Operator == flyql.OpNotHas {
		return hasExpressionToSQL(expr, columns)
	}
	if err := validateOperator(expr.Operator); err != nil {
		return "", err
	}
	if expr.Key.IsSegmented() {
		return expressionToSQLSegmented(expr, columns)
	}
	return expressionToSQLSimpleWithOptions(expr, columns, reg, options)
}

func buildJSONBPath(identifier string, pathParts []string, quoted []bool) string {
	if len(pathParts) == 0 {
		return identifier
	}
	var sb strings.Builder
	sb.WriteString(identifier)
	for i, part := range pathParts {
		isQuoted := i < len(quoted) && quoted[i]
		isLast := i == len(pathParts)-1
		if !isQuoted {
			if idx, err := strconv.Atoi(part); err == nil && idx >= 0 {
				if isLast {
					sb.WriteString(fmt.Sprintf("->>%d", idx))
				} else {
					sb.WriteString(fmt.Sprintf("->%d", idx))
				}
				continue
			}
		}
		escaped, _ := EscapeParam(part)
		if isLast {
			sb.WriteString("->>")
		} else {
			sb.WriteString("->")
		}
		sb.WriteString(escaped)
	}
	return sb.String()
}

// buildJSONBPathRaw builds a JSONB path using -> for all parts, returning a jsonb
// value rather than text. Used for numeric comparisons where type matters.
func buildJSONBPathRaw(identifier string, pathParts []string, quoted []bool) string {
	if len(pathParts) == 0 {
		return identifier
	}
	var sb strings.Builder
	sb.WriteString(identifier)
	for i, part := range pathParts {
		isQuoted := i < len(quoted) && quoted[i]
		if !isQuoted {
			if idx, err := strconv.Atoi(part); err == nil && idx >= 0 {
				sb.WriteString(fmt.Sprintf("->%d", idx))
				continue
			}
		}
		escaped, _ := EscapeParam(part)
		sb.WriteString("->")
		sb.WriteString(escaped)
	}
	return sb.String()
}

func inExpressionToSQL(expr *flyql.Expression, columns map[string]*Column) (string, error) {
	isNotIn := expr.Operator == flyql.OpNotIn

	if len(expr.Values) == 0 {
		if isNotIn {
			return "TRUE", nil
		}
		return "FALSE", nil
	}

	columnName := expr.Key.Segments[0]
	column, ok := columns[columnName]
	if !ok {
		return "", fmt.Errorf("unknown column: %s", columnName)
	}

	isHeterogeneous := len(expr.ValuesTypes) > 0 && func() bool {
		first := expr.ValuesTypes[0]
		for _, vt := range expr.ValuesTypes[1:] {
			if vt != first {
				return true
			}
		}
		return false
	}()
	if column.FlyQLType() != "" && !expr.Key.IsSegmented() && !isHeterogeneous {
		if err := ValidateInListTypes(expr.Values, column.FlyQLType()); err != nil {
			return "", err
		}
	}

	valueParts := make([]string, len(expr.Values))
	for i, v := range expr.Values {
		if i < len(expr.ValuesTypes) && expr.ValuesTypes[i] == literal.Column {
			if valStr, ok := v.(string); ok {
				if colRef, resolved := resolveRhsColumnRef(valStr, columns); resolved {
					valueParts[i] = colRef
					continue
				}
			}
		}
		escaped, err := EscapeParam(v)
		if err != nil {
			return "", err
		}
		valueParts[i] = escaped
	}
	valuesSQL := strings.Join(valueParts, ", ")

	sqlOp := "IN"
	if isNotIn {
		sqlOp = "NOT IN"
	}

	identifier := getIdentifier(column)

	if expr.Key.IsSegmented() {
		if (column.FlyQLType() == flyqltype.JSON) || column.FlyQLType() == flyqltype.JSONString {
			castIdentifier := identifier
			if column.FlyQLType() == flyqltype.JSONString {
				castIdentifier = fmt.Sprintf("(%s::jsonb)", identifier)
			}
			jsonPath := expr.Key.Segments[1:]
			jsonPathQuoted := expr.Key.QuotedSegments[1:]
			for i, part := range jsonPath {
				if err := validateJSONPathPart(part, jsonPathQuoted[i]); err != nil {
					return "", err
				}
			}
			pathExpr := buildJSONBPath(castIdentifier, jsonPath, jsonPathQuoted)
			if len(expr.Key.Transformers) > 0 {
				registry := transformers.DefaultRegistry()
				var err error
				pathExpr, err = applyTransformerSQL(pathExpr, expr.Key.Transformers, "postgresql", registry)
				if err != nil {
					return "", err
				}
			}
			return fmt.Sprintf("%s %s (%s)", pathExpr, sqlOp, valuesSQL), nil
		} else if column.FlyQLType() == flyqltype.Map {
			mapKey := strings.Join(expr.Key.Segments[1:], ".")
			escapedMapKey, err := EscapeParam(mapKey)
			if err != nil {
				return "", err
			}
			leafExpr := fmt.Sprintf("%s->%s", identifier, escapedMapKey)
			if len(expr.Key.Transformers) > 0 {
				registry := transformers.DefaultRegistry()
				leafExpr, err = applyTransformerSQL(leafExpr, expr.Key.Transformers, "postgresql", registry)
				if err != nil {
					return "", err
				}
			}
			return fmt.Sprintf("%s %s (%s)", leafExpr, sqlOp, valuesSQL), nil
		} else if column.FlyQLType() == flyqltype.Array {
			arrayIndexStr := strings.Join(expr.Key.Segments[1:], ".")
			arrayIndex, err := strconv.Atoi(arrayIndexStr)
			if err != nil {
				return "", fmt.Errorf("invalid array index, expected number: %s", arrayIndexStr)
			}
			leafExpr := fmt.Sprintf("%s[%d]", identifier, arrayIndex+1)
			if len(expr.Key.Transformers) > 0 {
				registry := transformers.DefaultRegistry()
				leafExpr, err = applyTransformerSQL(leafExpr, expr.Key.Transformers, "postgresql", registry)
				if err != nil {
					return "", err
				}
			}
			return fmt.Sprintf("%s %s (%s)", leafExpr, sqlOp, valuesSQL), nil
		} else {
			return "", fmt.Errorf("path search for unsupported column type")
		}
	}

	if len(expr.Key.Transformers) > 0 {
		registry := transformers.DefaultRegistry()
		if err := validateTransformerChain(expr.Key.Transformers, registry); err != nil {
			return "", err
		}
		var err error
		identifier, err = applyTransformerSQL(identifier, expr.Key.Transformers, "postgresql", registry)
		if err != nil {
			return "", err
		}
	}
	return fmt.Sprintf("%s %s (%s)", identifier, sqlOp, valuesSQL), nil
}

func hasExpressionToSQL(expr *flyql.Expression, columns map[string]*Column) (string, error) {
	isNotHas := expr.Operator == flyql.OpNotHas

	columnName := expr.Key.Segments[0]
	column, ok := columns[columnName]
	if !ok {
		return "", fmt.Errorf("unknown column: %s", columnName)
	}

	var value string
	if expr.ValueType == literal.Column {
		if colRef, resolved := resolveRhsColumnRef(fmt.Sprintf("%v", expr.Value), columns); resolved {
			value = colRef
		}
	} else {
		var err error
		value, err = EscapeParam(expr.Value)
		if err != nil {
			return "", err
		}
	}

	identifier := getIdentifier(column)

	if expr.Key.IsSegmented() {
		if (column.FlyQLType() == flyqltype.JSON) || column.FlyQLType() == flyqltype.JSONString {
			castIdentifier := identifier
			if column.FlyQLType() == flyqltype.JSONString {
				castIdentifier = fmt.Sprintf("(%s::jsonb)", identifier)
			}
			jsonPath := expr.Key.Segments[1:]
			jsonPathQuoted := expr.Key.QuotedSegments[1:]
			for i, part := range jsonPath {
				if err := validateJSONPathPart(part, jsonPathQuoted[i]); err != nil {
					return "", err
				}
			}
			pathExpr := buildJSONBPath(castIdentifier, jsonPath, jsonPathQuoted)
			if len(expr.Key.Transformers) > 0 {
				registry := transformers.DefaultRegistry()
				var transformErr error
				pathExpr, transformErr = applyTransformerSQL(pathExpr, expr.Key.Transformers, "postgresql", registry)
				if transformErr != nil {
					return "", transformErr
				}
			}
			if isNotHas {
				return fmt.Sprintf("position(%s in %s) = 0", value, pathExpr), nil
			}
			return fmt.Sprintf("position(%s in %s) > 0", value, pathExpr), nil
		} else if column.FlyQLType() == flyqltype.Map {
			mapKey := strings.Join(expr.Key.Segments[1:], ".")
			escapedMapKey, err := EscapeParam(mapKey)
			if err != nil {
				return "", err
			}
			leafExpr := fmt.Sprintf("%s->%s", identifier, escapedMapKey)
			if len(expr.Key.Transformers) > 0 {
				registry := transformers.DefaultRegistry()
				leafExpr, err = applyTransformerSQL(leafExpr, expr.Key.Transformers, "postgresql", registry)
				if err != nil {
					return "", err
				}
			}
			if isNotHas {
				return fmt.Sprintf("position(%s in %s) = 0", value, leafExpr), nil
			}
			return fmt.Sprintf("position(%s in %s) > 0", value, leafExpr), nil
		} else if column.FlyQLType() == flyqltype.Array {
			arrayIndexStr := strings.Join(expr.Key.Segments[1:], ".")
			arrayIndex, err := strconv.Atoi(arrayIndexStr)
			if err != nil {
				return "", fmt.Errorf("invalid array index, expected number: %s", arrayIndexStr)
			}
			pgIndex := arrayIndex + 1
			leafExpr := fmt.Sprintf("%s[%d]", identifier, pgIndex)
			if len(expr.Key.Transformers) > 0 {
				registry := transformers.DefaultRegistry()
				leafExpr, err = applyTransformerSQL(leafExpr, expr.Key.Transformers, "postgresql", registry)
				if err != nil {
					return "", err
				}
			}
			if isNotHas {
				return fmt.Sprintf("position(%s in %s) = 0", value, leafExpr), nil
			}
			return fmt.Sprintf("position(%s in %s) > 0", value, leafExpr), nil
		} else {
			return "", fmt.Errorf("path search for unsupported column type")
		}
	}

	if len(expr.Key.Transformers) > 0 {
		registry := transformers.DefaultRegistry()
		if err := validateTransformerChain(expr.Key.Transformers, registry); err != nil {
			return "", err
		}
		var transformErr error
		identifier, transformErr = applyTransformerSQL(identifier, expr.Key.Transformers, "postgresql", registry)
		if transformErr != nil {
			return "", transformErr
		}
	}

	isArrayResult := (column.FlyQLType() == flyqltype.Array)
	if len(expr.Key.Transformers) > 0 {
		registry := transformers.DefaultRegistry()
		lastT := registry.Get(expr.Key.Transformers[len(expr.Key.Transformers)-1].Name)
		if lastT != nil && lastT.OutputType() == flyqltype.Array {
			isArrayResult = true
		}
	}

	if isArrayResult {
		if isNotHas {
			return fmt.Sprintf("NOT (%s = ANY(%s))", value, identifier), nil
		}
		return fmt.Sprintf("%s = ANY(%s)", value, identifier), nil
	} else if column.FlyQLType() == flyqltype.String {
		if isNotHas {
			return fmt.Sprintf("(%s IS NULL OR position(%s in %s) = 0)", identifier, value, identifier), nil
		}
		return fmt.Sprintf("position(%s in %s) > 0", value, identifier), nil
	} else if (column.FlyQLType() == flyqltype.JSON) || column.FlyQLType() == flyqltype.JSONString {
		castIdentifier := identifier
		if column.FlyQLType() == flyqltype.JSONString {
			castIdentifier = fmt.Sprintf("(%s::jsonb)", identifier)
		}
		if isNotHas {
			return fmt.Sprintf("NOT (%s ? %s)", castIdentifier, value), nil
		}
		return fmt.Sprintf("%s ? %s", castIdentifier, value), nil
	} else if column.FlyQLType() == flyqltype.Map {
		if isNotHas {
			return fmt.Sprintf("NOT (%s ? %s)", identifier, value), nil
		}
		return fmt.Sprintf("%s ? %s", identifier, value), nil
	} else {
		return "", fmt.Errorf("has operator is not supported for column type: %s", column.FlyQLType())
	}
}

func truthyExpressionToSQL(expr *flyql.Expression, columns map[string]*Column) (string, error) {
	columnName := expr.Key.Segments[0]
	column, ok := columns[columnName]
	if !ok {
		return "", fmt.Errorf("unknown column: %s", columnName)
	}

	identifier := getIdentifier(column)

	if expr.Key.IsSegmented() {
		if (column.FlyQLType() == flyqltype.JSON) || column.FlyQLType() == flyqltype.JSONString {
			castIdentifier := identifier
			if column.FlyQLType() == flyqltype.JSONString {
				castIdentifier = fmt.Sprintf("(%s::jsonb)", identifier)
			}
			jsonPath := expr.Key.Segments[1:]
			jsonPathQuoted := expr.Key.QuotedSegments[1:]
			for i, part := range jsonPath {
				if err := validateJSONPathPart(part, jsonPathQuoted[i]); err != nil {
					return "", err
				}
			}
			pathExpr := buildJSONBPath(castIdentifier, jsonPath, jsonPathQuoted)
			if len(expr.Key.Transformers) > 0 {
				registry := transformers.DefaultRegistry()
				var err error
				pathExpr, err = applyTransformerSQL(pathExpr, expr.Key.Transformers, "postgresql", registry)
				if err != nil {
					return "", err
				}
			}
			return fmt.Sprintf("(%s IS NOT NULL AND %s != '')", pathExpr, pathExpr), nil
		} else if column.FlyQLType() == flyqltype.Map {
			mapKey := strings.Join(expr.Key.Segments[1:], ".")
			escapedMapKey, err := EscapeParam(mapKey)
			if err != nil {
				return "", err
			}
			leafExpr := fmt.Sprintf("%s->%s", identifier, escapedMapKey)
			if len(expr.Key.Transformers) > 0 {
				registry := transformers.DefaultRegistry()
				leafExpr, err = applyTransformerSQL(leafExpr, expr.Key.Transformers, "postgresql", registry)
				if err != nil {
					return "", err
				}
			}
			return fmt.Sprintf("(%s ? %s AND %s != '')",
				identifier, escapedMapKey, leafExpr), nil
		} else if column.FlyQLType() == flyqltype.Array {
			arrayIndexStr := strings.Join(expr.Key.Segments[1:], ".")
			arrayIndex, err := strconv.Atoi(arrayIndexStr)
			if err != nil {
				return "", fmt.Errorf("invalid array index, expected number: %s", arrayIndexStr)
			}
			pgIndex := arrayIndex + 1
			leafExpr := fmt.Sprintf("%s[%d]", identifier, pgIndex)
			if len(expr.Key.Transformers) > 0 {
				registry := transformers.DefaultRegistry()
				leafExpr, err = applyTransformerSQL(leafExpr, expr.Key.Transformers, "postgresql", registry)
				if err != nil {
					return "", err
				}
			}
			return fmt.Sprintf("(array_length(%s, 1) >= %d AND %s != '')",
				identifier, pgIndex, leafExpr), nil
		} else {
			return "", fmt.Errorf("path search for unsupported column type")
		}
	}

	if len(expr.Key.Transformers) > 0 {
		registry := transformers.DefaultRegistry()
		if err := validateTransformerChain(expr.Key.Transformers, registry); err != nil {
			return "", err
		}
		colRef, err := applyTransformerSQL(identifier, expr.Key.Transformers, "postgresql", registry)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("(%s IS NOT NULL AND %s != '')", colRef, colRef), nil
	}

	if column.FlyQLType() == flyqltype.JSONString {
		return fmt.Sprintf("(%s IS NOT NULL AND %s != '' AND CASE jsonb_typeof(%s::jsonb) WHEN 'array' THEN jsonb_array_length(%s::jsonb) > 0 WHEN 'object' THEN %s::jsonb != '{}'::jsonb ELSE false END)", identifier, identifier, identifier, identifier, identifier), nil
	}

	switch column.FlyQLType() {
	case flyqltype.Bool:
		return identifier, nil
	case flyqltype.String:
		return fmt.Sprintf("(%s IS NOT NULL AND %s != '')", identifier, identifier), nil
	case flyqltype.Int, flyqltype.Float:
		return fmt.Sprintf("(%s IS NOT NULL AND %s != 0)", identifier, identifier), nil
	case flyqltype.Date:
		return fmt.Sprintf("(%s IS NOT NULL)", identifier), nil
	default:
		return fmt.Sprintf("(%s IS NOT NULL)", identifier), nil
	}
}

func falsyExpressionToSQL(expr *flyql.Expression, columns map[string]*Column) (string, error) {
	columnName := expr.Key.Segments[0]
	column, ok := columns[columnName]
	if !ok {
		return "", fmt.Errorf("unknown column: %s", columnName)
	}

	identifier := getIdentifier(column)

	if expr.Key.IsSegmented() {
		if (column.FlyQLType() == flyqltype.JSON) || column.FlyQLType() == flyqltype.JSONString {
			castIdentifier := identifier
			if column.FlyQLType() == flyqltype.JSONString {
				castIdentifier = fmt.Sprintf("(%s::jsonb)", identifier)
			}
			jsonPath := expr.Key.Segments[1:]
			jsonPathQuoted := expr.Key.QuotedSegments[1:]
			for i, part := range jsonPath {
				if err := validateJSONPathPart(part, jsonPathQuoted[i]); err != nil {
					return "", err
				}
			}
			pathExpr := buildJSONBPath(castIdentifier, jsonPath, jsonPathQuoted)
			if len(expr.Key.Transformers) > 0 {
				registry := transformers.DefaultRegistry()
				var err error
				pathExpr, err = applyTransformerSQL(pathExpr, expr.Key.Transformers, "postgresql", registry)
				if err != nil {
					return "", err
				}
			}
			return fmt.Sprintf("(%s IS NULL OR %s = '')", pathExpr, pathExpr), nil
		} else if column.FlyQLType() == flyqltype.Map {
			mapKey := strings.Join(expr.Key.Segments[1:], ".")
			escapedMapKey, err := EscapeParam(mapKey)
			if err != nil {
				return "", err
			}
			leafExpr := fmt.Sprintf("%s->%s", identifier, escapedMapKey)
			if len(expr.Key.Transformers) > 0 {
				registry := transformers.DefaultRegistry()
				leafExpr, err = applyTransformerSQL(leafExpr, expr.Key.Transformers, "postgresql", registry)
				if err != nil {
					return "", err
				}
			}
			return fmt.Sprintf("(NOT (%s ? %s) OR %s = '')",
				identifier, escapedMapKey, leafExpr), nil
		} else if column.FlyQLType() == flyqltype.Array {
			arrayIndexStr := strings.Join(expr.Key.Segments[1:], ".")
			arrayIndex, err := strconv.Atoi(arrayIndexStr)
			if err != nil {
				return "", fmt.Errorf("invalid array index, expected number: %s", arrayIndexStr)
			}
			pgIndex := arrayIndex + 1
			leafExpr := fmt.Sprintf("%s[%d]", identifier, pgIndex)
			if len(expr.Key.Transformers) > 0 {
				registry := transformers.DefaultRegistry()
				leafExpr, err = applyTransformerSQL(leafExpr, expr.Key.Transformers, "postgresql", registry)
				if err != nil {
					return "", err
				}
			}
			return fmt.Sprintf("(array_length(%s, 1) < %d OR %s = '')",
				identifier, pgIndex, leafExpr), nil
		} else {
			return "", fmt.Errorf("path search for unsupported column type")
		}
	}

	if len(expr.Key.Transformers) > 0 {
		registry := transformers.DefaultRegistry()
		if err := validateTransformerChain(expr.Key.Transformers, registry); err != nil {
			return "", err
		}
		colRef, err := applyTransformerSQL(identifier, expr.Key.Transformers, "postgresql", registry)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("(%s IS NULL OR %s = '')", colRef, colRef), nil
	}

	if column.FlyQLType() == flyqltype.JSONString {
		return fmt.Sprintf("(%s IS NULL OR %s = '' OR CASE jsonb_typeof(%s::jsonb) WHEN 'array' THEN jsonb_array_length(%s::jsonb) = 0 WHEN 'object' THEN %s::jsonb = '{}'::jsonb ELSE true END)", identifier, identifier, identifier, identifier, identifier), nil
	}

	switch column.FlyQLType() {
	case flyqltype.Bool:
		return fmt.Sprintf("NOT %s", identifier), nil
	case flyqltype.String:
		return fmt.Sprintf("(%s IS NULL OR %s = '')", identifier, identifier), nil
	case flyqltype.Int, flyqltype.Float:
		return fmt.Sprintf("(%s IS NULL OR %s = 0)", identifier, identifier), nil
	case flyqltype.Date:
		return fmt.Sprintf("(%s IS NULL)", identifier), nil
	default:
		return fmt.Sprintf("(%s IS NULL)", identifier), nil
	}
}

func expressionToSQLSegmented(expr *flyql.Expression, columns map[string]*Column) (string, error) {
	if expr.ValueType == literal.Function {
		return "", fmt.Errorf("temporal functions are not supported with segmented keys")
	}
	columnName := expr.Key.Segments[0]

	column, ok := columns[columnName]
	if !ok {
		return "", fmt.Errorf("unknown column: %s", columnName)
	}

	if column.FlyQLType() != "" && column.FlyQLType() != flyqltype.JSONString && len(expr.Key.Transformers) == 0 {
		if err := ValidateOperation(expr.Value, column.FlyQLType(), expr.Operator); err != nil {
			return "", err
		}
	}

	identifier := getIdentifier(column)

	if (column.FlyQLType() == flyqltype.JSON) || column.FlyQLType() == flyqltype.JSONString {
		castIdentifier := identifier
		if column.FlyQLType() == flyqltype.JSONString {
			castIdentifier = fmt.Sprintf("(%s::jsonb)", identifier)
		}
		jsonPath := expr.Key.Segments[1:]
		jsonPathQuoted := expr.Key.QuotedSegments[1:]
		for i, part := range jsonPath {
			if err := validateJSONPathPart(part, jsonPathQuoted[i]); err != nil {
				return "", err
			}
		}

		pathExpr := buildJSONBPath(castIdentifier, jsonPath, jsonPathQuoted)
		if len(expr.Key.Transformers) > 0 {
			registry := transformers.DefaultRegistry()
			var err error
			pathExpr, err = applyTransformerSQL(pathExpr, expr.Key.Transformers, "postgresql", registry)
			if err != nil {
				return "", err
			}
		}

		// Check if the value is a COLUMN reference
		if expr.ValueType == literal.Column {
			if valStr, ok := expr.Value.(string); ok {
				if colRef, resolved := resolveRhsColumnRef(valStr, columns); resolved {
					switch expr.Operator {
					case flyql.OpRegex:
						return fmt.Sprintf("%s ~ %s", pathExpr, colRef), nil
					case flyql.OpNotRegex:
						return fmt.Sprintf("%s !~ %s", pathExpr, colRef), nil
					case flyql.OpLike:
						return fmt.Sprintf("%s LIKE %s", pathExpr, colRef), nil
					case flyql.OpNotLike:
						return fmt.Sprintf("%s NOT LIKE %s", pathExpr, colRef), nil
					case flyql.OpILike:
						return fmt.Sprintf("%s ILIKE %s", pathExpr, colRef), nil
					case flyql.OpNotILike:
						return fmt.Sprintf("%s NOT ILIKE %s", pathExpr, colRef), nil
					default:
						return fmt.Sprintf("%s %s %s", pathExpr, expr.Operator, colRef), nil
					}
				}
			}
		}

		value, err := EscapeParam(expr.Value)
		if err != nil {
			return "", err
		}

		switch {
		case expr.Operator == flyql.OpRegex:
			return fmt.Sprintf("%s ~ %s", pathExpr, value), nil
		case expr.Operator == flyql.OpNotRegex:
			return fmt.Sprintf("%s !~ %s", pathExpr, value), nil
		case expr.ValueType == literal.Integer || expr.ValueType == literal.BigInt || expr.ValueType == literal.Float:
			jsonbRaw := buildJSONBPathRaw(castIdentifier, jsonPath, jsonPathQuoted)
			return fmt.Sprintf("(jsonb_typeof(%s) = 'number' AND (%s)::numeric %s %s)", jsonbRaw, pathExpr, expr.Operator, value), nil
		case expr.ValueType == literal.String:
			jsonbRaw := buildJSONBPathRaw(castIdentifier, jsonPath, jsonPathQuoted)
			return fmt.Sprintf("(jsonb_typeof(%s) = 'string' AND %s %s %s)", jsonbRaw, pathExpr, expr.Operator, value), nil
		default:
			return fmt.Sprintf("%s %s %s", pathExpr, expr.Operator, value), nil
		}

	} else if column.FlyQLType() == flyqltype.Map {
		mapKey := strings.Join(expr.Key.Segments[1:], ".")
		escapedMapKey, err := EscapeParam(mapKey)
		if err != nil {
			return "", err
		}

		accessExpr := fmt.Sprintf("%s->%s", identifier, escapedMapKey)
		if len(expr.Key.Transformers) > 0 {
			registry := transformers.DefaultRegistry()
			var transformErr error
			accessExpr, transformErr = applyTransformerSQL(accessExpr, expr.Key.Transformers, "postgresql", registry)
			if transformErr != nil {
				return "", transformErr
			}
		}

		// Check if the value is a COLUMN reference
		if expr.ValueType == literal.Column {
			if valStr, ok := expr.Value.(string); ok {
				if colRef, resolved := resolveRhsColumnRef(valStr, columns); resolved {
					switch expr.Operator {
					case flyql.OpRegex:
						return fmt.Sprintf("%s ~ %s", accessExpr, colRef), nil
					case flyql.OpNotRegex:
						return fmt.Sprintf("%s !~ %s", accessExpr, colRef), nil
					case flyql.OpLike:
						return fmt.Sprintf("%s LIKE %s", accessExpr, colRef), nil
					case flyql.OpNotLike:
						return fmt.Sprintf("%s NOT LIKE %s", accessExpr, colRef), nil
					case flyql.OpILike:
						return fmt.Sprintf("%s ILIKE %s", accessExpr, colRef), nil
					case flyql.OpNotILike:
						return fmt.Sprintf("%s NOT ILIKE %s", accessExpr, colRef), nil
					default:
						return fmt.Sprintf("%s %s %s", accessExpr, expr.Operator, colRef), nil
					}
				}
			}
		}

		value, err := EscapeParam(expr.Value)
		if err != nil {
			return "", err
		}

		switch expr.Operator {
		case flyql.OpRegex:
			return fmt.Sprintf("%s ~ %s", accessExpr, value), nil
		case flyql.OpNotRegex:
			return fmt.Sprintf("%s !~ %s", accessExpr, value), nil
		default:
			return fmt.Sprintf("%s %s %s", accessExpr, expr.Operator, value), nil
		}

	} else if column.FlyQLType() == flyqltype.Array {
		arrayIndexStr := strings.Join(expr.Key.Segments[1:], ".")
		arrayIndex, err := strconv.Atoi(arrayIndexStr)
		if err != nil {
			return "", fmt.Errorf("invalid array index, expected number: %s", arrayIndexStr)
		}

		pgIndex := arrayIndex + 1
		accessExpr := fmt.Sprintf("%s[%d]", identifier, pgIndex)
		if len(expr.Key.Transformers) > 0 {
			registry := transformers.DefaultRegistry()
			var transformErr error
			accessExpr, transformErr = applyTransformerSQL(accessExpr, expr.Key.Transformers, "postgresql", registry)
			if transformErr != nil {
				return "", transformErr
			}
		}

		// Check if the value is a COLUMN reference
		if expr.ValueType == literal.Column {
			if valStr, ok := expr.Value.(string); ok {
				if colRef, resolved := resolveRhsColumnRef(valStr, columns); resolved {
					switch expr.Operator {
					case flyql.OpRegex:
						return fmt.Sprintf("%s ~ %s", accessExpr, colRef), nil
					case flyql.OpNotRegex:
						return fmt.Sprintf("%s !~ %s", accessExpr, colRef), nil
					case flyql.OpLike:
						return fmt.Sprintf("%s LIKE %s", accessExpr, colRef), nil
					case flyql.OpNotLike:
						return fmt.Sprintf("%s NOT LIKE %s", accessExpr, colRef), nil
					case flyql.OpILike:
						return fmt.Sprintf("%s ILIKE %s", accessExpr, colRef), nil
					case flyql.OpNotILike:
						return fmt.Sprintf("%s NOT ILIKE %s", accessExpr, colRef), nil
					default:
						return fmt.Sprintf("%s %s %s", accessExpr, expr.Operator, colRef), nil
					}
				}
			}
		}

		value, err := EscapeParam(expr.Value)
		if err != nil {
			return "", err
		}

		switch expr.Operator {
		case flyql.OpRegex:
			return fmt.Sprintf("%s ~ %s", accessExpr, value), nil
		case flyql.OpNotRegex:
			return fmt.Sprintf("%s !~ %s", accessExpr, value), nil
		default:
			return fmt.Sprintf("%s %s %s", accessExpr, expr.Operator, value), nil
		}

	} else {
		return "", fmt.Errorf("path search for unsupported column type")
	}
}

func expressionToSQLSimpleWithOptions(expr *flyql.Expression, columns map[string]*Column, registry *transformers.TransformerRegistry, options *GeneratorOptions) (string, error) {
	columnName := expr.Key.Segments[0]

	column, ok := columns[columnName]
	if !ok {
		return "", fmt.Errorf("unknown column: %s", columnName)
	}

	if expr.ValueType == literal.Function {
		fc, ok := expr.Value.(*flyql.FunctionCall)
		if !ok {
			return "", fmt.Errorf("expected FunctionCall value for function type")
		}
		if column.FlyQLType() != "" && column.FlyQLType() != flyqltype.Date {
			return "", fmt.Errorf("temporal function '%s' is not valid for column '%s' of type '%s'", fc.Name, columnName, column.FlyQLType())
		}
		defaultTz := "UTC"
		if options != nil && options.DefaultTimezone != "" {
			defaultTz = options.DefaultTimezone
		}
		value, err := functionCallToPostgreSQLSQL(fc, defaultTz)
		if err != nil {
			return "", err
		}
		colRef := getIdentifier(column)
		if len(expr.Key.Transformers) > 0 {
			if err := validateTransformerChain(expr.Key.Transformers, registry); err != nil {
				return "", err
			}
			colRef, err = applyTransformerSQL(colRef, expr.Key.Transformers, "postgresql", registry)
			if err != nil {
				return "", err
			}
		}
		return fmt.Sprintf("%s %s %s", colRef, expr.Operator, value), nil
	}

	if len(column.Values) > 0 {
		valueStr := fmt.Sprintf("%v", expr.Value)
		found := false
		for _, v := range column.Values {
			if v == valueStr {
				found = true
				break
			}
		}
		if !found {
			return "", fmt.Errorf("unknown value: %v", expr.Value)
		}
	}

	if column.FlyQLType() != "" && len(expr.Key.Transformers) == 0 {
		if err := ValidateOperation(expr.Value, column.FlyQLType(), expr.Operator); err != nil {
			return "", err
		}
	}

	identifier := getIdentifier(column)
	if len(expr.Key.Transformers) > 0 {
		if err := validateTransformerChain(expr.Key.Transformers, registry); err != nil {
			return "", err
		}
		var err error
		identifier, err = applyTransformerSQL(identifier, expr.Key.Transformers, "postgresql", registry)
		if err != nil {
			return "", err
		}
	}

	// Check if the value is a COLUMN reference
	if expr.ValueType == literal.Column {
		if valStr, ok := expr.Value.(string); ok {
			if colRef, resolved := resolveRhsColumnRef(valStr, columns); resolved {
				switch expr.Operator {
				case flyql.OpRegex:
					return fmt.Sprintf("%s ~ %s", identifier, colRef), nil
				case flyql.OpNotRegex:
					return fmt.Sprintf("%s !~ %s", identifier, colRef), nil
				case flyql.OpLike:
					return fmt.Sprintf("%s LIKE %s", identifier, colRef), nil
				case flyql.OpNotLike:
					return fmt.Sprintf("%s NOT LIKE %s", identifier, colRef), nil
				case flyql.OpILike:
					return fmt.Sprintf("%s ILIKE %s", identifier, colRef), nil
				case flyql.OpNotILike:
					return fmt.Sprintf("%s NOT ILIKE %s", identifier, colRef), nil
				default:
					return fmt.Sprintf("%s %s %s", identifier, expr.Operator, colRef), nil
				}
			}
		}
	}

	switch expr.Operator {
	case flyql.OpRegex:
		value, err := EscapeParam(fmt.Sprintf("%v", expr.Value))
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("%s ~ %s", identifier, value), nil

	case flyql.OpNotRegex:
		value, err := EscapeParam(fmt.Sprintf("%v", expr.Value))
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("%s !~ %s", identifier, value), nil

	case flyql.OpLike:
		return fmt.Sprintf("%s LIKE %s", identifier, escapeLikeParam(fmt.Sprintf("%v", expr.Value))), nil

	case flyql.OpNotLike:
		return fmt.Sprintf("%s NOT LIKE %s", identifier, escapeLikeParam(fmt.Sprintf("%v", expr.Value))), nil

	case flyql.OpILike:
		return fmt.Sprintf("%s ILIKE %s", identifier, escapeLikeParam(fmt.Sprintf("%v", expr.Value))), nil

	case flyql.OpNotILike:
		return fmt.Sprintf("%s NOT ILIKE %s", identifier, escapeLikeParam(fmt.Sprintf("%v", expr.Value))), nil

	case flyql.OpEquals, flyql.OpNotEquals:
		if expr.ValueType == literal.Null {
			if expr.Operator == flyql.OpEquals {
				return fmt.Sprintf("%s IS NULL", identifier), nil
			}
			return fmt.Sprintf("%s IS NOT NULL", identifier), nil
		}
		if expr.ValueType == literal.Boolean {
			boolLiteral := "FALSE"
			if v, ok := expr.Value.(bool); ok && v {
				boolLiteral = "TRUE"
			}
			return fmt.Sprintf("%s %s %s", identifier, expr.Operator, boolLiteral), nil
		}
		escapedValue, err := EscapeParam(expr.Value)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("%s %s %s", identifier, expr.Operator, escapedValue), nil

	default:
		value, err := EscapeParam(expr.Value)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("%s %s %s", identifier, expr.Operator, value), nil
	}
}

func findSingleLeafExpression(node *flyql.Node) *flyql.Expression {
	if node == nil {
		return nil
	}
	if node.Negated {
		return nil
	}
	if node.Expression != nil {
		return node.Expression
	}
	if node.Left != nil && node.Right == nil {
		return findSingleLeafExpression(node.Left)
	}
	if node.Right != nil && node.Left == nil {
		return findSingleLeafExpression(node.Right)
	}
	return nil
}

func ToSQLWhereWithOptions(root *flyql.Node, columns map[string]*Column, options *GeneratorOptions, registry ...*transformers.TransformerRegistry) (string, error) {
	return toSQLWhereInternal(root, columns, options, registry...)
}

func ToSQLWhere(root *flyql.Node, columns map[string]*Column, registry ...*transformers.TransformerRegistry) (string, error) {
	return toSQLWhereInternal(root, columns, nil, registry...)
}

func toSQLWhereInternal(root *flyql.Node, columns map[string]*Column, options *GeneratorOptions, registry ...*transformers.TransformerRegistry) (string, error) {
	if root == nil {
		return "", nil
	}

	var text string
	isNegated := root.Negated

	if root.Expression != nil {
		if isNegated && root.Expression.Operator == flyql.OpTruthy {
			sql, err := falsyExpressionToSQL(root.Expression, columns)
			if err != nil {
				return "", err
			}
			text = sql
			isNegated = false
		} else {
			sql, err := ExpressionToSQLWithOptions(root.Expression, columns, options, registry...)
			if err != nil {
				return "", err
			}
			text = sql
		}
	} else if isNegated && root.Expression == nil && !(root.Left != nil && root.Right != nil) {
		child := root.Left
		if child == nil {
			child = root.Right
		}
		if leafExpr := findSingleLeafExpression(child); leafExpr != nil && leafExpr.Operator == flyql.OpTruthy {
			return falsyExpressionToSQL(leafExpr, columns)
		}
	}

	var left, right string
	var err error

	if root.Left != nil {
		left, err = toSQLWhereInternal(root.Left, columns, options, registry...)
		if err != nil {
			return "", err
		}
	}

	if root.Right != nil {
		right, err = toSQLWhereInternal(root.Right, columns, options, registry...)
		if err != nil {
			return "", err
		}
	}

	if left != "" && right != "" {
		if err := validateBoolOperator(root.BoolOperator); err != nil {
			return "", err
		}
		sqlBoolOp := boolOpToSQL[root.BoolOperator]
		text = fmt.Sprintf("(%s %s %s)", left, sqlBoolOp, right)
	} else if left != "" {
		text = left
	} else if right != "" {
		text = right
	}

	if isNegated && text != "" {
		text = fmt.Sprintf("NOT (%s)", text)
	}

	return text, nil
}
