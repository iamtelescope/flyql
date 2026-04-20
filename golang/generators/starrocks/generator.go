package starrocks

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/flyqltype"
	"github.com/iamtelescope/flyql/golang/generators/common"
	"github.com/iamtelescope/flyql/golang/literal"
	"github.com/iamtelescope/flyql/golang/transformers"
)

func getIdentifier(column *Column) string {
	if column.RawIdentifier != "" {
		return column.RawIdentifier
	}
	escaped := strings.ReplaceAll(column.Name, "`", "``")
	return fmt.Sprintf("`%s`", escaped)
}

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

var operatorToStarRocksOperator = map[string]string{
	flyql.OpEquals:          "=",
	flyql.OpNotEquals:       "!=",
	flyql.OpRegex:           "regexp",
	flyql.OpNotRegex:        "regexp",
	flyql.OpGreater:         ">",
	flyql.OpLess:            "<",
	flyql.OpGreaterOrEquals: ">=",
	flyql.OpLessOrEquals:    "<=",
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

type GeneratorOptions struct {
	DefaultTimezone string
}

func NewGeneratorOptions() *GeneratorOptions {
	return &GeneratorOptions{DefaultTimezone: "UTC"}
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

var durationUnitToStarRocks = map[string]string{
	"s": "SECOND",
	"m": "MINUTE",
	"h": "HOUR",
	"d": "DAY",
}

func functionCallToStarRocksSQL(fc *flyql.FunctionCall, defaultTz string) (string, error) {
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
			srUnit, ok := durationUnitToStarRocks[unit]
			if !ok {
				return "", fmt.Errorf("unsupported duration unit: %s", unit)
			}
			parts = append(parts, fmt.Sprintf("INTERVAL %d %s", val, srUnit))
		}
		return "(NOW() - " + strings.Join(parts, " - ") + ")", nil

	case "now":
		return "NOW()", nil

	case "today":
		tz := resolveTz(fc.Timezone)
		return fmt.Sprintf("DATE(CONVERT_TZ(NOW(), 'UTC', %s))", escapeStringValue(tz)), nil

	case "startOf":
		tz := resolveTz(fc.Timezone)
		escapedTz := escapeStringValue(tz)
		switch fc.Unit {
		case "day":
			return fmt.Sprintf("DATE_FORMAT(CONVERT_TZ(NOW(), 'UTC', %s), '%%Y-%%m-%%d 00:00:00')", escapedTz), nil
		case "week":
			return fmt.Sprintf("DATE_TRUNC('WEEK', CONVERT_TZ(NOW(), 'UTC', %s))", escapedTz), nil
		case "month":
			return fmt.Sprintf("DATE_TRUNC('MONTH', CONVERT_TZ(NOW(), 'UTC', %s))", escapedTz), nil
		default:
			return "", fmt.Errorf("unsupported startOf unit: %s", fc.Unit)
		}

	default:
		return "", fmt.Errorf("unsupported function: %s", fc.Name)
	}
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

func validateJSONPathPart(part string) error {
	if part == "" {
		return fmt.Errorf("invalid JSON path part")
	}
	if !jsonKeyPattern.MatchString(part) {
		return fmt.Errorf("invalid JSON path part")
	}
	return nil
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

func QuoteJSONPathPart(part string) string {
	var sb strings.Builder
	sb.WriteString("'\"")
	for _, c := range part {
		if escaped, ok := escapeCharsMap[c]; ok {
			sb.WriteString(escaped)
		} else {
			sb.WriteRune(c)
		}
	}
	sb.WriteString("\"'")
	return sb.String()
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
	column, path, err := resolveColumn(key, columns)
	if err != nil {
		return "", false
	}
	ref, err := buildSelectExpr(column, path)
	if err != nil {
		return "", false
	}
	return ref, true
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
		value, err := functionCallToStarRocksSQL(fc, defaultTz)
		if err != nil {
			return "", err
		}
		colRef := getIdentifier(column)
		if len(expr.Key.Transformers) > 0 {
			if err := validateTransformerChain(expr.Key.Transformers, registry); err != nil {
				return "", err
			}
			colRef, err = applyTransformerSQL(colRef, expr.Key.Transformers, "starrocks", registry)
			if err != nil {
				return "", err
			}
		}
		return fmt.Sprintf("%s %s %s", colRef, expr.Operator, value), nil
	}

	// Check for COLUMN value type (RHS column reference)
	if expr.ValueType == literal.Column {
		rhsRef, resolved := resolveRhsColumnRef(fmt.Sprintf("%v", expr.Value), columns)
		if resolved {
			colRef := getIdentifier(column)
			if len(expr.Key.Transformers) > 0 {
				if err := validateTransformerChain(expr.Key.Transformers, registry); err != nil {
					return "", err
				}
				var err error
				colRef, err = applyTransformerSQL(colRef, expr.Key.Transformers, "starrocks", registry)
				if err != nil {
					return "", err
				}
			}
			switch expr.Operator {
			case flyql.OpRegex:
				return fmt.Sprintf("regexp(%s, %s)", colRef, rhsRef), nil
			case flyql.OpNotRegex:
				return fmt.Sprintf("NOT regexp(%s, %s)", colRef, rhsRef), nil
			default:
				return fmt.Sprintf("%s %s %s", colRef, expr.Operator, rhsRef), nil
			}
		}
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

	colRef := getIdentifier(column)
	if len(expr.Key.Transformers) > 0 {
		if err := validateTransformerChain(expr.Key.Transformers, registry); err != nil {
			return "", err
		}
		var err error
		colRef, err = applyTransformerSQL(colRef, expr.Key.Transformers, "starrocks", registry)
		if err != nil {
			return "", err
		}
	}

	switch expr.Operator {
	case flyql.OpRegex:
		value, err := EscapeParam(fmt.Sprintf("%v", expr.Value))
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("regexp(%s, %s)", colRef, value), nil

	case flyql.OpNotRegex:
		value, err := EscapeParam(fmt.Sprintf("%v", expr.Value))
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("NOT regexp(%s, %s)", colRef, value), nil

	case flyql.OpEquals, flyql.OpNotEquals:
		if expr.ValueType == literal.Null {
			if expr.Operator == flyql.OpEquals {
				return fmt.Sprintf("%s IS NULL", colRef), nil
			}
			return fmt.Sprintf("%s IS NOT NULL", colRef), nil
		}
		if expr.ValueType == literal.Boolean {
			boolLiteral := "false"
			if v, ok := expr.Value.(bool); ok && v {
				boolLiteral = "true"
			}
			return fmt.Sprintf("%s %s %s", colRef, expr.Operator, boolLiteral), nil
		}
		escapedValue, err := EscapeParam(expr.Value)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("%s %s %s", colRef, expr.Operator, escapedValue), nil

	default:
		value, err := EscapeParam(expr.Value)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("%s %s %s", colRef, expr.Operator, value), nil
	}
}

func expressionToSQLSegmented(expr *flyql.Expression, columns map[string]*Column) (string, error) {
	if expr.ValueType == literal.Function {
		return "", fmt.Errorf("temporal functions are not supported with segmented keys")
	}
	reverseOperator := ""
	if expr.Operator == flyql.OpNotRegex {
		reverseOperator = "NOT "
	}
	operator := operatorToStarRocksOperator[expr.Operator]

	columnName := expr.Key.Segments[0]
	column, ok := columns[columnName]
	if !ok {
		return "", fmt.Errorf("unknown column: %s", columnName)
	}

	if column.FlyQLType() != "" && len(expr.Key.Transformers) == 0 {
		if err := ValidateOperation(expr.Value, column.FlyQLType(), expr.Operator); err != nil {
			return "", err
		}
	}

	isRegexOp := expr.Operator == flyql.OpRegex || expr.Operator == flyql.OpNotRegex
	hasTransformers := len(expr.Key.Transformers) > 0

	if column.FlyQLType() == flyqltype.JSON {
		jsonPath := expr.Key.Segments[1:]
		for _, part := range jsonPath {
			if err := validateJSONPathPart(part); err != nil {
				return "", err
			}
		}
		pathParts := make([]string, len(jsonPath))
		for i, part := range jsonPath {
			pathParts[i] = QuoteJSONPathPart(part)
		}
		jsonPathStr := strings.Join(pathParts, "->")

		var value string
		if rhsRef, resolved := resolveRhsColumnRef(fmt.Sprintf("%v", expr.Value), columns); expr.ValueType == literal.Column && resolved {
			value = rhsRef
		} else {
			var err error
			value, err = EscapeParam(expr.Value)
			if err != nil {
				return "", err
			}
		}

		columnExp := fmt.Sprintf("%s->%s", getIdentifier(column), jsonPathStr)
		if isRegexOp || hasTransformers {
			columnExp = fmt.Sprintf("cast(%s as string)", columnExp)
		}
		if hasTransformers {
			registry := transformers.DefaultRegistry()
			var err error
			columnExp, err = applyTransformerSQL(columnExp, expr.Key.Transformers, "starrocks", registry)
			if err != nil {
				return "", err
			}
		}
		return fmt.Sprintf("%s %s%s %s", columnExp, reverseOperator, operator, value), nil

	} else if column.FlyQLType() == flyqltype.Map {
		mapPath := expr.Key.Segments[1:]
		escapedParts := make([]string, len(mapPath))
		for i, part := range mapPath {
			escaped, err := EscapeParam(part)
			if err != nil {
				return "", err
			}
			escapedParts[i] = escaped
		}
		mapKey := strings.Join(escapedParts, "][")

		var value string
		if rhsRef, resolved := resolveRhsColumnRef(fmt.Sprintf("%v", expr.Value), columns); expr.ValueType == literal.Column && resolved {
			value = rhsRef
		} else {
			var err error
			value, err = EscapeParam(expr.Value)
			if err != nil {
				return "", err
			}
		}
		columnExp := fmt.Sprintf("%s[%s]", getIdentifier(column), mapKey)
		if hasTransformers {
			registry := transformers.DefaultRegistry()
			var err error
			columnExp, err = applyTransformerSQL(columnExp, expr.Key.Transformers, "starrocks", registry)
			if err != nil {
				return "", err
			}
		}
		return fmt.Sprintf("%s %s%s %s", columnExp, reverseOperator, operator, value), nil

	} else if column.FlyQLType() == flyqltype.Array {
		arrayIndexStr := strings.Join(expr.Key.Segments[1:], ".")
		arrayIndex, err := strconv.Atoi(arrayIndexStr)
		if err != nil {
			return "", fmt.Errorf("invalid array index, expected number: %s", arrayIndexStr)
		}
		sqlIndex := arrayIndex + 1

		var value string
		if rhsRef, resolved := resolveRhsColumnRef(fmt.Sprintf("%v", expr.Value), columns); expr.ValueType == literal.Column && resolved {
			value = rhsRef
		} else {
			value, err = EscapeParam(expr.Value)
			if err != nil {
				return "", err
			}
		}
		columnExp := fmt.Sprintf("%s[%d]", getIdentifier(column), sqlIndex)
		if hasTransformers {
			registry := transformers.DefaultRegistry()
			columnExp, err = applyTransformerSQL(columnExp, expr.Key.Transformers, "starrocks", registry)
			if err != nil {
				return "", err
			}
		}
		return fmt.Sprintf("%s %s%s %s", columnExp, reverseOperator, operator, value), nil

	} else if column.FlyQLType() == flyqltype.Struct {
		structPath := expr.Key.Segments[1:]
		structColumn := strings.Join(structPath, "`.`")

		var value string
		if rhsRef, resolved := resolveRhsColumnRef(fmt.Sprintf("%v", expr.Value), columns); expr.ValueType == literal.Column && resolved {
			value = rhsRef
		} else {
			var err error
			value, err = EscapeParam(expr.Value)
			if err != nil {
				return "", err
			}
		}
		columnExp := fmt.Sprintf("%s.`%s`", getIdentifier(column), structColumn)
		if hasTransformers {
			registry := transformers.DefaultRegistry()
			var err error
			columnExp, err = applyTransformerSQL(columnExp, expr.Key.Transformers, "starrocks", registry)
			if err != nil {
				return "", err
			}
		}
		return fmt.Sprintf("%s %s%s %s", columnExp, reverseOperator, operator, value), nil

	} else if column.FlyQLType() == flyqltype.JSONString {
		jsonPath := expr.Key.Segments[1:]
		for _, part := range jsonPath {
			if err := validateJSONPathPart(part); err != nil {
				return "", err
			}
		}
		pathParts := make([]string, len(jsonPath))
		for i, part := range jsonPath {
			pathParts[i] = QuoteJSONPathPart(part)
		}
		jsonPathStr := strings.Join(pathParts, "->")

		var value string
		if rhsRef, resolved := resolveRhsColumnRef(fmt.Sprintf("%v", expr.Value), columns); expr.ValueType == literal.Column && resolved {
			value = rhsRef
		} else {
			var err error
			value, err = EscapeParam(expr.Value)
			if err != nil {
				return "", err
			}
		}

		columnExp := fmt.Sprintf("parse_json(%s)->%s", getIdentifier(column), jsonPathStr)
		if isRegexOp || hasTransformers {
			columnExp = fmt.Sprintf("cast(%s as string)", columnExp)
		}
		if hasTransformers {
			registry := transformers.DefaultRegistry()
			var err error
			columnExp, err = applyTransformerSQL(columnExp, expr.Key.Transformers, "starrocks", registry)
			if err != nil {
				return "", err
			}
		}
		return fmt.Sprintf("%s %s%s %s", columnExp, reverseOperator, operator, value), nil

	} else {
		return "", fmt.Errorf("path search for unsupported column type")
	}
}

func inExpressionToSQL(expr *flyql.Expression, columns map[string]*Column) (string, error) {
	isNotIn := expr.Operator == flyql.OpNotIn

	if len(expr.Values) == 0 {
		if isNotIn {
			return "1", nil
		}
		return "0", nil
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
		if len(expr.ValuesTypes) > i && expr.ValuesTypes[i] == literal.Column {
			if rhsRef, resolved := resolveRhsColumnRef(fmt.Sprintf("%v", v), columns); resolved {
				valueParts[i] = rhsRef
				continue
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

	hasTransformers := len(expr.Key.Transformers) > 0

	if expr.Key.IsSegmented() {
		if column.FlyQLType() == flyqltype.JSON {
			jsonPath := expr.Key.Segments[1:]
			for _, part := range jsonPath {
				if err := validateJSONPathPart(part); err != nil {
					return "", err
				}
			}
			pathParts := make([]string, len(jsonPath))
			for i, part := range jsonPath {
				pathParts[i] = QuoteJSONPathPart(part)
			}
			jsonPathStr := strings.Join(pathParts, "->")
			leafExpr := fmt.Sprintf("%s->%s", getIdentifier(column), jsonPathStr)
			if hasTransformers {
				registry := transformers.DefaultRegistry()
				var err error
				leafExpr, err = applyTransformerSQL(fmt.Sprintf("cast(%s as string)", leafExpr), expr.Key.Transformers, "starrocks", registry)
				if err != nil {
					return "", err
				}
			}
			return fmt.Sprintf("%s %s (%s)", leafExpr, sqlOp, valuesSQL), nil
		} else if column.FlyQLType() == flyqltype.Map {
			mapPath := expr.Key.Segments[1:]
			escapedParts := make([]string, len(mapPath))
			for i, part := range mapPath {
				escaped, err := EscapeParam(part)
				if err != nil {
					return "", err
				}
				escapedParts[i] = escaped
			}
			mapKey := strings.Join(escapedParts, "][")
			leafExpr := fmt.Sprintf("%s[%s]", getIdentifier(column), mapKey)
			if hasTransformers {
				registry := transformers.DefaultRegistry()
				var err error
				leafExpr, err = applyTransformerSQL(leafExpr, expr.Key.Transformers, "starrocks", registry)
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
			sqlIndex := arrayIndex + 1
			leafExpr := fmt.Sprintf("%s[%d]", getIdentifier(column), sqlIndex)
			if hasTransformers {
				registry := transformers.DefaultRegistry()
				leafExpr, err = applyTransformerSQL(leafExpr, expr.Key.Transformers, "starrocks", registry)
				if err != nil {
					return "", err
				}
			}
			return fmt.Sprintf("%s %s (%s)", leafExpr, sqlOp, valuesSQL), nil
		} else if column.FlyQLType() == flyqltype.Struct {
			structPath := expr.Key.Segments[1:]
			structColumn := strings.Join(structPath, "`.`")
			leafExpr := fmt.Sprintf("%s.`%s`", getIdentifier(column), structColumn)
			if hasTransformers {
				registry := transformers.DefaultRegistry()
				var err error
				leafExpr, err = applyTransformerSQL(leafExpr, expr.Key.Transformers, "starrocks", registry)
				if err != nil {
					return "", err
				}
			}
			return fmt.Sprintf("%s %s (%s)", leafExpr, sqlOp, valuesSQL), nil
		} else if column.FlyQLType() == flyqltype.JSONString {
			jsonPath := expr.Key.Segments[1:]
			pathParts := make([]string, len(jsonPath))
			for i, part := range jsonPath {
				pathParts[i] = QuoteJSONPathPart(part)
			}
			jsonPathStr := strings.Join(pathParts, "->")
			leafExpr := fmt.Sprintf("parse_json(%s)->%s", getIdentifier(column), jsonPathStr)
			if hasTransformers {
				registry := transformers.DefaultRegistry()
				var err error
				leafExpr, err = applyTransformerSQL(fmt.Sprintf("cast(%s as string)", leafExpr), expr.Key.Transformers, "starrocks", registry)
				if err != nil {
					return "", err
				}
			}
			return fmt.Sprintf("%s %s (%s)", leafExpr, sqlOp, valuesSQL), nil
		} else {
			return "", fmt.Errorf("path search for unsupported column type")
		}
	}

	colRef := getIdentifier(column)
	if hasTransformers {
		registry := transformers.DefaultRegistry()
		if err := validateTransformerChain(expr.Key.Transformers, registry); err != nil {
			return "", err
		}
		var err error
		colRef, err = applyTransformerSQL(colRef, expr.Key.Transformers, "starrocks", registry)
		if err != nil {
			return "", err
		}
	}
	return fmt.Sprintf("%s %s (%s)", colRef, sqlOp, valuesSQL), nil
}

func hasExpressionToSQL(expr *flyql.Expression, columns map[string]*Column) (string, error) {
	isNotHas := expr.Operator == flyql.OpNotHas

	columnName := expr.Key.Segments[0]
	column, ok := columns[columnName]
	if !ok {
		return "", fmt.Errorf("unknown column: %s", columnName)
	}

	var value string
	if rhsRef, resolved := resolveRhsColumnRef(fmt.Sprintf("%v", expr.Value), columns); expr.ValueType == literal.Column && resolved {
		value = rhsRef
	} else {
		var err error
		value, err = EscapeParam(expr.Value)
		if err != nil {
			return "", err
		}
	}

	hasTransformers := len(expr.Key.Transformers) > 0

	if expr.Key.IsSegmented() {
		if column.FlyQLType() == flyqltype.JSON {
			jsonPath := expr.Key.Segments[1:]
			for _, part := range jsonPath {
				if err := validateJSONPathPart(part); err != nil {
					return "", err
				}
			}
			pathParts := make([]string, len(jsonPath))
			for i, part := range jsonPath {
				pathParts[i] = QuoteJSONPathPart(part)
			}
			jsonPathStr := strings.Join(pathParts, "->")
			leafExpr := fmt.Sprintf("cast(%s->%s as string)", getIdentifier(column), jsonPathStr)
			if hasTransformers {
				registry := transformers.DefaultRegistry()
				var err error
				leafExpr, err = applyTransformerSQL(leafExpr, expr.Key.Transformers, "starrocks", registry)
				if err != nil {
					return "", err
				}
			}
			if isNotHas {
				return fmt.Sprintf("INSTR(%s, %s) = 0", leafExpr, value), nil
			}
			return fmt.Sprintf("INSTR(%s, %s) > 0", leafExpr, value), nil
		} else if column.FlyQLType() == flyqltype.Map {
			mapPath := expr.Key.Segments[1:]
			escapedParts := make([]string, len(mapPath))
			for i, part := range mapPath {
				escaped, err := EscapeParam(part)
				if err != nil {
					return "", err
				}
				escapedParts[i] = escaped
			}
			mapKey := strings.Join(escapedParts, "][")
			leafExpr := fmt.Sprintf("%s[%s]", getIdentifier(column), mapKey)
			if hasTransformers {
				registry := transformers.DefaultRegistry()
				var err error
				leafExpr, err = applyTransformerSQL(leafExpr, expr.Key.Transformers, "starrocks", registry)
				if err != nil {
					return "", err
				}
			}
			if isNotHas {
				return fmt.Sprintf("INSTR(%s, %s) = 0", leafExpr, value), nil
			}
			return fmt.Sprintf("INSTR(%s, %s) > 0", leafExpr, value), nil
		} else if column.FlyQLType() == flyqltype.Array {
			arrayIndexStr := strings.Join(expr.Key.Segments[1:], ".")
			arrayIndex, err := strconv.Atoi(arrayIndexStr)
			if err != nil {
				return "", fmt.Errorf("invalid array index, expected number: %s", arrayIndexStr)
			}
			sqlIndex := arrayIndex + 1
			leafExpr := fmt.Sprintf("%s[%d]", getIdentifier(column), sqlIndex)
			if hasTransformers {
				registry := transformers.DefaultRegistry()
				leafExpr, err = applyTransformerSQL(leafExpr, expr.Key.Transformers, "starrocks", registry)
				if err != nil {
					return "", err
				}
			}
			if isNotHas {
				return fmt.Sprintf("INSTR(%s, %s) = 0", leafExpr, value), nil
			}
			return fmt.Sprintf("INSTR(%s, %s) > 0", leafExpr, value), nil
		} else if column.FlyQLType() == flyqltype.Struct {
			structPath := expr.Key.Segments[1:]
			structColumn := strings.Join(structPath, "`.`")
			leafExpr := fmt.Sprintf("%s.`%s`", getIdentifier(column), structColumn)
			if hasTransformers {
				registry := transformers.DefaultRegistry()
				var err error
				leafExpr, err = applyTransformerSQL(leafExpr, expr.Key.Transformers, "starrocks", registry)
				if err != nil {
					return "", err
				}
			}
			if isNotHas {
				return fmt.Sprintf("INSTR(%s, %s) = 0", leafExpr, value), nil
			}
			return fmt.Sprintf("INSTR(%s, %s) > 0", leafExpr, value), nil
		} else if column.FlyQLType() == flyqltype.JSONString {
			jsonPath := expr.Key.Segments[1:]
			for _, part := range jsonPath {
				if err := validateJSONPathPart(part); err != nil {
					return "", err
				}
			}
			pathParts := make([]string, len(jsonPath))
			for i, part := range jsonPath {
				pathParts[i] = QuoteJSONPathPart(part)
			}
			jsonPathStr := strings.Join(pathParts, "->")
			leafExpr := fmt.Sprintf("cast(parse_json(%s)->%s as string)", getIdentifier(column), jsonPathStr)
			if hasTransformers {
				registry := transformers.DefaultRegistry()
				var err error
				leafExpr, err = applyTransformerSQL(leafExpr, expr.Key.Transformers, "starrocks", registry)
				if err != nil {
					return "", err
				}
			}
			if isNotHas {
				return fmt.Sprintf("INSTR(%s, %s) = 0", leafExpr, value), nil
			}
			return fmt.Sprintf("INSTR(%s, %s) > 0", leafExpr, value), nil
		} else {
			return "", fmt.Errorf("path search for unsupported column type")
		}
	}

	colRef := getIdentifier(column)
	if hasTransformers {
		registry := transformers.DefaultRegistry()
		if err := validateTransformerChain(expr.Key.Transformers, registry); err != nil {
			return "", err
		}
		var err error
		colRef, err = applyTransformerSQL(colRef, expr.Key.Transformers, "starrocks", registry)
		if err != nil {
			return "", err
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
			return fmt.Sprintf("NOT array_contains(%s, %s)", colRef, value), nil
		}
		return fmt.Sprintf("array_contains(%s, %s)", colRef, value), nil
	} else if column.FlyQLType() == flyqltype.String {
		if isNotHas {
			return fmt.Sprintf("(%s IS NULL OR INSTR(%s, %s) = 0)", colRef, colRef, value), nil
		}
		return fmt.Sprintf("INSTR(%s, %s) > 0", colRef, value), nil
	} else if column.FlyQLType() == flyqltype.Map {
		if isNotHas {
			return fmt.Sprintf("NOT array_contains(map_keys(%s), %s)", colRef, value), nil
		}
		return fmt.Sprintf("array_contains(map_keys(%s), %s)", colRef, value), nil
	} else if column.FlyQLType() == flyqltype.JSON {
		if isNotHas {
			return fmt.Sprintf("NOT json_exists(%s, concat('$.', %s))", colRef, value), nil
		}
		return fmt.Sprintf("json_exists(%s, concat('$.', %s))", colRef, value), nil
	} else {
		return "", fmt.Errorf("has operator is not supported for column type: %s", column.FlyQLType())
	}
}

var likeOpToSQL = map[string]string{
	flyql.OpLike:     "LIKE",
	flyql.OpNotLike:  "NOT LIKE",
	flyql.OpILike:    "ILIKE",
	flyql.OpNotILike: "NOT ILIKE",
}

func formatLikeSQL(leafExpr, operator, value string) string {
	if operator == flyql.OpNotILike {
		return fmt.Sprintf("lower(%s) NOT LIKE lower(%s)", leafExpr, value)
	}
	return fmt.Sprintf("%s %s %s", leafExpr, likeOpToSQL[operator], value)
}

func likeExpressionToSQL(expr *flyql.Expression, columns map[string]*Column, registry *transformers.TransformerRegistry) (string, error) {
	columnName := expr.Key.Segments[0]
	column, ok := columns[columnName]
	if !ok {
		return "", fmt.Errorf("unknown column: %s", columnName)
	}

	var rhsRef string
	rhsResolved := false
	if expr.ValueType == literal.Column {
		if ref, resolved := resolveRhsColumnRef(fmt.Sprintf("%v", expr.Value), columns); resolved {
			rhsRef = ref
			rhsResolved = true
		}
	}
	var value string
	if rhsResolved {
		value = rhsRef
	} else {
		value = escapeLikeParam(fmt.Sprintf("%v", expr.Value))
	}

	colID := getIdentifier(column)
	hasTransformers := len(expr.Key.Transformers) > 0

	if expr.Key.IsSegmented() {
		switch column.FlyQLType() {
		case flyqltype.JSON:
			jsonPath := expr.Key.Segments[1:]
			for _, part := range jsonPath {
				if err := validateJSONPathPart(part); err != nil {
					return "", err
				}
			}
			pathParts := make([]string, len(jsonPath))
			for i, part := range jsonPath {
				pathParts[i] = QuoteJSONPathPart(part)
			}
			jsonPathStr := strings.Join(pathParts, "->")
			leafExpr := fmt.Sprintf("cast(%s->%s as string)", colID, jsonPathStr)
			if hasTransformers {
				var err error
				leafExpr, err = applyTransformerSQL(leafExpr, expr.Key.Transformers, "starrocks", registry)
				if err != nil {
					return "", err
				}
			}
			return formatLikeSQL(leafExpr, expr.Operator, value), nil
		case flyqltype.JSONString:
			jsonPath := expr.Key.Segments[1:]
			for _, part := range jsonPath {
				if err := validateJSONPathPart(part); err != nil {
					return "", err
				}
			}
			pathParts := make([]string, len(jsonPath))
			for i, part := range jsonPath {
				pathParts[i] = QuoteJSONPathPart(part)
			}
			jsonPathStr := strings.Join(pathParts, "->")
			leafExpr := fmt.Sprintf("cast(parse_json(%s)->%s as string)", colID, jsonPathStr)
			if hasTransformers {
				var err error
				leafExpr, err = applyTransformerSQL(leafExpr, expr.Key.Transformers, "starrocks", registry)
				if err != nil {
					return "", err
				}
			}
			return formatLikeSQL(leafExpr, expr.Operator, value), nil
		case flyqltype.Map:
			mapPath := expr.Key.Segments[1:]
			escapedParts := make([]string, len(mapPath))
			for i, part := range mapPath {
				escaped, err := EscapeParam(part)
				if err != nil {
					return "", err
				}
				escapedParts[i] = escaped
			}
			mapKey := strings.Join(escapedParts, "][")
			leafExpr := fmt.Sprintf("%s[%s]", colID, mapKey)
			if hasTransformers {
				var err error
				leafExpr, err = applyTransformerSQL(leafExpr, expr.Key.Transformers, "starrocks", registry)
				if err != nil {
					return "", err
				}
			}
			return formatLikeSQL(leafExpr, expr.Operator, value), nil
		case flyqltype.Array:
			arrayIndexStr := strings.Join(expr.Key.Segments[1:], ".")
			arrayIndex, err := strconv.Atoi(arrayIndexStr)
			if err != nil {
				return "", fmt.Errorf("invalid array index, expected number: %s", arrayIndexStr)
			}
			sqlIndex := arrayIndex + 1
			leafExpr := fmt.Sprintf("%s[%d]", colID, sqlIndex)
			if hasTransformers {
				leafExpr, err = applyTransformerSQL(leafExpr, expr.Key.Transformers, "starrocks", registry)
				if err != nil {
					return "", err
				}
			}
			return formatLikeSQL(leafExpr, expr.Operator, value), nil
		case flyqltype.Struct:
			structPath := expr.Key.Segments[1:]
			structColumn := strings.Join(structPath, "`.`")
			leafExpr := fmt.Sprintf("%s.`%s`", colID, structColumn)
			if hasTransformers {
				var err error
				leafExpr, err = applyTransformerSQL(leafExpr, expr.Key.Transformers, "starrocks", registry)
				if err != nil {
					return "", err
				}
			}
			return formatLikeSQL(leafExpr, expr.Operator, value), nil
		default:
			return "", fmt.Errorf("path search for unsupported column type")
		}
	}

	if rhsResolved {
		colRef := colID
		if hasTransformers {
			if err := validateTransformerChain(expr.Key.Transformers, registry); err != nil {
				return "", err
			}
			var err error
			colRef, err = applyTransformerSQL(colRef, expr.Key.Transformers, "starrocks", registry)
			if err != nil {
				return "", err
			}
		}
		return formatLikeSQL(colRef, expr.Operator, rhsRef), nil
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

	if column.FlyQLType() != "" && !hasTransformers {
		if err := ValidateOperation(expr.Value, column.FlyQLType(), expr.Operator); err != nil {
			return "", err
		}
	}

	colRef := colID
	if hasTransformers {
		if err := validateTransformerChain(expr.Key.Transformers, registry); err != nil {
			return "", err
		}
		var err error
		colRef, err = applyTransformerSQL(colRef, expr.Key.Transformers, "starrocks", registry)
		if err != nil {
			return "", err
		}
	}
	return formatLikeSQL(colRef, expr.Operator, value), nil
}

func truthyExpressionToSQL(expr *flyql.Expression, columns map[string]*Column) (string, error) {
	columnName := expr.Key.Segments[0]
	column, ok := columns[columnName]
	if !ok {
		return "", fmt.Errorf("unknown column: %s", columnName)
	}

	hasTransformers := len(expr.Key.Transformers) > 0

	if expr.Key.IsSegmented() {
		if column.FlyQLType() == flyqltype.JSON {
			jsonPath := expr.Key.Segments[1:]
			for _, part := range jsonPath {
				if err := validateJSONPathPart(part); err != nil {
					return "", err
				}
			}
			pathParts := make([]string, len(jsonPath))
			for i, part := range jsonPath {
				pathParts[i] = QuoteJSONPathPart(part)
			}
			jsonPathStr := strings.Join(pathParts, "->")
			leafExpr := fmt.Sprintf("%s->%s", getIdentifier(column), jsonPathStr)
			if hasTransformers {
				registry := transformers.DefaultRegistry()
				var err error
				leafExpr, err = applyTransformerSQL(fmt.Sprintf("cast(%s as string)", leafExpr), expr.Key.Transformers, "starrocks", registry)
				if err != nil {
					return "", err
				}
				return fmt.Sprintf("(%s IS NOT NULL AND %s != '')", leafExpr, leafExpr), nil
			}
			return fmt.Sprintf("(%s IS NOT NULL)", leafExpr), nil
		} else if column.FlyQLType() == flyqltype.Map {
			mapKey := strings.Join(expr.Key.Segments[1:], ".")
			escapedMapKey, err := EscapeParam(mapKey)
			if err != nil {
				return "", err
			}
			leafExpr := fmt.Sprintf("%s[%s]", getIdentifier(column), escapedMapKey)
			if hasTransformers {
				registry := transformers.DefaultRegistry()
				leafExpr, err = applyTransformerSQL(leafExpr, expr.Key.Transformers, "starrocks", registry)
				if err != nil {
					return "", err
				}
			}
			return fmt.Sprintf("(element_at(%s, %s) IS NOT NULL AND %s != '')",
				getIdentifier(column), escapedMapKey, leafExpr), nil
		} else if column.FlyQLType() == flyqltype.Array {
			arrayIndexStr := strings.Join(expr.Key.Segments[1:], ".")
			arrayIndex, err := strconv.Atoi(arrayIndexStr)
			if err != nil {
				return "", fmt.Errorf("invalid array index, expected number: %s", arrayIndexStr)
			}
			sqlIndex := arrayIndex + 1
			leafExpr := fmt.Sprintf("%s[%d]", getIdentifier(column), sqlIndex)
			if hasTransformers {
				registry := transformers.DefaultRegistry()
				leafExpr, err = applyTransformerSQL(leafExpr, expr.Key.Transformers, "starrocks", registry)
				if err != nil {
					return "", err
				}
			}
			return fmt.Sprintf("(array_length(%s) >= %d AND %s != '')",
				getIdentifier(column), sqlIndex, leafExpr), nil
		} else if column.FlyQLType() == flyqltype.Struct {
			structPath := expr.Key.Segments[1:]
			structColumn := strings.Join(structPath, "`.`")
			leafExpr := fmt.Sprintf("%s.`%s`", getIdentifier(column), structColumn)
			if hasTransformers {
				registry := transformers.DefaultRegistry()
				var err error
				leafExpr, err = applyTransformerSQL(leafExpr, expr.Key.Transformers, "starrocks", registry)
				if err != nil {
					return "", err
				}
			}
			return fmt.Sprintf("(%s IS NOT NULL AND %s != '')", leafExpr, leafExpr), nil
		} else if column.FlyQLType() == flyqltype.JSONString {
			jsonPath := expr.Key.Segments[1:]
			pathParts := make([]string, len(jsonPath))
			for i, part := range jsonPath {
				pathParts[i] = QuoteJSONPathPart(part)
			}
			jsonPathStr := strings.Join(pathParts, "->")
			leafExpr := fmt.Sprintf("parse_json(%s)->%s", getIdentifier(column), jsonPathStr)
			if hasTransformers {
				registry := transformers.DefaultRegistry()
				var err error
				leafExpr, err = applyTransformerSQL(fmt.Sprintf("cast(%s as string)", leafExpr), expr.Key.Transformers, "starrocks", registry)
				if err != nil {
					return "", err
				}
				return fmt.Sprintf("(json_exists(parse_json(%s), %s) AND %s != '')",
					getIdentifier(column), jsonPathStr, leafExpr), nil
			}
			return fmt.Sprintf("(json_exists(parse_json(%s), %s) AND %s != '')",
				getIdentifier(column), jsonPathStr, leafExpr), nil
		} else {
			return "", fmt.Errorf("path search for unsupported column type")
		}
	}

	if hasTransformers {
		registry := transformers.DefaultRegistry()
		if err := validateTransformerChain(expr.Key.Transformers, registry); err != nil {
			return "", err
		}
		colRef, err := applyTransformerSQL(getIdentifier(column), expr.Key.Transformers, "starrocks", registry)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("(%s IS NOT NULL AND %s != '')", colRef, colRef), nil
	}

	if column.FlyQLType() == flyqltype.JSONString {
		return fmt.Sprintf("(%s IS NOT NULL AND %s != '' AND json_length(%s) > 0)",
			getIdentifier(column), getIdentifier(column), getIdentifier(column)), nil
	}

	switch column.FlyQLType() {
	case flyqltype.Bool:
		return getIdentifier(column), nil
	case flyqltype.String:
		return fmt.Sprintf("(%s IS NOT NULL AND %s != '')", getIdentifier(column), getIdentifier(column)), nil
	case flyqltype.Int, flyqltype.Float:
		return fmt.Sprintf("(%s IS NOT NULL AND %s != 0)", getIdentifier(column), getIdentifier(column)), nil
	case flyqltype.Date:
		return fmt.Sprintf("(%s IS NOT NULL)", getIdentifier(column)), nil
	default:
		return fmt.Sprintf("(%s IS NOT NULL)", getIdentifier(column)), nil
	}
}

func falsyExpressionToSQL(expr *flyql.Expression, columns map[string]*Column) (string, error) {
	columnName := expr.Key.Segments[0]
	column, ok := columns[columnName]
	if !ok {
		return "", fmt.Errorf("unknown column: %s", columnName)
	}

	hasTransformers := len(expr.Key.Transformers) > 0

	if expr.Key.IsSegmented() {
		if column.FlyQLType() == flyqltype.JSON {
			jsonPath := expr.Key.Segments[1:]
			for _, part := range jsonPath {
				if err := validateJSONPathPart(part); err != nil {
					return "", err
				}
			}
			pathParts := make([]string, len(jsonPath))
			for i, part := range jsonPath {
				pathParts[i] = QuoteJSONPathPart(part)
			}
			jsonPathStr := strings.Join(pathParts, "->")
			leafExpr := fmt.Sprintf("%s->%s", getIdentifier(column), jsonPathStr)
			if hasTransformers {
				registry := transformers.DefaultRegistry()
				var err error
				leafExpr, err = applyTransformerSQL(fmt.Sprintf("cast(%s as string)", leafExpr), expr.Key.Transformers, "starrocks", registry)
				if err != nil {
					return "", err
				}
				return fmt.Sprintf("(%s IS NULL OR %s = '')", leafExpr, leafExpr), nil
			}
			return fmt.Sprintf("(%s IS NULL)", leafExpr), nil
		} else if column.FlyQLType() == flyqltype.Map {
			mapKey := strings.Join(expr.Key.Segments[1:], ".")
			escapedMapKey, err := EscapeParam(mapKey)
			if err != nil {
				return "", err
			}
			leafExpr := fmt.Sprintf("%s[%s]", getIdentifier(column), escapedMapKey)
			if hasTransformers {
				registry := transformers.DefaultRegistry()
				leafExpr, err = applyTransformerSQL(leafExpr, expr.Key.Transformers, "starrocks", registry)
				if err != nil {
					return "", err
				}
			}
			return fmt.Sprintf("(element_at(%s, %s) IS NULL OR %s = '')",
				getIdentifier(column), escapedMapKey, leafExpr), nil
		} else if column.FlyQLType() == flyqltype.Array {
			arrayIndexStr := strings.Join(expr.Key.Segments[1:], ".")
			arrayIndex, err := strconv.Atoi(arrayIndexStr)
			if err != nil {
				return "", fmt.Errorf("invalid array index, expected number: %s", arrayIndexStr)
			}
			sqlIndex := arrayIndex + 1
			leafExpr := fmt.Sprintf("%s[%d]", getIdentifier(column), sqlIndex)
			if hasTransformers {
				registry := transformers.DefaultRegistry()
				leafExpr, err = applyTransformerSQL(leafExpr, expr.Key.Transformers, "starrocks", registry)
				if err != nil {
					return "", err
				}
			}
			return fmt.Sprintf("(array_length(%s) < %d OR %s = '')",
				getIdentifier(column), sqlIndex, leafExpr), nil
		} else if column.FlyQLType() == flyqltype.Struct {
			structPath := expr.Key.Segments[1:]
			structColumn := strings.Join(structPath, "`.`")
			leafExpr := fmt.Sprintf("%s.`%s`", getIdentifier(column), structColumn)
			if hasTransformers {
				registry := transformers.DefaultRegistry()
				var err error
				leafExpr, err = applyTransformerSQL(leafExpr, expr.Key.Transformers, "starrocks", registry)
				if err != nil {
					return "", err
				}
			}
			return fmt.Sprintf("(%s IS NULL OR %s = '')", leafExpr, leafExpr), nil
		} else if column.FlyQLType() == flyqltype.JSONString {
			jsonPath := expr.Key.Segments[1:]
			pathParts := make([]string, len(jsonPath))
			for i, part := range jsonPath {
				pathParts[i] = QuoteJSONPathPart(part)
			}
			jsonPathStr := strings.Join(pathParts, "->")
			leafExpr := fmt.Sprintf("parse_json(%s)->%s", getIdentifier(column), jsonPathStr)
			if hasTransformers {
				registry := transformers.DefaultRegistry()
				var err error
				leafExpr, err = applyTransformerSQL(fmt.Sprintf("cast(%s as string)", leafExpr), expr.Key.Transformers, "starrocks", registry)
				if err != nil {
					return "", err
				}
				return fmt.Sprintf("(%s IS NULL OR NOT json_exists(parse_json(%s), %s) OR %s = '')",
					getIdentifier(column), getIdentifier(column), jsonPathStr, leafExpr), nil
			}
			return fmt.Sprintf("(%s IS NULL OR NOT json_exists(parse_json(%s), %s) OR %s = '')",
				getIdentifier(column), getIdentifier(column), jsonPathStr, leafExpr), nil
		} else {
			return "", fmt.Errorf("path search for unsupported column type")
		}
	}
	if hasTransformers {
		registry := transformers.DefaultRegistry()
		if err := validateTransformerChain(expr.Key.Transformers, registry); err != nil {
			return "", err
		}
		colRef, err := applyTransformerSQL(getIdentifier(column), expr.Key.Transformers, "starrocks", registry)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("(%s IS NULL OR %s = '')", colRef, colRef), nil
	}

	if column.FlyQLType() == flyqltype.JSONString {
		return fmt.Sprintf("(%s IS NULL OR %s = '' OR json_length(%s) = 0)",
			getIdentifier(column), getIdentifier(column), getIdentifier(column)), nil
	}

	switch column.FlyQLType() {
	case flyqltype.Bool:
		return fmt.Sprintf("NOT %s", getIdentifier(column)), nil
	case flyqltype.String:
		return fmt.Sprintf("(%s IS NULL OR %s = '')", getIdentifier(column), getIdentifier(column)), nil
	case flyqltype.Int, flyqltype.Float:
		return fmt.Sprintf("(%s IS NULL OR %s = 0)", getIdentifier(column), getIdentifier(column)), nil
	case flyqltype.Date:
		return fmt.Sprintf("(%s IS NULL)", getIdentifier(column)), nil
	default:
		return fmt.Sprintf("(%s IS NULL)", getIdentifier(column)), nil
	}
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
	if expr.Operator == flyql.OpLike || expr.Operator == flyql.OpNotLike || expr.Operator == flyql.OpILike || expr.Operator == flyql.OpNotILike {
		return likeExpressionToSQL(expr, columns, reg)
	}
	if err := validateOperator(expr.Operator); err != nil {
		return "", err
	}
	if expr.Key.IsSegmented() {
		return expressionToSQLSegmented(expr, columns)
	}
	return expressionToSQLSimpleWithOptions(expr, columns, reg, options)
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
	text, _, err := toSQLWhereInternal(root, columns, options, registry...)
	return text, err
}

func ToSQLWhere(root *flyql.Node, columns map[string]*Column, registry ...*transformers.TransformerRegistry) (string, error) {
	text, _, err := toSQLWhereInternal(root, columns, nil, registry...)
	return text, err
}

func toSQLWhereInternal(root *flyql.Node, columns map[string]*Column, options *GeneratorOptions, registry ...*transformers.TransformerRegistry) (string, string, error) {
	if root == nil {
		return "", "", nil
	}

	var text string
	var effectiveOp string
	isNegated := root.Negated

	if root.Expression != nil {
		if isNegated && root.Expression.Operator == flyql.OpTruthy {
			sql, err := falsyExpressionToSQL(root.Expression, columns)
			if err != nil {
				return "", "", err
			}
			text = sql
			isNegated = false
		} else {
			sql, err := ExpressionToSQLWithOptions(root.Expression, columns, options, registry...)
			if err != nil {
				return "", "", err
			}
			text = sql
		}
	} else if isNegated && root.Expression == nil && !(root.Left != nil && root.Right != nil) {
		child := root.Left
		if child == nil {
			child = root.Right
		}
		if leafExpr := findSingleLeafExpression(child); leafExpr != nil && leafExpr.Operator == flyql.OpTruthy {
			sql, err := falsyExpressionToSQL(leafExpr, columns)
			if err != nil {
				return "", "", err
			}
			return sql, "", nil
		}
	}

	var left, right, leftOp, rightOp string
	var err error

	if root.Left != nil {
		left, leftOp, err = toSQLWhereInternal(root.Left, columns, options, registry...)
		if err != nil {
			return "", "", err
		}
	}

	if root.Right != nil {
		right, rightOp, err = toSQLWhereInternal(root.Right, columns, options, registry...)
		if err != nil {
			return "", "", err
		}
	}

	if left != "" && right != "" {
		if err := validateBoolOperator(root.BoolOperator); err != nil {
			return "", "", err
		}
		parentOp := root.BoolOperator
		leftSQL := common.WrapChild(left, leftOp, parentOp)
		rightSQL := common.WrapChild(right, rightOp, parentOp)
		text = fmt.Sprintf("%s %s %s", leftSQL, boolOpToSQL[parentOp], rightSQL)
		effectiveOp = parentOp
	} else if left != "" {
		text = left
		effectiveOp = leftOp
	} else if right != "" {
		text = right
		effectiveOp = rightOp
	}

	if isNegated && text != "" {
		text = fmt.Sprintf("NOT (%s)", text)
		effectiveOp = ""
	}

	return text, effectiveOp, nil
}
