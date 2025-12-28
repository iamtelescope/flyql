package clickhouse

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	flyql "github.com/iamtelescope/flyql"
)

var operatorToClickHouseFunc = map[string]string{
	flyql.OpEquals:          "equals",
	flyql.OpNotEquals:       "notEquals",
	flyql.OpRegex:           "match",
	flyql.OpNotRegex:        "match",
	flyql.OpGreater:         "greater",
	flyql.OpLess:            "less",
	flyql.OpGreaterOrEquals: "greaterOrEquals",
	flyql.OpLessOrEquals:    "lessOrEquals",
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
}

var validBoolOperators = map[string]bool{
	flyql.BoolOpAnd: true,
	flyql.BoolOpOr:  true,
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

const (
	likePatternChar    = "*"
	sqlLikePatternChar = "%"
)

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

func validateJSONPathPart(part string) error {
	if part == "" {
		return fmt.Errorf("Invalid JSON path part")
	}
	if !jsonKeyPattern.MatchString(part) {
		return fmt.Errorf("Invalid JSON path part")
	}
	return nil
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
			return "True", nil
		}
		return "False", nil
	case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64:
		return fmt.Sprintf("%d", v), nil
	case float32:
		return strconv.FormatFloat(float64(v), 'f', -1, 32), nil
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64), nil
	default:
		return "", fmt.Errorf("unsupported type for EscapeParam: %T", v)
	}
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

func PrepareLikePatternValue(value string) (bool, string) {
	patternFound := false
	var newValue strings.Builder
	runes := []rune(value)

	for i := 0; i < len(runes); i++ {
		char := runes[i]
		if char == rune(likePatternChar[0]) {
			if i > 0 && runes[i-1] == '\\' {
				newValue.WriteRune(rune(likePatternChar[0]))
			} else {
				newValue.WriteRune(rune(sqlLikePatternChar[0]))
				patternFound = true
			}
		} else if char == rune(sqlLikePatternChar[0]) {
			patternFound = true
			newValue.WriteRune('\\')
			newValue.WriteRune(rune(sqlLikePatternChar[0]))
		} else if char == '\\' && i+1 < len(runes) && runes[i+1] == rune(likePatternChar[0]) {
			newValue.WriteRune('\\')
		} else {
			newValue.WriteRune(char)
		}
	}

	return patternFound, newValue.String()
}

func ExpressionToSQL(expr *flyql.Expression, fields map[string]*Field) (string, error) {
	if expr.Operator == flyql.OpTruthy {
		return truthyExpressionToSQL(expr, fields)
	}
	if expr.Operator == flyql.OpIn || expr.Operator == flyql.OpNotIn {
		return inExpressionToSQL(expr, fields)
	}
	if err := validateOperator(expr.Operator); err != nil {
		return "", err
	}
	if expr.Key.IsSegmented() {
		return expressionToSQLSegmented(expr, fields)
	}
	return expressionToSQLSimple(expr, fields)
}

