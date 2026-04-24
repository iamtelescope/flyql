package clickhouse

import (
	"strings"
	"testing"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/flyqltype"
	"github.com/iamtelescope/flyql/golang/transformers"
)

type chAnyTransformer struct{}

func (chAnyTransformer) Name() string                                     { return "accepts_any" }
func (chAnyTransformer) Description() string                              { return "" }
func (chAnyTransformer) InputType() flyqltype.Type                        { return flyqltype.Any }
func (chAnyTransformer) OutputType() flyqltype.Type                       { return flyqltype.String }
func (chAnyTransformer) ArgSchema() []transformers.ArgSpec                { return nil }
func (chAnyTransformer) SQL(dialect, columnRef string, args []any) string { return columnRef }
func (chAnyTransformer) Apply(value any, args []any) any                  { return value }

type chAnyArrayTransformer struct{}

func (chAnyArrayTransformer) Name() string                                     { return "accepts_any_returning_array" }
func (chAnyArrayTransformer) Description() string                              { return "" }
func (chAnyArrayTransformer) InputType() flyqltype.Type                        { return flyqltype.Any }
func (chAnyArrayTransformer) OutputType() flyqltype.Type                       { return flyqltype.Array }
func (chAnyArrayTransformer) ArgSchema() []transformers.ArgSpec                { return nil }
func (chAnyArrayTransformer) SQL(dialect, columnRef string, args []any) string { return columnRef }
func (chAnyArrayTransformer) Apply(value any, args []any) any                  { return value }

func chRegistryWithAny(t *testing.T) *transformers.TransformerRegistry {
	t.Helper()
	reg := transformers.DefaultRegistry()
	if err := reg.Register(chAnyTransformer{}); err != nil {
		t.Fatalf("Register(chAnyTransformer): %v", err)
	}
	if err := reg.Register(chAnyArrayTransformer{}); err != nil {
		t.Fatalf("Register(chAnyArrayTransformer): %v", err)
	}
	return reg
}

func TestValidateTransformerChain_AnyInputBypass_ClickHouse(t *testing.T) {
	reg := chRegistryWithAny(t)
	chain := []flyql.Transformer{{Name: "accepts_any"}}
	if err := validateTransformerChain(chain, reg); err != nil {
		t.Errorf("validateTransformerChain([accepts_any]) returned error: %v; want nil (Any bypass)", err)
	}
}

func TestValidateTransformerChain_DownstreamStrictAfterAny_ClickHouse(t *testing.T) {
	reg := chRegistryWithAny(t)
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
