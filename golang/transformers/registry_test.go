package transformers

import (
	"testing"
)

func TestDefaultRegistry(t *testing.T) {
	r := DefaultRegistry()
	names := r.Names()

	if len(names) != 3 {
		t.Fatalf("DefaultRegistry has %d transformers, want 3", len(names))
	}

	expected := []string{"len", "lower", "upper"}
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
