package postgresql

import (
	"fmt"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/flyqltype"
)

type forbiddenOp struct {
	columnType flyqltype.Type
	operator   string
	valueType  string
}

var forbiddenOperations = map[forbiddenOp]bool{
	{flyqltype.String, flyql.OpLess, "int"}:              true,
	{flyqltype.String, flyql.OpLess, "float"}:            true,
	{flyqltype.String, flyql.OpGreater, "int"}:           true,
	{flyqltype.String, flyql.OpGreater, "float"}:         true,
	{flyqltype.String, flyql.OpGreaterOrEquals, "int"}:   true,
	{flyqltype.String, flyql.OpGreaterOrEquals, "float"}: true,
	{flyqltype.String, flyql.OpLessOrEquals, "int"}:      true,
	{flyqltype.String, flyql.OpLessOrEquals, "float"}:    true,

	{flyqltype.Int, flyql.OpRegex, "string"}:      true,
	{flyqltype.Float, flyql.OpRegex, "string"}:    true,
	{flyqltype.Int, flyql.OpNotRegex, "string"}:   true,
	{flyqltype.Float, flyql.OpNotRegex, "string"}: true,

	{flyqltype.Bool, flyql.OpLess, "bool"}:            true,
	{flyqltype.Bool, flyql.OpGreater, "bool"}:         true,
	{flyqltype.Bool, flyql.OpGreaterOrEquals, "bool"}: true,
	{flyqltype.Bool, flyql.OpLessOrEquals, "bool"}:    true,
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

func ValidateOperation(value any, columnType flyqltype.Type, operator string) error {
	if columnType == "" || columnType == flyqltype.Unknown {
		return nil
	}

	op := forbiddenOp{
		columnType: columnType,
		operator:   operator,
		valueType:  getValueType(value),
	}

	if forbiddenOperations[op] {
		return fmt.Errorf("operation not allowed: %s column with '%s' operator", columnType, operator)
	}

	return nil
}

var inCompatibleTypes = map[flyqltype.Type]map[string]bool{
	flyqltype.String: {"string": true},
	flyqltype.Int:    {"int": true, "float": true},
	flyqltype.Float:  {"int": true, "float": true},
	flyqltype.Bool:   {"bool": true, "int": true},
	flyqltype.Date:   {"string": true},
}

func ValidateInListTypes(values []any, columnType flyqltype.Type) error {
	if columnType == "" || columnType == flyqltype.Unknown {
		return nil
	}

	if len(values) == 0 {
		return nil
	}

	allowedTypes, ok := inCompatibleTypes[columnType]
	if !ok {
		return nil
	}

	for _, value := range values {
		valueType := getValueType(value)
		if valueType != "" && !allowedTypes[valueType] {
			return fmt.Errorf("type mismatch in IN list: %s column cannot contain %s values", columnType, valueType)
		}
	}

	return nil
}
