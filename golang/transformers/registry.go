package transformers

import (
	"fmt"
	"sort"

	"github.com/iamtelescope/flyql/golang/flyqltype"
)

// TransformerRegistry holds a collection of named transformers.
type TransformerRegistry struct {
	transformers map[string]Transformer
}

// Get returns the transformer with the given name, or nil if not found.
func (r *TransformerRegistry) Get(name string) Transformer {
	return r.transformers[name]
}

// Register adds a transformer to the registry. Returns an error if a
// transformer with the same name is already registered, or if the
// transformer declares flyqltype.Any as its OutputType or on any
// ArgSpec.Type. Any is a transformer-input sentinel only.
func (r *TransformerRegistry) Register(t Transformer) error {
	if _, exists := r.transformers[t.Name()]; exists {
		return fmt.Errorf("transformer '%s' is already registered", t.Name())
	}
	if t.OutputType() == flyqltype.Any {
		return fmt.Errorf("transformer %q: OutputType cannot be flyqltype.Any", t.Name())
	}
	for _, spec := range t.ArgSchema() {
		if spec.Type == flyqltype.Any {
			return fmt.Errorf("transformer %q: ArgSpec.Type cannot be flyqltype.Any", t.Name())
		}
	}
	r.transformers[t.Name()] = t
	return nil
}

// Names returns a sorted list of all registered transformer names.
func (r *TransformerRegistry) Names() []string {
	names := make([]string, 0, len(r.transformers))
	for name := range r.transformers {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

// DefaultRegistry returns a new TransformerRegistry pre-loaded with the
// built-in transformers (upper, lower, len).
func DefaultRegistry() *TransformerRegistry {
	r := &TransformerRegistry{
		transformers: make(map[string]Transformer),
	}
	_ = r.Register(Upper{})
	_ = r.Register(Lower{})
	_ = r.Register(Len{})
	_ = r.Register(Split{})
	return r
}
