package clickhouse

import (
	"fmt"

	flyql "github.com/iamtelescope/flyql/golang"
)

type forbiddenOp struct {
	fieldType string
	operator  string
	valueType string
}

var forbiddenOperations = map[forbiddenOp]bool{
	{NormalizedTypeString, flyql.OpLess, "int"}:              true,
	{NormalizedTypeString, flyql.OpLess, "float"}:            true,
	{NormalizedTypeString, flyql.OpGreater, "int"}:           true,
	{NormalizedTypeString, flyql.OpGreater, "float"}:         true,
	{NormalizedTypeString, flyql.OpGreaterOrEquals, "int"}:   true,
	{NormalizedTypeString, flyql.OpGreaterOrEquals, "float"}: true,
	{NormalizedTypeString, flyql.OpLessOrEquals, "int"}:      true,
	{NormalizedTypeString, flyql.OpLessOrEquals, "float"}:    true,

	{NormalizedTypeInt, flyql.OpRegex, "string"}:      true,
	{NormalizedTypeFloat, flyql.OpRegex, "string"}:    true,
	{NormalizedTypeInt, flyql.OpNotRegex, "string"}:   true,
	{NormalizedTypeFloat, flyql.OpNotRegex, "string"}: true,

	{NormalizedTypeBool, flyql.OpLess, "bool"}:            true,
	{NormalizedTypeBool, flyql.OpGreater, "bool"}:         true,
	{NormalizedTypeBool, flyql.OpGreaterOrEquals, "bool"}: true,
	{NormalizedTypeBool, flyql.OpLessOrEquals, "bool"}:    true,
}

func getValueType(value any) string {
	switch value.(type) {
	case bool:
		return "bool"
	case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64:
		return "int"
	case float32, float64:
		return "float"
	case string:
		return "string"
	default:
		return ""
	}
}

func ValidateOperation(value any, fieldNormalizedType string, operator string) error {
	if fieldNormalizedType == "" {
		return nil
	}

	op := forbiddenOp{
		fieldType: fieldNormalizedType,
		operator:  operator,
		valueType: getValueType(value),
	}

	if forbiddenOperations[op] {
		return fmt.Errorf("operation not allowed: %s field with '%s' operator", fieldNormalizedType, operator)
	}

	return nil
}

var inCompatibleTypes = map[string]map[string]bool{
	NormalizedTypeString: {"string": true},
	NormalizedTypeInt:    {"int": true, "float": true},
	NormalizedTypeFloat:  {"int": true, "float": true},
	NormalizedTypeBool:   {"bool": true, "int": true},
	NormalizedTypeDate:   {"string": true},
}

func ValidateInListTypes(values []any, fieldNormalizedType string) error {
	if fieldNormalizedType == "" {
		return nil
	}

	if len(values) == 0 {
		return nil
	}

	allowedTypes, ok := inCompatibleTypes[fieldNormalizedType]
	if !ok {
		return nil
	}

	for _, value := range values {
		valueType := getValueType(value)
		if valueType != "" && !allowedTypes[valueType] {
			return fmt.Errorf("type mismatch in IN list: %s field cannot contain %s values", fieldNormalizedType, valueType)
		}
	}

	return nil
}
