package transformers

import (
	"strings"
	"testing"

	"github.com/iamtelescope/flyql/golang/flyqltype"
)

func TestDefaultRegistry(t *testing.T) {
	r := DefaultRegistry()
	names := r.Names()

	if len(names) != 4 {
		t.Fatalf("DefaultRegistry has %d transformers, want 4", len(names))
	}

	expected := []string{"len", "lower", "split", "upper"}
	for i, name := range names {
		if name != expected[i] {
			t.Errorf("Names()[%d] = %q, want %q", i, name, expected[i])
		}
	}
}

func TestRegistryGet(t *testing.T) {
	r := DefaultRegistry()

	upper := r.Get("upper")
	if upper == nil {
		t.Fatal("Get(\"upper\") returned nil")
	}
	if upper.Name() != "upper" {
		t.Errorf("Get(\"upper\").Name() = %q, want %q", upper.Name(), "upper")
	}

	lower := r.Get("lower")
	if lower == nil {
		t.Fatal("Get(\"lower\") returned nil")
	}

	l := r.Get("len")
	if l == nil {
		t.Fatal("Get(\"len\") returned nil")
	}
}

func TestRegistryGetUnknown(t *testing.T) {
	r := DefaultRegistry()
	if got := r.Get("nonexistent"); got != nil {
		t.Errorf("Get(\"nonexistent\") = %v, want nil", got)
	}
}

func TestRegistryDuplicateRegistration(t *testing.T) {
	r := DefaultRegistry()
	err := r.Register(Upper{})
	if err == nil {
		t.Fatal("Register(Upper{}) should return error for duplicate")
	}
}

func TestRegistryRegisterNew(t *testing.T) {
	r := &TransformerRegistry{
		transformers: make(map[string]Transformer),
	}
	err := r.Register(Upper{})
	if err != nil {
		t.Fatalf("Register(Upper{}) returned error: %v", err)
	}
	if r.Get("upper") == nil {
		t.Error("Get(\"upper\") returned nil after registration")
	}
}

func TestDefaultRegistryReturnsFreshInstance(t *testing.T) {
	r1 := DefaultRegistry()
	r2 := DefaultRegistry()
	if r1 == r2 {
		t.Error("DefaultRegistry() should return a fresh instance each call")
	}
}

type anyOutputTransformer struct{}

func (anyOutputTransformer) Name() string                                     { return "any_output" }
func (anyOutputTransformer) Description() string                              { return "" }
func (anyOutputTransformer) InputType() flyqltype.Type                        { return flyqltype.String }
func (anyOutputTransformer) OutputType() flyqltype.Type                       { return flyqltype.Any }
func (anyOutputTransformer) ArgSchema() []ArgSpec                             { return nil }
func (anyOutputTransformer) SQL(dialect, columnRef string, args []any) string { return columnRef }
func (anyOutputTransformer) Apply(value any, args []any) any                  { return value }

type anyArgTransformer struct{}

func (anyArgTransformer) Name() string               { return "any_arg" }
func (anyArgTransformer) Description() string        { return "" }
func (anyArgTransformer) InputType() flyqltype.Type  { return flyqltype.String }
func (anyArgTransformer) OutputType() flyqltype.Type { return flyqltype.String }
func (anyArgTransformer) ArgSchema() []ArgSpec {
	return []ArgSpec{{Type: flyqltype.Any, Required: true}}
}
func (anyArgTransformer) SQL(dialect, columnRef string, args []any) string { return columnRef }
func (anyArgTransformer) Apply(value any, args []any) any                  { return value }

func TestRegisterRejectsAnyOutputType(t *testing.T) {
	r := &TransformerRegistry{transformers: make(map[string]Transformer)}
	err := r.Register(anyOutputTransformer{})
	if err == nil {
		t.Fatal("Register(anyOutputTransformer{}) returned nil error; want rejection")
	}
	if !strings.Contains(err.Error(), "OutputType cannot be flyqltype.Any") {
		t.Errorf("error = %q, want substring %q", err.Error(), "OutputType cannot be flyqltype.Any")
	}
}

func TestRegisterRejectsAnyArgType(t *testing.T) {
	r := &TransformerRegistry{transformers: make(map[string]Transformer)}
	err := r.Register(anyArgTransformer{})
	if err == nil {
		t.Fatal("Register(anyArgTransformer{}) returned nil error; want rejection")
	}
	if !strings.Contains(err.Error(), "ArgSpec.Type cannot be flyqltype.Any") {
		t.Errorf("error = %q, want substring %q", err.Error(), "ArgSpec.Type cannot be flyqltype.Any")
	}
}
