package flyql

import "strconv"

type ValueType int

const (
	ValueTypeString ValueType = iota
	ValueTypeNumber
)

type Expression struct {
	Key        Key
	Operator   string
	Value      any
	ValueType  ValueType
	Values     []any
	ValuesType *ValueType
}

func tryConvertToNumber(value string) (any, ValueType) {
	if f, err := strconv.ParseFloat(value, 64); err == nil {
		return f, ValueTypeNumber
	}
	return value, ValueTypeString
}

func NewExpression(key Key, operator string, value string, valueIsString bool) *Expression {
	expr := &Expression{
		Key:      key,
		Operator: operator,
	}

	if valueIsString {
		expr.Value = value
		expr.ValueType = ValueTypeString
	} else {
		expr.Value, expr.ValueType = tryConvertToNumber(value)
	}

	return expr
}

func NewInExpression(key Key, operator string, values []any, valuesType *ValueType) *Expression {
	return &Expression{
		Key:        key,
		Operator:   operator,
		Values:     values,
		ValuesType: valuesType,
	}
}
