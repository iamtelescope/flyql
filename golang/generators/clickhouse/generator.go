package clickhouse

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/transformers"
	"github.com/iamtelescope/flyql/golang/types"
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
	flyql.OpHas:             true,
	flyql.OpNotHas:          true,
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

func getIdentifier(column *Column) string {
	if column.RawIdentifier != "" {
		return column.RawIdentifier
	}
	return column.Name
}

func ExpressionToSQL(expr *flyql.Expression, columns map[string]*Column, registry ...*transformers.TransformerRegistry) (string, error) {
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
	return expressionToSQLSimple(expr, columns, reg)
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
	if column.NormalizedType != "" && !expr.Key.IsSegmented() && !isHeterogeneous {
		if err := ValidateInListTypes(expr.Values, column.NormalizedType); err != nil {
			return "", err
		}
	}

	colRef := getIdentifier(column)
	if len(expr.Key.Transformers) > 0 {
		registry := transformers.DefaultRegistry()
		if err := validateTransformerChain(expr.Key.Transformers, registry); err != nil {
			return "", err
		}
		var err error
		colRef, err = applyTransformerSQL(colRef, expr.Key.Transformers, "clickhouse", registry)
		if err != nil {
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
				pathParts[i] = fmt.Sprintf("$.%s", part)
			}
			jsonPathStr := strings.Join(pathParts, ".")
			return fmt.Sprintf("JSON_VALUE(%s, '%s') %s (%s)", getIdentifier(column), jsonPathStr, sqlOp, valuesSQL), nil
		} else if column.JSONString {
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
			return fmt.Sprintf("JSONExtractString(%s, %s) %s (%s)", getIdentifier(column), jsonPathStr, sqlOp, valuesSQL), nil
		} else if column.IsMap {
			mapKey := strings.Join(expr.Key.Segments[1:], ".")
			escapedMapKey, err := EscapeParam(mapKey)
			if err != nil {
				return "", err
			}
			return fmt.Sprintf("%s[%s] %s (%s)", getIdentifier(column), escapedMapKey, sqlOp, valuesSQL), nil
		} else if column.IsArray {
			arrayIndexStr := strings.Join(expr.Key.Segments[1:], ".")
			arrayIndex, err := strconv.Atoi(arrayIndexStr)
			if err != nil {
				return "", fmt.Errorf("invalid array index, expected number: %s", arrayIndexStr)
			}
			return fmt.Sprintf("%s[%d] %s (%s)", getIdentifier(column), arrayIndex, sqlOp, valuesSQL), nil
		} else {
			return "", fmt.Errorf("path search for unsupported column type")
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

	value, err := EscapeParam(expr.Value)
	if err != nil {
		return "", err
	}

	colRef := getIdentifier(column)
	if len(expr.Key.Transformers) > 0 {
		registry := transformers.DefaultRegistry()
		if err := validateTransformerChain(expr.Key.Transformers, registry); err != nil {
			return "", err
		}
		colRef, err = applyTransformerSQL(colRef, expr.Key.Transformers, "clickhouse", registry)
		if err != nil {
			return "", err
		}
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
				pathParts[i] = fmt.Sprintf("$.%s", part)
			}
			jsonPathStr := strings.Join(pathParts, ".")
			leafExpr := fmt.Sprintf("JSON_VALUE(%s, '%s')", getIdentifier(column), jsonPathStr)
			if isNotHas {
				return fmt.Sprintf("position(%s, %s) = 0", leafExpr, value), nil
			}
			return fmt.Sprintf("position(%s, %s) > 0", leafExpr, value), nil
		} else if column.JSONString {
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
			leafExpr := fmt.Sprintf("JSONExtractString(%s, %s)", getIdentifier(column), jsonPathStr)
			if isNotHas {
				return fmt.Sprintf("position(%s, %s) = 0", leafExpr, value), nil
			}
			return fmt.Sprintf("position(%s, %s) > 0", leafExpr, value), nil
		} else if column.IsMap {
			mapKey := strings.Join(expr.Key.Segments[1:], ".")
			escapedMapKey, err := EscapeParam(mapKey)
			if err != nil {
				return "", err
			}
			leafExpr := fmt.Sprintf("%s[%s]", getIdentifier(column), escapedMapKey)
			if isNotHas {
				return fmt.Sprintf("position(%s, %s) = 0", leafExpr, value), nil
			}
			return fmt.Sprintf("position(%s, %s) > 0", leafExpr, value), nil
		} else if column.IsArray {
			arrayIndexStr := strings.Join(expr.Key.Segments[1:], ".")
			arrayIndex, err := strconv.Atoi(arrayIndexStr)
			if err != nil {
				return "", fmt.Errorf("invalid array index, expected number: %s", arrayIndexStr)
			}
			leafExpr := fmt.Sprintf("%s[%d]", getIdentifier(column), arrayIndex)
			if isNotHas {
				return fmt.Sprintf("position(%s, %s) = 0", leafExpr, value), nil
			}
			return fmt.Sprintf("position(%s, %s) > 0", leafExpr, value), nil
		} else {
			return "", fmt.Errorf("path search for unsupported column type")
		}
	}

	isArrayResult := column.IsArray
	if len(expr.Key.Transformers) > 0 {
		registry := transformers.DefaultRegistry()
		lastT := registry.Get(expr.Key.Transformers[len(expr.Key.Transformers)-1].Name)
		if lastT != nil && lastT.OutputType() == transformers.TransformerTypeArray {
			isArrayResult = true
		}
	}

	if isArrayResult {
		if isNotHas {
			return fmt.Sprintf("NOT has(%s, %s)", colRef, value), nil
		}
		return fmt.Sprintf("has(%s, %s)", colRef, value), nil
	} else if column.JSONString {
		if isNotHas {
			return fmt.Sprintf("NOT JSONHas(%s, %s)", colRef, value), nil
		}
		return fmt.Sprintf("JSONHas(%s, %s)", colRef, value), nil
	} else if column.IsMap {
		if isNotHas {
			return fmt.Sprintf("NOT mapContains(%s, %s)", colRef, value), nil
		}
		return fmt.Sprintf("mapContains(%s, %s)", colRef, value), nil
	} else if column.IsJSON {
		if isNotHas {
			return fmt.Sprintf("NOT JSON_EXISTS(%s, concat('$.', %s))", colRef, value), nil
		}
		return fmt.Sprintf("JSON_EXISTS(%s, concat('$.', %s))", colRef, value), nil
	} else if column.NormalizedType == NormalizedTypeString {
		if isNotHas {
			return fmt.Sprintf("(%s IS NULL OR position(%s, %s) = 0)", colRef, colRef, value), nil
		}
		return fmt.Sprintf("position(%s, %s) > 0", colRef, value), nil
	} else {
		return "", fmt.Errorf("has operator is not supported for column type: %s", column.NormalizedType)
	}
}

