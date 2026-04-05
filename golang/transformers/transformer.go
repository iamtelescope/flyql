package transformers

// TransformerType represents the data type that a transformer operates on.
type TransformerType string

const (
	TransformerTypeString TransformerType = "string"
	TransformerTypeInt    TransformerType = "int"
	TransformerTypeFloat  TransformerType = "float"
	TransformerTypeBool   TransformerType = "bool"
	TransformerTypeArray  TransformerType = "array"
)

// ArgSpec describes a single argument in a transformer's schema.
type ArgSpec struct {
	Type     TransformerType
	Required bool
}

// Transformer defines the interface for column value transformers.
type Transformer interface {
	Name() string
	InputType() TransformerType
	OutputType() TransformerType
	ArgSchema() []ArgSpec
	SQL(dialect, columnRef string, args []any) string
	Apply(value interface{}, args []any) interface{}
}