func inExpressionToSQL(expr *flyql.Expression, fields map[string]*Field) (string, error) {
	isNotIn := expr.Operator == flyql.OpNotIn

	if len(expr.Values) == 0 {
		if isNotIn {
			return "1", nil
		}
		return "0", nil
	}

	fieldName := expr.Key.Segments[0]
	field, ok := fields[fieldName]
	if !ok {
		return "", fmt.Errorf("unknown field: %s", fieldName)
	}

	if field.NormalizedType != "" && !expr.Key.IsSegmented() {
		if err := ValidateInListTypes(expr.Values, field.NormalizedType); err != nil {
			return "", err
		}
	}

	valueParts := make([]string, len(expr.Values))
	for i, v := range expr.Values {
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

	if expr.Key.IsSegmented() {
		if field.IsJSON {
			jsonPath := expr.Key.Segments[1:]
			for _, part := range jsonPath {
				if err := validateJSONPathPart(part); err != nil {
					return "", err
				}
			}
			pathParts := make([]string, len(jsonPath))
			for i, part := range jsonPath {
				pathParts[i] = fmt.Sprintf("$.%s", part)
			}
			jsonPathStr := strings.Join(pathParts, ".")
			return fmt.Sprintf("JSON_VALUE(%s, '%s') %s (%s)", field.Name, jsonPathStr, sqlOp, valuesSQL), nil
		} else if field.JSONString {
			jsonPath := expr.Key.Segments[1:]
			jsonPathParts := make([]string, len(jsonPath))
			for i, p := range jsonPath {
				escaped, err := EscapeParam(p)
				if err != nil {
					return "", err
				}
				jsonPathParts[i] = escaped
			}
			jsonPathStr := strings.Join(jsonPathParts, ", ")
			return fmt.Sprintf("JSONExtractString(%s, %s) %s (%s)", field.Name, jsonPathStr, sqlOp, valuesSQL), nil
		} else if field.IsMap {
			mapKey := strings.Join(expr.Key.Segments[1:], ":")
			escapedMapKey, err := EscapeParam(mapKey)
			if err != nil {
				return "", err
			}
			return fmt.Sprintf("%s[%s] %s (%s)", field.Name, escapedMapKey, sqlOp, valuesSQL), nil
		} else if field.IsArray {
			arrayIndexStr := strings.Join(expr.Key.Segments[1:], ":")
			arrayIndex, err := strconv.Atoi(arrayIndexStr)
			if err != nil {
				return "", fmt.Errorf("invalid array index, expected number: %s", arrayIndexStr)
			}
			return fmt.Sprintf("%s[%d] %s (%s)", field.Name, arrayIndex, sqlOp, valuesSQL), nil
		} else {
			return "", fmt.Errorf("path search for unsupported field type")
		}
	}

	return fmt.Sprintf("%s %s (%s)", field.Name, sqlOp, valuesSQL), nil
}

func truthyExpressionToSQL(expr *flyql.Expression, fields map[string]*Field) (string, error) {
	// Type-aware truthy checks:
	// - String: field IS NOT NULL AND field != ''
	// - Int/Float: field IS NOT NULL AND field != 0
	// - Bool: field (ClickHouse supports boolean expressions directly)
	// - Date: field IS NOT NULL

	fieldName := expr.Key.Segments[0]
	field, ok := fields[fieldName]
	if !ok {
		return "", fmt.Errorf("unknown field: %s", fieldName)
	}

	if expr.Key.IsSegmented() {
		if field.JSONString {
			jsonPath := expr.Key.Segments[1:]
			jsonPathParts := make([]string, len(jsonPath))
			for i, p := range jsonPath {
				escaped, err := EscapeParam(p)
				if err != nil {
					return "", err
				}
				jsonPathParts[i] = escaped
			}
			jsonPathStr := strings.Join(jsonPathParts, ", ")
			return fmt.Sprintf("(JSONHas(%s, %s) AND JSONExtractString(%s, %s) != '')",
				field.Name, jsonPathStr, field.Name, jsonPathStr), nil
		} else if field.IsJSON {
			jsonPath := expr.Key.Segments[1:]
			for _, part := range jsonPath {
				if err := validateJSONPathPart(part); err != nil {
					return "", err
				}
			}
			pathParts := make([]string, len(jsonPath))
			for i, part := range jsonPath {
				pathParts[i] = fmt.Sprintf("`%s`", part)
			}
			jsonPathStr := strings.Join(pathParts, ".")
			return fmt.Sprintf("(%s.%s IS NOT NULL)", field.Name, jsonPathStr), nil
		} else if field.IsMap {
			mapKey := strings.Join(expr.Key.Segments[1:], ":")
			escapedMapKey, err := EscapeParam(mapKey)
			if err != nil {
				return "", err
			}
			return fmt.Sprintf("(mapContains(%s, %s) AND %s[%s] != '')",
				field.Name, escapedMapKey, field.Name, escapedMapKey), nil
		} else if field.IsArray {
			arrayIndexStr := strings.Join(expr.Key.Segments[1:], ":")
			arrayIndex, err := strconv.Atoi(arrayIndexStr)
			if err != nil {
				return "", fmt.Errorf("invalid array index, expected number: %s", arrayIndexStr)
			}
			return fmt.Sprintf("(length(%s) >= %d AND %s[%d] != '')",
				field.Name, arrayIndex, field.Name, arrayIndex), nil
		} else {
			return "", fmt.Errorf("path search for unsupported field type")
		}
	}

	// Simple field - type-aware truthy check
	switch field.NormalizedType {
	case NormalizedTypeBool:
		return field.Name, nil
	case NormalizedTypeString:
		return fmt.Sprintf("(%s IS NOT NULL AND %s != '')", field.Name, field.Name), nil
	case NormalizedTypeInt, NormalizedTypeFloat:
		return fmt.Sprintf("(%s IS NOT NULL AND %s != 0)", field.Name, field.Name), nil
	case NormalizedTypeDate:
		return fmt.Sprintf("(%s IS NOT NULL)", field.Name), nil
	default:
		// Fallback for other types - just check not null
		return fmt.Sprintf("(%s IS NOT NULL)", field.Name), nil
	}
}

func falsyExpressionToSQL(expr *flyql.Expression, fields map[string]*Field) (string, error) {
	// Type-aware falsy checks (negation of truthy):
	// - String: field IS NULL OR field = ''
	// - Int/Float: field IS NULL OR field = 0
	// - Bool: NOT field (handles NULL correctly in ClickHouse)
	// - Date: field IS NULL

	fieldName := expr.Key.Segments[0]
	field, ok := fields[fieldName]
	if !ok {
		return "", fmt.Errorf("unknown field: %s", fieldName)
	}

	if expr.Key.IsSegmented() {
		if field.JSONString {
			jsonPath := expr.Key.Segments[1:]
			jsonPathParts := make([]string, len(jsonPath))
			for i, p := range jsonPath {
				escaped, err := EscapeParam(p)
				if err != nil {
					return "", err
				}
				jsonPathParts[i] = escaped
			}
			jsonPathStr := strings.Join(jsonPathParts, ", ")
			return fmt.Sprintf("(NOT JSONHas(%s, %s) OR JSONExtractString(%s, %s) = '')",
				field.Name, jsonPathStr, field.Name, jsonPathStr), nil
		} else if field.IsJSON {
			jsonPath := expr.Key.Segments[1:]
			for _, part := range jsonPath {
				if err := validateJSONPathPart(part); err != nil {
					return "", err
				}
			}
			pathParts := make([]string, len(jsonPath))
			for i, part := range jsonPath {
				pathParts[i] = fmt.Sprintf("`%s`", part)
			}
			jsonPathStr := strings.Join(pathParts, ".")
			return fmt.Sprintf("(%s.%s IS NULL)", field.Name, jsonPathStr), nil
		} else if field.IsMap {
			mapKey := strings.Join(expr.Key.Segments[1:], ":")
			escapedMapKey, err := EscapeParam(mapKey)
			if err != nil {
				return "", err
			}
			return fmt.Sprintf("(NOT mapContains(%s, %s) OR %s[%s] = '')",
				field.Name, escapedMapKey, field.Name, escapedMapKey), nil
		} else if field.IsArray {
			arrayIndexStr := strings.Join(expr.Key.Segments[1:], ":")
			arrayIndex, err := strconv.Atoi(arrayIndexStr)
			if err != nil {
				return "", fmt.Errorf("invalid array index, expected number: %s", arrayIndexStr)
			}
			return fmt.Sprintf("(length(%s) < %d OR %s[%d] = '')",
				field.Name, arrayIndex, field.Name, arrayIndex), nil
		} else {
			return "", fmt.Errorf("path search for unsupported field type")
		}
	}

	// Simple field - type-aware falsy check
	switch field.NormalizedType {
	case NormalizedTypeBool:
		return fmt.Sprintf("NOT %s", field.Name), nil
	case NormalizedTypeString:
		return fmt.Sprintf("(%s IS NULL OR %s = '')", field.Name, field.Name), nil
	case NormalizedTypeInt, NormalizedTypeFloat:
		return fmt.Sprintf("(%s IS NULL OR %s = 0)", field.Name, field.Name), nil
	case NormalizedTypeDate:
		return fmt.Sprintf("(%s IS NULL)", field.Name), nil
	default:
		// Fallback for other types - just check null
		return fmt.Sprintf("(%s IS NULL)", field.Name), nil
	}
}

func expressionToSQLSegmented(expr *flyql.Expression, fields map[string]*Field) (string, error) {
	reverseOperator := ""
	if expr.Operator == flyql.OpNotRegex {
		reverseOperator = "not "
	}

	funcName := operatorToClickHouseFunc[expr.Operator]
	fieldName := expr.Key.Segments[0]

	field, ok := fields[fieldName]
	if !ok {
		return "", fmt.Errorf("unknown field: %s", fieldName)
	}

	if field.NormalizedType != "" {
		if err := ValidateOperation(expr.Value, field.NormalizedType, expr.Operator); err != nil {
			return "", err
		}
	}

	if field.JSONString {
		jsonPath := expr.Key.Segments[1:]
		jsonPathParts := make([]string, len(jsonPath))
		for i, p := range jsonPath {
			escaped, err := EscapeParam(p)
			if err != nil {
				return "", err
			}
			jsonPathParts[i] = escaped
		}
		jsonPathStr := strings.Join(jsonPathParts, ", ")

		strValue, err := EscapeParam(expr.Value)
		if err != nil {
			return "", err
		}
		multiIf := []string{
			fmt.Sprintf("JSONType(%s, %s) = 'String', %s(JSONExtractString(%s, %s), %s)",
				field.Name, jsonPathStr, funcName, field.Name, jsonPathStr, strValue),
		}

		if IsNumber(expr.Value) && expr.Operator != flyql.OpRegex && expr.Operator != flyql.OpNotRegex {
			numValue := fmt.Sprintf("%v", expr.Value)
			multiIf = append(multiIf,
				fmt.Sprintf("JSONType(%s, %s) = 'Int64', %s(JSONExtractInt(%s, %s), %s)",
					field.Name, jsonPathStr, funcName, field.Name, jsonPathStr, numValue),
				fmt.Sprintf("JSONType(%s, %s) = 'Double', %s(JSONExtractFloat(%s, %s), %s)",
					field.Name, jsonPathStr, funcName, field.Name, jsonPathStr, numValue),
				fmt.Sprintf("JSONType(%s, %s) = 'Bool', %s(JSONExtractBool(%s, %s), %s)",
					field.Name, jsonPathStr, funcName, field.Name, jsonPathStr, numValue),
			)
		}
		multiIf = append(multiIf, "0")
		return fmt.Sprintf("%smultiIf(%s)", reverseOperator, strings.Join(multiIf, ",")), nil

	} else if field.IsJSON {
		jsonPath := expr.Key.Segments[1:]
		for _, part := range jsonPath {
			if err := validateJSONPathPart(part); err != nil {
				return "", err
			}
		}
		pathParts := make([]string, len(jsonPath))
		for i, part := range jsonPath {
			pathParts[i] = fmt.Sprintf("`%s`", part)
		}
		jsonPathStr := strings.Join(pathParts, ".")
		value, err := EscapeParam(expr.Value)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("%s.%s %s %s", field.Name, jsonPathStr, expr.Operator, value), nil

	} else if field.IsMap {
		mapKey := strings.Join(expr.Key.Segments[1:], ":")
		escapedMapKey, err := EscapeParam(mapKey)
		if err != nil {
			return "", err
		}
		value, err := EscapeParam(expr.Value)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("%s%s(%s[%s], %s)", reverseOperator, funcName, field.Name, escapedMapKey, value), nil

	} else if field.IsArray {
		arrayIndexStr := strings.Join(expr.Key.Segments[1:], ":")
		arrayIndex, err := strconv.Atoi(arrayIndexStr)
		if err != nil {
			return "", fmt.Errorf("invalid array index, expected number: %s", arrayIndexStr)
		}
		value, err := EscapeParam(expr.Value)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("%s%s(%s[%d], %s)", reverseOperator, funcName, field.Name, arrayIndex, value), nil

	} else {
		return "", fmt.Errorf("path search for unsupported field type")
	}
}

func expressionToSQLSimple(expr *flyql.Expression, fields map[string]*Field) (string, error) {
	fieldName := expr.Key.Segments[0]

	field, ok := fields[fieldName]
	if !ok {
		return "", fmt.Errorf("unknown field: %s", fieldName)
	}

	if len(field.Values) > 0 {
		valueStr := fmt.Sprintf("%v", expr.Value)
		found := false
		for _, v := range field.Values {
			if v == valueStr {
				found = true
				break
			}
		}
		if !found {
			return "", fmt.Errorf("unknown value: %v", expr.Value)
		}
	}

	if field.NormalizedType != "" {
		if err := ValidateOperation(expr.Value, field.NormalizedType, expr.Operator); err != nil {
			return "", err
		}
	}

	switch expr.Operator {
	case flyql.OpRegex:
		value, err := EscapeParam(fmt.Sprintf("%v", expr.Value))
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("match(%s, %s)", field.Name, value), nil

	case flyql.OpNotRegex:
		value, err := EscapeParam(fmt.Sprintf("%v", expr.Value))
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("not match(%s, %s)", field.Name, value), nil

	case flyql.OpEquals, flyql.OpNotEquals:
		operator := expr.Operator
		valueStr := fmt.Sprintf("%v", expr.Value)
		isLikePattern, processedValue := PrepareLikePatternValue(valueStr)
		escapedValue, err := EscapeParam(processedValue)
		if err != nil {
			return "", err
		}
		if isLikePattern {
			if expr.Operator == flyql.OpEquals {
				operator = "LIKE"
			} else {
				operator = "NOT LIKE"
			}
		}
		return fmt.Sprintf("%s %s %s", field.Name, operator, escapedValue), nil

	default:
		value, err := EscapeParam(expr.Value)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("%s %s %s", field.Name, expr.Operator, value), nil
	}
}

func ToSQL(root *flyql.Node, fields map[string]*Field) (string, error) {
	if root == nil {
		return "", nil
	}

	var text string
	isNegated := root.Negated

	if root.Expression != nil {
		// For negated truthy expressions, generate falsy SQL directly
		if isNegated && root.Expression.Operator == flyql.OpTruthy {
			sql, err := falsyExpressionToSQL(root.Expression, fields)
			if err != nil {
				return "", err
			}
			text = sql
			isNegated = false // Already handled
		} else {
			sql, err := ExpressionToSQL(root.Expression, fields)
			if err != nil {
				return "", err
			}
			text = sql
		}
	}

	var left, right string
	var err error

	if root.Left != nil {
		left, err = ToSQL(root.Left, fields)
		if err != nil {
			return "", err
		}
	}

	if root.Right != nil {
		right, err = ToSQL(root.Right, fields)
		if err != nil {
			return "", err
		}
	}

	if left != "" && right != "" {
		if err := validateBoolOperator(root.BoolOperator); err != nil {
			return "", err
		}
		text = fmt.Sprintf("(%s %s %s)", left, root.BoolOperator, right)
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
