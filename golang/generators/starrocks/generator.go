package starrocks

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/transformers"
	"github.com/iamtelescope/flyql/golang/types"
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

func expressionToSQLSimple(expr *flyql.Expression, columns map[string]*Column, registry *transformers.TransformerRegistry) (string, error) {
	columnName := expr.Key.Segments[0]
	column, ok := columns[columnName]
	if !ok {
		return "", fmt.Errorf("unknown column: %s", columnName)
	}

	// Check for COLUMN value type (RHS column reference)
	if expr.ValueType == types.Column {
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
			case flyql.OpLike:
				return fmt.Sprintf("%s LIKE %s", colRef, rhsRef), nil
			case flyql.OpNotLike:
				return fmt.Sprintf("%s NOT LIKE %s", colRef, rhsRef), nil
			case flyql.OpILike:
				return fmt.Sprintf("%s ILIKE %s", colRef, rhsRef), nil
			case flyql.OpNotILike:
				return fmt.Sprintf("%s NOT ILIKE %s", colRef, rhsRef), nil
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

	case flyql.OpLike:
		return fmt.Sprintf("%s LIKE %s", colRef, escapeLikeParam(fmt.Sprintf("%v", expr.Value))), nil

	case flyql.OpNotLike:
		return fmt.Sprintf("%s NOT LIKE %s", colRef, escapeLikeParam(fmt.Sprintf("%v", expr.Value))), nil

	case flyql.OpILike:
		return fmt.Sprintf("%s ILIKE %s", colRef, escapeLikeParam(fmt.Sprintf("%v", expr.Value))), nil

	case flyql.OpNotILike:
		return fmt.Sprintf("%s NOT ILIKE %s", colRef, escapeLikeParam(fmt.Sprintf("%v", expr.Value))), nil

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
		valueStr := fmt.Sprintf("%v", expr.Value)
		escapedValue, err := EscapeParam(valueStr)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("%s %s %s", colRef, expr.Operator, escapedValue), nil

	default:
		switch expr.Value.(type) {
		case int, int64, uint64, float64:
			return fmt.Sprintf("%s %s %v", colRef, expr.Operator, expr.Value), nil
		}
		value, err := EscapeParam(fmt.Sprintf("%v", expr.Value))
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("%s %s %s", colRef, expr.Operator, value), nil
	}
}