func truthyExpressionToSQL(expr *flyql.Expression, columns map[string]*Column) (string, error) {
	// Type-aware truthy checks:
	// - String: column IS NOT NULL AND column != ''
	// - Int/Float: column IS NOT NULL AND column != 0
	// - Bool: column (ClickHouse supports boolean expressions directly)
	// - Date: column IS NOT NULL

	columnName := expr.Key.Segments[0]
	column, ok := columns[columnName]
	if !ok {
		return "", fmt.Errorf("unknown column: %s", columnName)
	}

	if expr.Key.IsSegmented() {
		if column.JSONString {
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
				getIdentifier(column), jsonPathStr, getIdentifier(column), jsonPathStr), nil
		} else if column.IsJSON {
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
			return fmt.Sprintf("(%s.%s IS NOT NULL)", getIdentifier(column), jsonPathStr), nil
		} else if column.IsMap {
			mapKey := strings.Join(expr.Key.Segments[1:], ".")
			escapedMapKey, err := EscapeParam(mapKey)
			if err != nil {
				return "", err
			}
			return fmt.Sprintf("(mapContains(%s, %s) AND %s[%s] != '')",
				getIdentifier(column), escapedMapKey, getIdentifier(column), escapedMapKey), nil
		} else if column.IsArray {
			arrayIndexStr := strings.Join(expr.Key.Segments[1:], ".")
			arrayIndex, err := strconv.Atoi(arrayIndexStr)
			if err != nil {
				return "", fmt.Errorf("invalid array index, expected number: %s", arrayIndexStr)
			}
			return fmt.Sprintf("(length(%s) >= %d AND %s[%d] != '')",
				getIdentifier(column), arrayIndex, getIdentifier(column), arrayIndex), nil
		} else {
			return "", fmt.Errorf("path search for unsupported column type")
		}
	}

	if len(expr.Key.Transformers) > 0 {
		registry := transformers.DefaultRegistry()
		if err := validateTransformerChain(expr.Key.Transformers, registry); err != nil {
			return "", err
		}
		colRef, err := applyTransformerSQL(getIdentifier(column), expr.Key.Transformers, "clickhouse", registry)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("(%s IS NOT NULL AND %s != '')", colRef, colRef), nil
	}

	if column.JSONString {
		return fmt.Sprintf("(%s IS NOT NULL AND %s != '' AND JSONLength(%s) > 0)",
			getIdentifier(column), getIdentifier(column), getIdentifier(column)), nil
	}

	switch column.NormalizedType {
	case NormalizedTypeBool:
		return getIdentifier(column), nil
	case NormalizedTypeString:
		return fmt.Sprintf("(%s IS NOT NULL AND %s != '')", getIdentifier(column), getIdentifier(column)), nil
	case NormalizedTypeInt, NormalizedTypeFloat:
		return fmt.Sprintf("(%s IS NOT NULL AND %s != 0)", getIdentifier(column), getIdentifier(column)), nil
	case NormalizedTypeDate:
		return fmt.Sprintf("(%s IS NOT NULL)", getIdentifier(column)), nil
	default:
		return fmt.Sprintf("(%s IS NOT NULL)", getIdentifier(column)), nil
	}
}

