package postgresql

import (
	"strings"
	"testing"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/flyqltype"
	"github.com/iamtelescope/flyql/golang/transformers"
)

type pgAnyTransformer struct{}

func (pgAnyTransformer) Name() string                                     { return "accepts_any" }
func (pgAnyTransformer) Description() string                              { return "" }
func (pgAnyTransformer) InputType() flyqltype.Type                        { return flyqltype.Any }
func (pgAnyTransformer) OutputType() flyqltype.Type                       { return flyqltype.String }
func (pgAnyTransformer) ArgSchema() []transformers.ArgSpec                { return nil }
func (pgAnyTransformer) SQL(dialect, columnRef string, args []any) string { return columnRef }
func (pgAnyTransformer) Apply(value any, args []any) any                  { return value }

type pgAnyArrayTransformer struct{}

func (pgAnyArrayTransformer) Name() string                                     { return "accepts_any_returning_array" }
func (pgAnyArrayTransformer) Description() string                              { return "" }
func (pgAnyArrayTransformer) InputType() flyqltype.Type                        { return flyqltype.Any }
func (pgAnyArrayTransformer) OutputType() flyqltype.Type                       { return flyqltype.Array }
func (pgAnyArrayTransformer) ArgSchema() []transformers.ArgSpec                { return nil }
func (pgAnyArrayTransformer) SQL(dialect, columnRef string, args []any) string { return columnRef }
func (pgAnyArrayTransformer) Apply(value any, args []any) any                  { return value }

func pgRegistryWithAny(t *testing.T) *transformers.TransformerRegistry {
	t.Helper()
	reg := transformers.DefaultRegistry()
	if err := reg.Register(pgAnyTransformer{}); err != nil {
		t.Fatalf("Register(pgAnyTransformer): %v", err)
	}
	if err := reg.Register(pgAnyArrayTransformer{}); err != nil {
		t.Fatalf("Register(pgAnyArrayTransformer): %v", err)
	}
	return reg
}

func TestValidateTransformerChain_AnyInputBypass_PostgreSQL(t *testing.T) {
	reg := pgRegistryWithAny(t)
	chain := []flyql.Transformer{{Name: "accepts_any"}}
	if err := validateTransformerChain(chain, reg); err != nil {
		t.Errorf("validateTransformerChain([accepts_any]) returned error: %v; want nil (Any bypass)", err)
	}
}

func TestValidateTransformerChain_DownstreamStrictAfterAny_PostgreSQL(t *testing.T) {
	reg := pgRegistryWithAny(t)
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
