package flyql

import (
	"fmt"
	"strconv"

	"github.com/iamtelescope/flyql/golang/types"
)

type Duration struct {
	Value int64
	Unit  string
}

type FunctionCall struct {
	Name          string
	DurationArgs  []Duration
	Unit          string
	Timezone      string
	ParameterArgs []*Parameter
}

type Parameter struct {
	Name       string
	Positional bool
}

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

func convertUnquotedValue(value string) (any, types.ValueType) {
	if i, err := strconv.ParseInt(value, 10, 64); err == nil {
		return i, types.Integer
	}
	if u, err := strconv.ParseUint(value, 10, 64); err == nil {
		return u, types.BigInt
	}
	if f, err := strconv.ParseFloat(value, 64); err == nil {
		return f, types.Float
	}
	return value, types.Column
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
		expr.Value, expr.ValueType = convertUnquotedValue(value)
	}

	return expr, nil
}

func NewFunctionCallExpression(key Key, operator string, fc *FunctionCall) *Expression {
	return &Expression{
		Key:       key,
		Operator:  operator,
		Value:     fc,
		ValueType: types.Function,
	}
}

func NewParameterExpression(key Key, operator string, param *Parameter) *Expression {
	return &Expression{
		Key:       key,
		Operator:  operator,
		Value:     param,
		ValueType: types.Parameter,
	}
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
