package transformers

import "github.com/iamtelescope/flyql/golang/flyqltype"

// ArgSpec describes a single argument in a transformer's schema.
type ArgSpec struct {
	Type     flyqltype.Type
	Required bool
}

// Transformer defines the interface for column value transformers.
// InputType and OutputType report the flyql semantic type the transformer
// accepts and produces respectively. They participate in chain typing
// during validation.
type Transformer interface {
	Name() string
	InputType() flyqltype.Type
	OutputType() flyqltype.Type
	ArgSchema() []ArgSpec
	SQL(dialect, columnRef string, args []any) string
	Apply(value interface{}, args []any) interface{}
}