func falsyExpressionToSQL(expr *flyql.Expression, columns map[string]*Column) (string, error) {
	// Type-aware falsy checks (negation of truthy):
	// - String: column IS NULL OR column = ''
	// - Int/Float: column IS NULL OR column = 0
	// - Bool: NOT column (handles NULL correctly in ClickHouse)
	// - Date: column IS NULL

	columnName := expr.Key.Segments[0]
	column, ok := columns[columnName]
	if !ok {
		return "", fmt.Errorf("unknown column: %s", columnName)
	}

	if expr.Key.IsSegmented() {
		if column.JSONString {
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
				getIdentifier(column), jsonPathStr, getIdentifier(column), jsonPathStr), nil
		} else if column.IsJSON {
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
			return fmt.Sprintf("(%s.%s IS NULL)", getIdentifier(column), jsonPathStr), nil
		} else if column.IsMap {
			mapKey := strings.Join(expr.Key.Segments[1:], ".")
			escapedMapKey, err := EscapeParam(mapKey)
			if err != nil {
				return "", err
			}
			return fmt.Sprintf("(NOT mapContains(%s, %s) OR %s[%s] = '')",
				getIdentifier(column), escapedMapKey, getIdentifier(column), escapedMapKey), nil
		} else if column.IsArray {
			arrayIndexStr := strings.Join(expr.Key.Segments[1:], ".")
			arrayIndex, err := strconv.Atoi(arrayIndexStr)
			if err != nil {
				return "", fmt.Errorf("invalid array index, expected number: %s", arrayIndexStr)
			}
			return fmt.Sprintf("(length(%s) < %d OR %s[%d] = '')",
				getIdentifier(column), arrayIndex, getIdentifier(column), arrayIndex), nil
		} else {
			return "", fmt.Errorf("path search for unsupported column type")
		}
	}

	if len(expr.Key.Transformers) > 0 {
		registry := transformers.DefaultRegistry()
		if err := validateTransformerChain(expr.Key.Transformers, registry); err != nil {
			return "", err
		}
		colRef, err := applyTransformerSQL(getIdentifier(column), expr.Key.Transformers, "clickhouse", registry)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("(%s IS NULL OR %s = '')", colRef, colRef), nil
	}

	if column.JSONString {
		return fmt.Sprintf("(%s IS NULL OR %s = '' OR JSONLength(%s) = 0)",
			getIdentifier(column), getIdentifier(column), getIdentifier(column)), nil
	}

	switch column.NormalizedType {
	case NormalizedTypeBool:
		return fmt.Sprintf("NOT %s", getIdentifier(column)), nil
	case NormalizedTypeString:
		return fmt.Sprintf("(%s IS NULL OR %s = '')", getIdentifier(column), getIdentifier(column)), nil
	case NormalizedTypeInt, NormalizedTypeFloat:
		return fmt.Sprintf("(%s IS NULL OR %s = 0)", getIdentifier(column), getIdentifier(column)), nil
	case NormalizedTypeDate:
		return fmt.Sprintf("(%s IS NULL)", getIdentifier(column)), nil
	default:
		return fmt.Sprintf("(%s IS NULL)", getIdentifier(column)), nil
	}
}

func applyTransformerSQL(columnRef string, keyTransformers []flyql.KeyTransformer, dialect string, registry *transformers.TransformerRegistry) (string, error) {
	result := columnRef
	for _, t := range keyTransformers {
		transformer := registry.Get(t.Name)
		if transformer == nil {
			return "", fmt.Errorf("unknown transformer: %s", t.Name)
		}
		result = transformer.SQL(dialect, result, t.Arguments)
	}
	return result, nil
}

