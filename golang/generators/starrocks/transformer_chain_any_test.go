package starrocks

import (
	"strings"
	"testing"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/flyqltype"
	"github.com/iamtelescope/flyql/golang/transformers"
)

type srAnyTransformer struct{}

func (srAnyTransformer) Name() string                                     { return "accepts_any" }
func (srAnyTransformer) Description() string                              { return "" }
func (srAnyTransformer) InputType() flyqltype.Type                        { return flyqltype.Any }
func (srAnyTransformer) OutputType() flyqltype.Type                       { return flyqltype.String }
func (srAnyTransformer) ArgSchema() []transformers.ArgSpec                { return nil }
func (srAnyTransformer) SQL(dialect, columnRef string, args []any) string { return columnRef }
func (srAnyTransformer) Apply(value any, args []any) any                  { return value }

type srAnyArrayTransformer struct{}

func (srAnyArrayTransformer) Name() string                                     { return "accepts_any_returning_array" }
func (srAnyArrayTransformer) Description() string                              { return "" }
func (srAnyArrayTransformer) InputType() flyqltype.Type                        { return flyqltype.Any }
func (srAnyArrayTransformer) OutputType() flyqltype.Type                       { return flyqltype.Array }
func (srAnyArrayTransformer) ArgSchema() []transformers.ArgSpec                { return nil }
func (srAnyArrayTransformer) SQL(dialect, columnRef string, args []any) string { return columnRef }
func (srAnyArrayTransformer) Apply(value any, args []any) any                  { return value }

func srRegistryWithAny(t *testing.T) *transformers.TransformerRegistry {
	t.Helper()
	reg := transformers.DefaultRegistry()
	if err := reg.Register(srAnyTransformer{}); err != nil {
		t.Fatalf("Register(srAnyTransformer): %v", err)
	}
	if err := reg.Register(srAnyArrayTransformer{}); err != nil {
		t.Fatalf("Register(srAnyArrayTransformer): %v", err)
	}
	return reg
}

func TestValidateTransformerChain_AnyInputBypass_StarRocks(t *testing.T) {
	reg := srRegistryWithAny(t)
	chain := []flyql.Transformer{{Name: "accepts_any"}}
	if err := validateTransformerChain(chain, reg); err != nil {
		t.Errorf("validateTransformerChain([accepts_any]) returned error: %v; want nil (Any bypass)", err)
	}
}

func TestValidateTransformerChain_DownstreamStrictAfterAny_StarRocks(t *testing.T) {
	reg := srRegistryWithAny(t)
	chain := []flyql.Transformer{
		{Name: "accepts_any_returning_array"},
		{Name: "upper"},
	}
	err := validateTransformerChain(chain, reg)
	if err == nil {
		t.Fatal("expected chain-type error at upper after array output; got nil")
	}
	if !strings.Contains(err.Error(), "upper") {
		t.Errorf("error = %q, want substring %q", err.Error(), "upper")
	}
}
