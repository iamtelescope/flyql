// Package literal defines LiteralKind — the parser AST literal-kind
// vocabulary. These values are produced by the parser and consumed by
// generators, validators, and the matcher to know what kind of literal
// a parsed value represents (number, null, column reference, function
// call, parameter, etc.). LiteralKind is unrelated to flyql.Type, which
// is the column/value semantic-type vocabulary; the two were merged in
// name (both formerly called "ValueType"-ish) but represent different
// concepts. See the unify-column-type-system spec, Tech Decision #2.
package literal

// LiteralKind is the kind of literal recorded on a parsed Expression.
type LiteralKind string

const (
	Integer   LiteralKind = "int"
	BigInt    LiteralKind = "bigint"
	Float     LiteralKind = "float"
	String    LiteralKind = "string"
	Boolean   LiteralKind = "bool"
	Null      LiteralKind = "null"
	Array     LiteralKind = "array"
	Column    LiteralKind = "column"
	Function  LiteralKind = "function"
	Parameter LiteralKind = "parameter"
)