func validateTransformerChain(keyTransformers []flyql.KeyTransformer, registry *transformers.TransformerRegistry) error {
	currentType := transformers.TransformerTypeString
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

func expressionToSQLSegmented(expr *flyql.Expression, columns map[string]*Column) (string, error) {
	if len(expr.Key.Transformers) > 0 {
		return "", fmt.Errorf("transformers on segmented (nested path) keys are not supported")
	}
	reverseOperator := ""
	if expr.Operator == flyql.OpNotRegex {
		reverseOperator = "not "
	}

	funcName := operatorToClickHouseFunc[expr.Operator]
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

	if column.JSONString {
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
				getIdentifier(column), jsonPathStr, funcName, getIdentifier(column), jsonPathStr, strValue),
		}

		if (expr.ValueType == types.Integer || expr.ValueType == types.BigInt || expr.ValueType == types.Float) && expr.Operator != flyql.OpRegex && expr.Operator != flyql.OpNotRegex {
			numValue := fmt.Sprintf("%v", expr.Value)
			multiIf = append(multiIf,
				fmt.Sprintf("JSONType(%s, %s) = 'Int64', %s(JSONExtractInt(%s, %s), %s)",
					getIdentifier(column), jsonPathStr, funcName, getIdentifier(column), jsonPathStr, numValue),
				fmt.Sprintf("JSONType(%s, %s) = 'Double', %s(JSONExtractFloat(%s, %s), %s)",
					getIdentifier(column), jsonPathStr, funcName, getIdentifier(column), jsonPathStr, numValue),
				fmt.Sprintf("JSONType(%s, %s) = 'Bool', %s(JSONExtractBool(%s, %s), %s)",
					getIdentifier(column), jsonPathStr, funcName, getIdentifier(column), jsonPathStr, numValue),
			)
		}
		multiIf = append(multiIf, "0")
		return fmt.Sprintf("%smultiIf(%s)", reverseOperator, strings.Join(multiIf, ",")), nil

	} else if column.IsJSON {
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
		return fmt.Sprintf("%s.%s %s %s", getIdentifier(column), jsonPathStr, expr.Operator, value), nil

	} else if column.IsMap {
		mapKey := strings.Join(expr.Key.Segments[1:], ".")
		escapedMapKey, err := EscapeParam(mapKey)
		if err != nil {
			return "", err
		}
		value, err := EscapeParam(expr.Value)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("%s%s(%s[%s], %s)", reverseOperator, funcName, getIdentifier(column), escapedMapKey, value), nil

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
		return fmt.Sprintf("%s%s(%s[%d], %s)", reverseOperator, funcName, getIdentifier(column), arrayIndex, value), nil

	} else {
		return "", fmt.Errorf("path search for unsupported column type")
	}
}

func expressionToSQLSimple(expr *flyql.Expression, columns map[string]*Column, registry *transformers.TransformerRegistry) (string, error) {
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

	if column.NormalizedType != "" && len(expr.Key.Transformers) == 0 {
		if err := ValidateOperation(expr.Value, column.NormalizedType, expr.Operator); err != nil {
			return "", err
		}
	}

	colRef := getIdentifier(column)
	if len(expr.Key.Transformers) > 0 {
		if err := validateTransformerChain(expr.Key.Transformers, registry); err != nil {
			return "", err
		}
		var err error
		colRef, err = applyTransformerSQL(colRef, expr.Key.Transformers, "clickhouse", registry)
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
		return fmt.Sprintf("match(%s, %s)", colRef, value), nil

	case flyql.OpNotRegex:
		value, err := EscapeParam(fmt.Sprintf("%v", expr.Value))
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("not match(%s, %s)", colRef, value), nil

	case flyql.OpEquals, flyql.OpNotEquals:
		if expr.ValueType == types.Null {
			if expr.Operator == flyql.OpEquals {
				return fmt.Sprintf("%s IS NULL", colRef), nil
			}
			return fmt.Sprintf("%s IS NOT NULL", colRef), nil
		}
		if expr.ValueType == types.Boolean {
			boolLiteral := "false"
			if v, ok := expr.Value.(bool); ok && v {
				boolLiteral = "true"
			}
			return fmt.Sprintf("%s %s %s", colRef, expr.Operator, boolLiteral), nil
		}
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
		return fmt.Sprintf("%s %s %s", colRef, operator, escapedValue), nil

	default:
		value, err := EscapeParam(expr.Value)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("%s %s %s", colRef, expr.Operator, value), nil
	}
}

func ToSQL(root *flyql.Node, columns map[string]*Column, registry ...*transformers.TransformerRegistry) (string, error) {
	if root == nil {
		return "", nil
	}

	var text string
	isNegated := root.Negated

	if root.Expression != nil {
		// For negated truthy expressions, generate falsy SQL directly
		if isNegated && root.Expression.Operator == flyql.OpTruthy {
			sql, err := falsyExpressionToSQL(root.Expression, columns)
			if err != nil {
				return "", err
			}
			text = sql
			isNegated = false // Already handled
		} else {
			sql, err := ExpressionToSQL(root.Expression, columns, registry...)
			if err != nil {
				return "", err
			}
			text = sql
		}
	}

	var left, right string
	var err error

	if root.Left != nil {
		left, err = ToSQL(root.Left, columns, registry...)
		if err != nil {
			return "", err
		}
	}

	if root.Right != nil {
		right, err = ToSQL(root.Right, columns, registry...)
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
