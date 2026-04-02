package flyql

import (
	"strconv"

	"github.com/iamtelescope/flyql/golang/types"
)

type Expression struct {
	Key         Key
	Operator    string
	Value       any
	ValueType   types.ValueType
	Values      []any
	ValuesType  *string
	ValuesTypes []types.ValueType
}

func tryConvertToNumber(value string) (any, types.ValueType) {
	if i, err := strconv.ParseInt(value, 10, 64); err == nil {
		return i, types.Integer
	}
	if u, err := strconv.ParseUint(value, 10, 64); err == nil {
		return u, types.BigInt
	}
	if f, err := strconv.ParseFloat(value, 64); err == nil {
		return f, types.Float
	}
	return value, types.String
}

func NewExpression(key Key, operator string, value string, valueIsString bool) *Expression {
	expr := &Expression{
		Key:      key,
		Operator: operator,
	}

	if valueIsString {
		expr.Value = value
		expr.ValueType = types.String
	} else {
		expr.Value, expr.ValueType = tryConvertToNumber(value)
	}

	return expr
}

func NewInExpression(key Key, operator string, values []any, valuesType *string, valuesTypes []types.ValueType) *Expression {
	return &Expression{
		Key:         key,
		Operator:    operator,
		Values:      values,
		ValuesType:  valuesType,
		ValuesTypes: valuesTypes,
	}
}
