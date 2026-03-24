package starrocks

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	flyql "github.com/iamtelescope/flyql/golang"
)

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
}

var validBoolOperators = map[string]bool{
	flyql.BoolOpAnd: true,
	flyql.BoolOpOr:  true,
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

func expressionToSQLSimple(expr *flyql.Expression, columns map[string]*Column) (string, error) {
	columnName := expr.Key.Segments[0]
	column, ok := columns[columnName]
	if !ok {
		return "", fmt.Errorf("unknown column: %s", columnName)
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

	if column.NormalizedType != "" {
		if err := ValidateOperation(expr.Value, column.NormalizedType, expr.Operator); err != nil {
			return "", err
		}
	}

	identifier := fmt.Sprintf("`%s`", column.Name)

	switch expr.Operator {
	case flyql.OpRegex:
		value, err := EscapeParam(fmt.Sprintf("%v", expr.Value))
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("regexp(`%s`, %s)", column.Name, value), nil

	case flyql.OpNotRegex:
		value, err := EscapeParam(fmt.Sprintf("%v", expr.Value))
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("not regexp(`%s`, %s)", column.Name, value), nil

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
		return fmt.Sprintf("%s %s %s", identifier, operator, escapedValue), nil

	default:
		switch expr.Value.(type) {
		case int, int64, uint64, float64:
			return fmt.Sprintf("%s %s %v", identifier, expr.Operator, expr.Value), nil
		}
		value, err := EscapeParam(fmt.Sprintf("%v", expr.Value))
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("%s %s %s", identifier, expr.Operator, value), nil
	}
}

func expressionToSQLSegmented(expr *flyql.Expression, columns map[string]*Column) (string, error) {
	reverseOperator := ""
	if expr.Operator == flyql.OpNotRegex {
		reverseOperator = "not "
	}
	operator := operatorToStarRocksOperator[expr.Operator]

	columnName := expr.Key.Segments[0]
	column, ok := columns[columnName]
	if !ok {
		return "", fmt.Errorf("unknown column: %s", columnName)
	}

	if column.NormalizedType != "" {
		if err := ValidateOperation(expr.Value, column.NormalizedType, expr.Operator); err != nil {
			return "", err
		}
	}

	if column.IsJSON {
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

		value, err := EscapeParam(expr.Value)
		if err != nil {
			return "", err
		}

		columnExp := fmt.Sprintf("`%s`->%s", column.Name, jsonPathStr)
		if expr.Operator == flyql.OpRegex || expr.Operator == flyql.OpNotRegex {
			columnExp = fmt.Sprintf("cast(%s as string)", columnExp)
		}
		return fmt.Sprintf("%s %s%s %s", columnExp, reverseOperator, operator, value), nil

	} else if column.IsMap {
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

		value, err := EscapeParam(expr.Value)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("`%s`[%s] %s%s %s", column.Name, mapKey, reverseOperator, operator, value), nil

	} else if column.IsArray {
		arrayIndexStr := strings.Join(expr.Key.Segments[1:], ".")
		arrayIndex, err := strconv.Atoi(arrayIndexStr)
		if err != nil {
			return "", fmt.Errorf("invalid array index, expected number: %s", arrayIndexStr)
		}

		value, err := EscapeParam(expr.Value)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("`%s`[%d] %s%s %s", column.Name, arrayIndex, reverseOperator, operator, value), nil

	} else if column.IsStruct {
		structPath := expr.Key.Segments[1:]
		structColumn := strings.Join(structPath, "`.`")

		value, err := EscapeParam(expr.Value)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("`%s`.`%s` %s%s %s", column.Name, structColumn, reverseOperator, operator, value), nil

	} else if column.JSONString {
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

		value, err := EscapeParam(expr.Value)
		if err != nil {
			return "", err
		}

		columnExp := fmt.Sprintf("parse_json(`%s`)->%s", column.Name, jsonPathStr)
		if expr.Operator == flyql.OpRegex || expr.Operator == flyql.OpNotRegex {
			columnExp = fmt.Sprintf("cast(%s as string)", columnExp)
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

	if column.NormalizedType != "" && !expr.Key.IsSegmented() {
		if err := ValidateInListTypes(expr.Values, column.NormalizedType); err != nil {
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
		if column.IsJSON {
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
			return fmt.Sprintf("`%s`->%s %s (%s)", column.Name, jsonPathStr, sqlOp, valuesSQL), nil
		} else if column.IsMap {
			mapPath := expr.Key.Segments[1:]
			mapKey := strings.Join(mapPath, "']['")
			return fmt.Sprintf("`%s`['%s'] %s (%s)", column.Name, mapKey, sqlOp, valuesSQL), nil
		} else if column.IsArray {
			arrayIndexStr := strings.Join(expr.Key.Segments[1:], ".")
			arrayIndex, err := strconv.Atoi(arrayIndexStr)
			if err != nil {
				return "", fmt.Errorf("invalid array index, expected number: %s", arrayIndexStr)
			}
			return fmt.Sprintf("`%s`[%d] %s (%s)", column.Name, arrayIndex, sqlOp, valuesSQL), nil
		} else if column.IsStruct {
			structPath := expr.Key.Segments[1:]
			structColumn := strings.Join(structPath, "`.`")
			return fmt.Sprintf("`%s`.`%s` %s (%s)", column.Name, structColumn, sqlOp, valuesSQL), nil
		} else if column.JSONString {
			jsonPath := expr.Key.Segments[1:]
			pathParts := make([]string, len(jsonPath))
			for i, part := range jsonPath {
				pathParts[i] = QuoteJSONPathPart(part)
			}
			jsonPathStr := strings.Join(pathParts, "->")
			return fmt.Sprintf("parse_json(`%s`)->%s %s (%s)", column.Name, jsonPathStr, sqlOp, valuesSQL), nil
		} else {
			return "", fmt.Errorf("path search for unsupported column type")
		}
	}

	return fmt.Sprintf("`%s` %s (%s)", column.Name, sqlOp, valuesSQL), nil
}

func hasExpressionToSQL(expr *flyql.Expression, columns map[string]*Column) (string, error) {
	isNotHas := expr.Operator == flyql.OpNotHas

	columnName := expr.Key.Segments[0]
	column, ok := columns[columnName]
	if !ok {
		return "", fmt.Errorf("unknown column: %s", columnName)
	}

	value, err := EscapeParam(expr.Value)
	if err != nil {
		return "", err
	}

	if expr.Key.IsSegmented() {
		if column.IsJSON {
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
			leafExpr := fmt.Sprintf("`%s`->%s", column.Name, jsonPathStr)
			if isNotHas {
				return fmt.Sprintf("INSTR(cast(%s as string), %s) = 0", leafExpr, value), nil
			}
			return fmt.Sprintf("INSTR(cast(%s as string), %s) > 0", leafExpr, value), nil
		} else if column.IsMap {
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
			leafExpr := fmt.Sprintf("`%s`[%s]", column.Name, mapKey)
			if isNotHas {
				return fmt.Sprintf("INSTR(%s, %s) = 0", leafExpr, value), nil
			}
			return fmt.Sprintf("INSTR(%s, %s) > 0", leafExpr, value), nil
		} else if column.IsArray {
			arrayIndexStr := strings.Join(expr.Key.Segments[1:], ".")
			arrayIndex, err := strconv.Atoi(arrayIndexStr)
			if err != nil {
				return "", fmt.Errorf("invalid array index, expected number: %s", arrayIndexStr)
			}
			leafExpr := fmt.Sprintf("`%s`[%d]", column.Name, arrayIndex)
			if isNotHas {
				return fmt.Sprintf("INSTR(%s, %s) = 0", leafExpr, value), nil
			}
			return fmt.Sprintf("INSTR(%s, %s) > 0", leafExpr, value), nil
		} else if column.IsStruct {
			structPath := expr.Key.Segments[1:]
			structColumn := strings.Join(structPath, "`.`")
			leafExpr := fmt.Sprintf("`%s`.`%s`", column.Name, structColumn)
			if isNotHas {
				return fmt.Sprintf("INSTR(%s, %s) = 0", leafExpr, value), nil
			}
			return fmt.Sprintf("INSTR(%s, %s) > 0", leafExpr, value), nil
		} else if column.JSONString {
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
			leafExpr := fmt.Sprintf("parse_json(`%s`)->%s", column.Name, jsonPathStr)
			if isNotHas {
				return fmt.Sprintf("INSTR(cast(%s as string), %s) = 0", leafExpr, value), nil
			}
			return fmt.Sprintf("INSTR(cast(%s as string), %s) > 0", leafExpr, value), nil
		} else {
			return "", fmt.Errorf("path search for unsupported column type")
		}
	}

	if column.NormalizedType == NormalizedTypeString {
		if isNotHas {
			return fmt.Sprintf("(`%s` IS NULL OR INSTR(`%s`, %s) = 0)", column.Name, column.Name, value), nil
		}
		return fmt.Sprintf("INSTR(`%s`, %s) > 0", column.Name, value), nil
	} else if column.IsArray {
		if isNotHas {
			return fmt.Sprintf("NOT array_contains(`%s`, %s)", column.Name, value), nil
		}
		return fmt.Sprintf("array_contains(`%s`, %s)", column.Name, value), nil
	} else if column.IsMap {
		if isNotHas {
			return fmt.Sprintf("NOT array_contains(map_keys(`%s`), %s)", column.Name, value), nil
		}
		return fmt.Sprintf("array_contains(map_keys(`%s`), %s)", column.Name, value), nil
	} else if column.IsJSON {
		if isNotHas {
			return fmt.Sprintf("NOT json_exists(`%s`, concat('$.', %s))", column.Name, value), nil
		}
		return fmt.Sprintf("json_exists(`%s`, concat('$.', %s))", column.Name, value), nil
	} else {
		return "", fmt.Errorf("has operator is not supported for column type: %s", column.NormalizedType)
	}
}

func truthyExpressionToSQL(expr *flyql.Expression, columns map[string]*Column) (string, error) {
	columnName := expr.Key.Segments[0]
	column, ok := columns[columnName]
	if !ok {
		return "", fmt.Errorf("unknown column: %s", columnName)
	}

	if expr.Key.IsSegmented() {
		if column.IsJSON {
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
			return fmt.Sprintf("(`%s`->%s IS NOT NULL)", column.Name, jsonPathStr), nil
		} else if column.IsMap {
			mapKey := strings.Join(expr.Key.Segments[1:], ".")
			escapedMapKey, err := EscapeParam(mapKey)
			if err != nil {
				return "", err
			}
			return fmt.Sprintf("(element_at(`%s`, %s) IS NOT NULL AND `%s`[%s] != '')",
				column.Name, escapedMapKey, column.Name, escapedMapKey), nil
		} else if column.IsArray {
			arrayIndexStr := strings.Join(expr.Key.Segments[1:], ".")
			arrayIndex, err := strconv.Atoi(arrayIndexStr)
			if err != nil {
				return "", fmt.Errorf("invalid array index, expected number: %s", arrayIndexStr)
			}
			return fmt.Sprintf("(array_length(`%s`) >= %d AND `%s`[%d] != '')",
				column.Name, arrayIndex, column.Name, arrayIndex), nil
		} else if column.IsStruct {
			structPath := expr.Key.Segments[1:]
			structColumn := strings.Join(structPath, "`.`")
			return fmt.Sprintf("`%s`.`%s` IS NOT NULL AND `%s`.`%s` != ''",
				column.Name, structColumn, column.Name, structColumn), nil
		} else if column.JSONString {
			jsonPath := expr.Key.Segments[1:]
			pathParts := make([]string, len(jsonPath))
			for i, part := range jsonPath {
				pathParts[i] = QuoteJSONPathPart(part)
			}
			jsonPathStr := strings.Join(pathParts, "->")
			return fmt.Sprintf("(json_exists(parse_json(`%s`), %s) AND parse_json(`%s`)->%s != '')",
				column.Name, jsonPathStr, column.Name, jsonPathStr), nil
		} else {
			return "", fmt.Errorf("path search for unsupported column type")
		}
	}

	if column.JSONString {
		if column.IsMap || column.IsStruct {
			return fmt.Sprintf("(`%s` IS NOT NULL AND json_length(to_json(`%s`)) > 0)",
				column.Name, column.Name), nil
		}
		return fmt.Sprintf("(`%s` IS NOT NULL AND `%s` != '' AND json_length(`%s`) > 0)",
			column.Name, column.Name, column.Name), nil
	}

	switch column.NormalizedType {
	case NormalizedTypeBool:
		return fmt.Sprintf("`%s`", column.Name), nil
	case NormalizedTypeString:
		return fmt.Sprintf("(`%s` IS NOT NULL AND `%s` != '')", column.Name, column.Name), nil
	case NormalizedTypeInt, NormalizedTypeFloat:
		return fmt.Sprintf("(`%s` IS NOT NULL AND `%s` != 0)", column.Name, column.Name), nil
	case NormalizedTypeDate:
		return fmt.Sprintf("(`%s` IS NOT NULL)", column.Name), nil
	default:
		return fmt.Sprintf("(`%s` IS NOT NULL)", column.Name), nil
	}
}

func falsyExpressionToSQL(expr *flyql.Expression, columns map[string]*Column) (string, error) {
	columnName := expr.Key.Segments[0]
	column, ok := columns[columnName]
	if !ok {
		return "", fmt.Errorf("unknown column: %s", columnName)
	}

	if expr.Key.IsSegmented() {
		if column.IsJSON {
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
			return fmt.Sprintf("(`%s`->%s IS NULL)", column.Name, jsonPathStr), nil
		} else if column.IsMap {
			mapKey := strings.Join(expr.Key.Segments[1:], ".")
			escapedMapKey, err := EscapeParam(mapKey)
			if err != nil {
				return "", err
			}
			return fmt.Sprintf("(element_at(`%s`, '%s') IS NULL OR `%s`['%s'] = '')",
				column.Name, escapedMapKey, column.Name, escapedMapKey), nil
		} else if column.IsArray {
			arrayIndexStr := strings.Join(expr.Key.Segments[1:], ".")
			arrayIndex, err := strconv.Atoi(arrayIndexStr)
			if err != nil {
				return "", fmt.Errorf("invalid array index, expected number: %s", arrayIndexStr)
			}
			return fmt.Sprintf("(array_length(`%s`) < %d OR `%s`[%d] = '')",
				column.Name, arrayIndex, column.Name, arrayIndex), nil
		} else if column.IsStruct {
			structPath := expr.Key.Segments[1:]
			structColumn := strings.Join(structPath, "`.`")
			return fmt.Sprintf("`%s`.`%s` IS NULL OR `%s`.`%s` = ''",
				column.Name, structColumn, column.Name, structColumn), nil
		} else if column.JSONString {
			jsonPath := expr.Key.Segments[1:]
			pathParts := make([]string, len(jsonPath))
			for i, part := range jsonPath {
				pathParts[i] = QuoteJSONPathPart(part)
			}
			jsonPathStr := strings.Join(pathParts, "->")
			return fmt.Sprintf("(NOT json_exists(parse_json(`%s`), '$.%s') OR parse_json(`%s`)->%s = '')",
				column.Name, jsonPathStr, column.Name, jsonPathStr), nil
		} else {
			return "", fmt.Errorf("path search for unsupported column type")
		}
	}

	if column.JSONString {
		if column.IsMap || column.IsStruct {
			return fmt.Sprintf("(`%s` IS NULL OR json_length(to_json(`%s`)) = 0)",
				column.Name, column.Name), nil
		}
		return fmt.Sprintf("(`%s` IS NULL OR `%s` = '' OR json_length(`%s`) = 0)",
			column.Name, column.Name, column.Name), nil
	}

	switch column.NormalizedType {
	case NormalizedTypeBool:
		return fmt.Sprintf("NOT `%s`", column.Name), nil
	case NormalizedTypeString:
		return fmt.Sprintf("(`%s` IS NULL OR `%s` = '')", column.Name, column.Name), nil
	case NormalizedTypeInt, NormalizedTypeFloat:
		return fmt.Sprintf("(`%s` IS NULL OR `%s` = 0)", column.Name, column.Name), nil
	case NormalizedTypeDate:
		return fmt.Sprintf("(`%s` IS NULL)", column.Name), nil
	default:
		return fmt.Sprintf("(`%s` IS NULL)", column.Name), nil
	}
}

func ExpressionToSQL(expr *flyql.Expression, columns map[string]*Column) (string, error) {
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
	return expressionToSQLSimple(expr, columns)
}

func ToSQLWhere(root *flyql.Node, columns map[string]*Column) (string, error) {
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
			sql, err := ExpressionToSQL(root.Expression, columns)
			if err != nil {
				return "", err
			}
			text = sql
		}
	}

	var left, right string
	var err error

	if root.Left != nil {
		left, err = ToSQLWhere(root.Left, columns)
		if err != nil {
			return "", err
		}
	}

	if root.Right != nil {
		right, err = ToSQLWhere(root.Right, columns)
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
