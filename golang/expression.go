package flyql

import (
	"fmt"
	"strconv"

	"github.com/iamtelescope/flyql/golang/types"
)

type Expression struct {
	Key           Key
	Operator      string
	Value         any
	ValueType     types.ValueType
	Values        []any
	ValuesType    *string
	ValuesTypes   []types.ValueType
	Range         Range
	OperatorRange *Range
	ValueRange    *Range
	ValueRanges   []Range
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

func NewExpression(key Key, operator string, value string, valueIsString bool) (*Expression, error) {
	if operator != OpTruthy && !validKeyValueOperators[operator] {
		return nil, fmt.Errorf("invalid operator: %s", operator)
	}
	if len(key.Segments) == 0 {
		return nil, fmt.Errorf("empty key")
	}

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

	return expr, nil
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
