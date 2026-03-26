package postgresql

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

func validateJSONPathPart(part string, quoted bool) error {
	if quoted {
		return nil
	}
	if part == "" {
		return fmt.Errorf("Invalid JSON path part")
	}
	if idx, err := strconv.Atoi(part); err == nil && idx >= 0 {
		return nil
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
			return "true", nil
		}
		return "false", nil
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

	identifier := getIdentifier(column)

	if expr.Key.IsSegmented() {
		if column.IsJSONB || column.JSONString {
			castIdentifier := identifier
			if column.JSONString {
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
			return fmt.Sprintf("%s %s (%s)", pathExpr, sqlOp, valuesSQL), nil
		} else if column.IsHstore {
			mapKey := strings.Join(expr.Key.Segments[1:], ".")
			escapedMapKey, err := EscapeParam(mapKey)
			if err != nil {
				return "", err
			}
			return fmt.Sprintf("%s->%s %s (%s)", identifier, escapedMapKey, sqlOp, valuesSQL), nil
		} else if column.IsArray {
			arrayIndexStr := strings.Join(expr.Key.Segments[1:], ".")
			arrayIndex, err := strconv.Atoi(arrayIndexStr)
			if err != nil {
				return "", fmt.Errorf("invalid array index, expected number: %s", arrayIndexStr)
			}
			return fmt.Sprintf("%s[%d] %s (%s)", identifier, arrayIndex+1, sqlOp, valuesSQL), nil
		} else {
			return "", fmt.Errorf("path search for unsupported column type")
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

	value, err := EscapeParam(expr.Value)
	if err != nil {
		return "", err
	}

	identifier := getIdentifier(column)

	if expr.Key.IsSegmented() {
		if column.IsJSONB || column.JSONString {
			castIdentifier := identifier
			if column.JSONString {
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
			if isNotHas {
				return fmt.Sprintf("position(%s in %s) = 0", value, pathExpr), nil
			}
			return fmt.Sprintf("position(%s in %s) > 0", value, pathExpr), nil
		} else if column.IsHstore {
			mapKey := strings.Join(expr.Key.Segments[1:], ".")
			escapedMapKey, err := EscapeParam(mapKey)
			if err != nil {
				return "", err
			}
			leafExpr := fmt.Sprintf("%s->%s", identifier, escapedMapKey)
			if isNotHas {
				return fmt.Sprintf("position(%s in %s) = 0", value, leafExpr), nil
			}
			return fmt.Sprintf("position(%s in %s) > 0", value, leafExpr), nil
		} else if column.IsArray {
			arrayIndexStr := strings.Join(expr.Key.Segments[1:], ".")
			arrayIndex, err := strconv.Atoi(arrayIndexStr)
			if err != nil {
				return "", fmt.Errorf("invalid array index, expected number: %s", arrayIndexStr)
			}
			pgIndex := arrayIndex + 1
			leafExpr := fmt.Sprintf("%s[%d]", identifier, pgIndex)
			if isNotHas {
				return fmt.Sprintf("position(%s in %s) = 0", value, leafExpr), nil
			}
			return fmt.Sprintf("position(%s in %s) > 0", value, leafExpr), nil
		} else {
			return "", fmt.Errorf("path search for unsupported column type")
		}
	}

	if column.NormalizedType == NormalizedTypeString && !column.JSONString {
		if isNotHas {
			return fmt.Sprintf("(%s IS NULL OR position(%s in %s) = 0)", identifier, value, identifier), nil
		}
		return fmt.Sprintf("position(%s in %s) > 0", value, identifier), nil
	} else if column.IsArray {
		if isNotHas {
			return fmt.Sprintf("NOT (%s = ANY(%s))", value, identifier), nil
		}
		return fmt.Sprintf("%s = ANY(%s)", value, identifier), nil
	} else if column.IsJSONB || column.JSONString {
		castIdentifier := identifier
		if column.JSONString {
			castIdentifier = fmt.Sprintf("(%s::jsonb)", identifier)
		}
		if isNotHas {
			return fmt.Sprintf("NOT (%s ? %s)", castIdentifier, value), nil
		}
		return fmt.Sprintf("%s ? %s", castIdentifier, value), nil
	} else if column.IsHstore {
		if isNotHas {
			return fmt.Sprintf("NOT (%s ? %s)", identifier, value), nil
		}
		return fmt.Sprintf("%s ? %s", identifier, value), nil
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

	identifier := getIdentifier(column)

	if expr.Key.IsSegmented() {
		if column.IsJSONB || column.JSONString {
			castIdentifier := identifier
			if column.JSONString {
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
			return fmt.Sprintf("(%s IS NOT NULL AND %s != '')", pathExpr, pathExpr), nil
		} else if column.IsHstore {
			mapKey := strings.Join(expr.Key.Segments[1:], ".")
			escapedMapKey, err := EscapeParam(mapKey)
			if err != nil {
				return "", err
			}
			return fmt.Sprintf("(%s ? %s AND %s->%s != '')",
				identifier, escapedMapKey, identifier, escapedMapKey), nil
		} else if column.IsArray {
			arrayIndexStr := strings.Join(expr.Key.Segments[1:], ".")
			arrayIndex, err := strconv.Atoi(arrayIndexStr)
			if err != nil {
				return "", fmt.Errorf("invalid array index, expected number: %s", arrayIndexStr)
			}
			pgIndex := arrayIndex + 1
			return fmt.Sprintf("(array_length(%s, 1) >= %d AND %s[%d] != '')",
				identifier, pgIndex, identifier, pgIndex), nil
		} else {
			return "", fmt.Errorf("path search for unsupported column type")
		}
	}

	if column.JSONString {
		return fmt.Sprintf("(%s IS NOT NULL AND %s != '' AND CASE jsonb_typeof(%s::jsonb) WHEN 'array' THEN jsonb_array_length(%s::jsonb) > 0 WHEN 'object' THEN %s::jsonb != '{}'::jsonb ELSE false END)", identifier, identifier, identifier, identifier, identifier), nil
	}

	switch column.NormalizedType {
	case NormalizedTypeBool:
		return identifier, nil
	case NormalizedTypeString:
		return fmt.Sprintf("(%s IS NOT NULL AND %s != '')", identifier, identifier), nil
	case NormalizedTypeInt, NormalizedTypeFloat:
		return fmt.Sprintf("(%s IS NOT NULL AND %s != 0)", identifier, identifier), nil
	case NormalizedTypeDate:
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
		if column.IsJSONB || column.JSONString {
			castIdentifier := identifier
			if column.JSONString {
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
			return fmt.Sprintf("(%s IS NULL OR %s = '')", pathExpr, pathExpr), nil
		} else if column.IsHstore {
			mapKey := strings.Join(expr.Key.Segments[1:], ".")
			escapedMapKey, err := EscapeParam(mapKey)
			if err != nil {
				return "", err
			}
			return fmt.Sprintf("(NOT (%s ? %s) OR %s->%s = '')",
				identifier, escapedMapKey, identifier, escapedMapKey), nil
		} else if column.IsArray {
			arrayIndexStr := strings.Join(expr.Key.Segments[1:], ".")
			arrayIndex, err := strconv.Atoi(arrayIndexStr)
			if err != nil {
				return "", fmt.Errorf("invalid array index, expected number: %s", arrayIndexStr)
			}
			pgIndex := arrayIndex + 1
			return fmt.Sprintf("(array_length(%s, 1) < %d OR %s[%d] = '')",
				identifier, pgIndex, identifier, pgIndex), nil
		} else {
			return "", fmt.Errorf("path search for unsupported column type")
		}
	}

	if column.JSONString {
		return fmt.Sprintf("(%s IS NULL OR %s = '' OR CASE jsonb_typeof(%s::jsonb) WHEN 'array' THEN jsonb_array_length(%s::jsonb) = 0 WHEN 'object' THEN %s::jsonb = '{}'::jsonb ELSE true END)", identifier, identifier, identifier, identifier, identifier), nil
	}

	switch column.NormalizedType {
	case NormalizedTypeBool:
		return fmt.Sprintf("NOT %s", identifier), nil
	case NormalizedTypeString:
		return fmt.Sprintf("(%s IS NULL OR %s = '')", identifier, identifier), nil
	case NormalizedTypeInt, NormalizedTypeFloat:
		return fmt.Sprintf("(%s IS NULL OR %s = 0)", identifier, identifier), nil
	case NormalizedTypeDate:
		return fmt.Sprintf("(%s IS NULL)", identifier), nil
	default:
		return fmt.Sprintf("(%s IS NULL)", identifier), nil
	}
}

func expressionToSQLSegmented(expr *flyql.Expression, columns map[string]*Column) (string, error) {
	columnName := expr.Key.Segments[0]

	column, ok := columns[columnName]
	if !ok {
		return "", fmt.Errorf("unknown column: %s", columnName)
	}

	if column.NormalizedType != "" && !column.JSONString {
		if err := ValidateOperation(expr.Value, column.NormalizedType, expr.Operator); err != nil {
			return "", err
		}
	}

	identifier := getIdentifier(column)

	if column.IsJSONB || column.JSONString {
		castIdentifier := identifier
		if column.JSONString {
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

		value, err := EscapeParam(expr.Value)
		if err != nil {
			return "", err
		}

		switch {
		case expr.Operator == flyql.OpRegex:
			return fmt.Sprintf("%s ~ %s", pathExpr, value), nil
		case expr.Operator == flyql.OpNotRegex:
			return fmt.Sprintf("%s !~ %s", pathExpr, value), nil
		case expr.ValueType == flyql.ValueTypeNumber:
			jsonbRaw := buildJSONBPathRaw(castIdentifier, jsonPath, jsonPathQuoted)
			return fmt.Sprintf("(jsonb_typeof(%s) = 'number' AND (%s)::numeric %s %s)", jsonbRaw, pathExpr, expr.Operator, value), nil
		case expr.ValueType == flyql.ValueTypeString:
			jsonbRaw := buildJSONBPathRaw(castIdentifier, jsonPath, jsonPathQuoted)
			return fmt.Sprintf("(jsonb_typeof(%s) = 'string' AND %s %s %s)", jsonbRaw, pathExpr, expr.Operator, value), nil
		default:
			return fmt.Sprintf("%s %s %s", pathExpr, expr.Operator, value), nil
		}

	} else if column.IsHstore {
		mapKey := strings.Join(expr.Key.Segments[1:], ".")
		escapedMapKey, err := EscapeParam(mapKey)
		if err != nil {
			return "", err
		}
		value, err := EscapeParam(expr.Value)
		if err != nil {
			return "", err
		}

		accessExpr := fmt.Sprintf("%s->%s", identifier, escapedMapKey)

		switch expr.Operator {
		case flyql.OpRegex:
			return fmt.Sprintf("%s ~ %s", accessExpr, value), nil
		case flyql.OpNotRegex:
			return fmt.Sprintf("%s !~ %s", accessExpr, value), nil
		default:
			return fmt.Sprintf("%s %s %s", accessExpr, expr.Operator, value), nil
		}

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

		pgIndex := arrayIndex + 1
		accessExpr := fmt.Sprintf("%s[%d]", identifier, pgIndex)

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

	identifier := getIdentifier(column)

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
		value, err := EscapeParam(expr.Value)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("%s %s %s", identifier, expr.Operator, value), nil
	}
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
