package flyql

import (
	"fmt"
	"strconv"

	"github.com/iamtelescope/flyql/golang/literal"
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
	ValueType     literal.LiteralKind
	Values        []any
	ValuesType    *string
	ValuesTypes   []literal.LiteralKind
	Range         Range
	OperatorRange *Range
	ValueRange    *Range
	ValueRanges   []Range
}

func convertUnquotedValue(value string) (any, literal.LiteralKind) {
	if i, err := strconv.ParseInt(value, 10, 64); err == nil {
		return i, literal.Integer
	}
	if u, err := strconv.ParseUint(value, 10, 64); err == nil {
		return u, literal.BigInt
	}
	if f, err := strconv.ParseFloat(value, 64); err == nil {
		return f, literal.Float
	}
	return value, literal.Column
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
		expr.ValueType = literal.String
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
		ValueType: literal.Function,
	}
}

func NewParameterExpression(key Key, operator string, param *Parameter) *Expression {
	return &Expression{
		Key:       key,
		Operator:  operator,
		Value:     param,
		ValueType: literal.Parameter,
	}
}

func NewInExpression(key Key, operator string, values []any, valuesType *string, valuesTypes []literal.LiteralKind) *Expression {
	return &Expression{
		Key:         key,
		Operator:    operator,
		Values:      values,
		ValuesType:  valuesType,
		ValuesTypes: valuesTypes,
	}
}
