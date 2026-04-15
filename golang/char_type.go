package flyql

// TypedChar represents a single character with its syntactic type,
// used for syntax highlighting and editor tooling.
type TypedChar struct {
	Value   rune
	Pos     int
	Line    int
	LinePos int
	Type    string
}

// CharType constants matching the JavaScript CharType values exactly.
const (
	CharTypeKey            = "flyqlKey"
	CharTypeValue          = "flyqlValue"
	CharTypeOperator       = "flyqlOperator"
	CharTypeNumber         = "number"
	CharTypeString         = "string"
	CharTypeBoolean        = "flyqlBoolean"
	CharTypeNull           = "flyqlNull"
	CharTypeSpace          = "space"
	CharTypePipe           = "flyqlPipe"
	CharTypeTransformer    = "flyqlTransformer"
	CharTypeFunction       = "flyqlFunction"
	CharTypeArgument       = "flyqlArgument"
	CharTypeArgumentString = "flyqlArgumentString"
	CharTypeArgumentNumber = "flyqlArgumentNumber"
	CharTypeWildcard       = "flyqlWildcard"
	CharTypeColumn         = "flyqlColumn"
	CharTypeParameter      = "flyqlParameter"
	CharTypeError          = "flyqlError"
)