func expressionToSQLSegmented(expr *flyql.Expression, columns map[string]*Column) (string, error) {
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

	if column.NormalizedType != "" && len(expr.Key.Transformers) == 0 {
		if err := ValidateOperation(expr.Value, column.NormalizedType, expr.Operator); err != nil {
			return "", err
		}
	}

	isRegexOp := expr.Operator == flyql.OpRegex || expr.Operator == flyql.OpNotRegex
	hasTransformers := len(expr.Key.Transformers) > 0

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

		var value string
		if rhsRef, resolved := resolveRhsColumnRef(fmt.Sprintf("%v", expr.Value), columns); expr.ValueType == types.Column && resolved {
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

		var value string
		if rhsRef, resolved := resolveRhsColumnRef(fmt.Sprintf("%v", expr.Value), columns); expr.ValueType == types.Column && resolved {
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

	} else if column.IsArray {
		arrayIndexStr := strings.Join(expr.Key.Segments[1:], ".")
		arrayIndex, err := strconv.Atoi(arrayIndexStr)
		if err != nil {
			return "", fmt.Errorf("invalid array index, expected number: %s", arrayIndexStr)
		}

		var value string
		if rhsRef, resolved := resolveRhsColumnRef(fmt.Sprintf("%v", expr.Value), columns); expr.ValueType == types.Column && resolved {
			value = rhsRef
		} else {
			value, err = EscapeParam(expr.Value)
			if err != nil {
				return "", err
			}
		}
		columnExp := fmt.Sprintf("%s[%d]", getIdentifier(column), arrayIndex)
		if hasTransformers {
			registry := transformers.DefaultRegistry()
			columnExp, err = applyTransformerSQL(columnExp, expr.Key.Transformers, "starrocks", registry)
			if err != nil {
				return "", err
			}
		}
		return fmt.Sprintf("%s %s%s %s", columnExp, reverseOperator, operator, value), nil

	} else if column.IsStruct {
		structPath := expr.Key.Segments[1:]
		structColumn := strings.Join(structPath, "`.`")

		var value string
		if rhsRef, resolved := resolveRhsColumnRef(fmt.Sprintf("%v", expr.Value), columns); expr.ValueType == types.Column && resolved {
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

		var value string
		if rhsRef, resolved := resolveRhsColumnRef(fmt.Sprintf("%v", expr.Value), columns); expr.ValueType == types.Column && resolved {
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
	if column.NormalizedType != "" && !expr.Key.IsSegmented() && !isHeterogeneous {
		if err := ValidateInListTypes(expr.Values, column.NormalizedType); err != nil {
			return "", err
		}
	}

	valueParts := make([]string, len(expr.Values))
	for i, v := range expr.Values {
		if len(expr.ValuesTypes) > i && expr.ValuesTypes[i] == types.Column {
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
		} else if column.IsArray {
			arrayIndexStr := strings.Join(expr.Key.Segments[1:], ".")
			arrayIndex, err := strconv.Atoi(arrayIndexStr)
			if err != nil {
				return "", fmt.Errorf("invalid array index, expected number: %s", arrayIndexStr)
			}
			leafExpr := fmt.Sprintf("%s[%d]", getIdentifier(column), arrayIndex)
			if hasTransformers {
				registry := transformers.DefaultRegistry()
				leafExpr, err = applyTransformerSQL(leafExpr, expr.Key.Transformers, "starrocks", registry)
				if err != nil {
					return "", err
				}
			}
			return fmt.Sprintf("%s %s (%s)", leafExpr, sqlOp, valuesSQL), nil
		} else if column.IsStruct {
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
		} else if column.JSONString {
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
	if rhsRef, resolved := resolveRhsColumnRef(fmt.Sprintf("%v", expr.Value), columns); expr.ValueType == types.Column && resolved {
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
		} else if column.IsArray {
			arrayIndexStr := strings.Join(expr.Key.Segments[1:], ".")
			arrayIndex, err := strconv.Atoi(arrayIndexStr)
			if err != nil {
				return "", fmt.Errorf("invalid array index, expected number: %s", arrayIndexStr)
			}
			leafExpr := fmt.Sprintf("%s[%d]", getIdentifier(column), arrayIndex)
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
		} else if column.IsStruct {
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
			return fmt.Sprintf("NOT array_contains(%s, %s)", colRef, value), nil
		}
		return fmt.Sprintf("array_contains(%s, %s)", colRef, value), nil
	} else if column.NormalizedType == NormalizedTypeString {
		if isNotHas {
			return fmt.Sprintf("(%s IS NULL OR INSTR(%s, %s) = 0)", colRef, colRef, value), nil
		}
		return fmt.Sprintf("INSTR(%s, %s) > 0", colRef, value), nil
	} else if column.IsMap {
		if isNotHas {
			return fmt.Sprintf("NOT array_contains(map_keys(%s), %s)", colRef, value), nil
		}
		return fmt.Sprintf("array_contains(map_keys(%s), %s)", colRef, value), nil
	} else if column.IsJSON {
		if isNotHas {
			return fmt.Sprintf("NOT json_exists(%s, concat('$.', %s))", colRef, value), nil
		}
		return fmt.Sprintf("json_exists(%s, concat('$.', %s))", colRef, value), nil
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

	hasTransformers := len(expr.Key.Transformers) > 0

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
		} else if column.IsMap {
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
		} else if column.IsArray {
			arrayIndexStr := strings.Join(expr.Key.Segments[1:], ".")
			arrayIndex, err := strconv.Atoi(arrayIndexStr)
			if err != nil {
				return "", fmt.Errorf("invalid array index, expected number: %s", arrayIndexStr)
			}
			leafExpr := fmt.Sprintf("%s[%d]", getIdentifier(column), arrayIndex)
			if hasTransformers {
				registry := transformers.DefaultRegistry()
				leafExpr, err = applyTransformerSQL(leafExpr, expr.Key.Transformers, "starrocks", registry)
				if err != nil {
					return "", err
				}
			}
			return fmt.Sprintf("(array_length(%s) >= %d AND %s != '')",
				getIdentifier(column), arrayIndex, leafExpr), nil
		} else if column.IsStruct {
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
		} else if column.JSONString {
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

	if column.JSONString {
		if column.IsMap || column.IsStruct {
			return fmt.Sprintf("(%s IS NOT NULL AND json_length(to_json(%s)) > 0)",
				getIdentifier(column), getIdentifier(column)), nil
		}
		return fmt.Sprintf("(%s IS NOT NULL AND %s != '' AND json_length(%s) > 0)",
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
	columnName := expr.Key.Segments[0]
	column, ok := columns[columnName]
	if !ok {
		return "", fmt.Errorf("unknown column: %s", columnName)
	}

	hasTransformers := len(expr.Key.Transformers) > 0

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
		} else if column.IsMap {
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
		} else if column.IsArray {
			arrayIndexStr := strings.Join(expr.Key.Segments[1:], ".")
			arrayIndex, err := strconv.Atoi(arrayIndexStr)
			if err != nil {
				return "", fmt.Errorf("invalid array index, expected number: %s", arrayIndexStr)
			}
			leafExpr := fmt.Sprintf("%s[%d]", getIdentifier(column), arrayIndex)
			if hasTransformers {
				registry := transformers.DefaultRegistry()
				leafExpr, err = applyTransformerSQL(leafExpr, expr.Key.Transformers, "starrocks", registry)
				if err != nil {
					return "", err
				}
			}
			return fmt.Sprintf("(array_length(%s) < %d OR %s = '')",
				getIdentifier(column), arrayIndex, leafExpr), nil
		} else if column.IsStruct {
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
		} else if column.JSONString {
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
				return fmt.Sprintf("(NOT json_exists(parse_json(%s), '$.%s') OR %s = '')",
					getIdentifier(column), jsonPathStr, leafExpr), nil
			}
			return fmt.Sprintf("(NOT json_exists(parse_json(%s), '$.%s') OR %s = '')",
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
		return fmt.Sprintf("(%s IS NULL OR %s = '')", colRef, colRef), nil
	}

	if column.JSONString {
		if column.IsMap || column.IsStruct {
			return fmt.Sprintf("(%s IS NULL OR json_length(to_json(%s)) = 0)",
				getIdentifier(column), getIdentifier(column)), nil
		}
		return fmt.Sprintf("(%s IS NULL OR %s = '' OR json_length(%s) = 0)",
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

func ToSQLWhere(root *flyql.Node, columns map[string]*Column, registry ...*transformers.TransformerRegistry) (string, error) {
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
			sql, err := ExpressionToSQL(root.Expression, columns, registry...)
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
		left, err = ToSQLWhere(root.Left, columns, registry...)
		if err != nil {
			return "", err
		}
	}

	if root.Right != nil {
		right, err = ToSQLWhere(root.Right, columns, registry...)
		if err != nil {
			return "", err
		}
	}

	if left != "" && right != "" {
		if err := validateBoolOperator(root.BoolOperator); err != nil {
			return "", err
		}
		text = fmt.Sprintf("(%s %s %s)", left, boolOpToSQL[root.BoolOperator], right)
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
