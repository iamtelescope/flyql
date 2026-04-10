package types

type ValueType string

const (
	Integer   ValueType = "integer"
	BigInt    ValueType = "bigint"
	Float     ValueType = "float"
	String    ValueType = "string"
	Boolean   ValueType = "boolean"
	Null      ValueType = "null"
	Array     ValueType = "array"
	Column    ValueType = "column"
	Function  ValueType = "function"
	Parameter ValueType = "parameter"
)
