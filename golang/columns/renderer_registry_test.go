package columns

import (
	"testing"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/flyqltype"
	"github.com/iamtelescope/flyql/golang/transformers"
)

type plainRenderer struct{ BaseRenderer }

func (plainRenderer) Name() string                      { return "plain" }
func (plainRenderer) ArgSchema() []transformers.ArgSpec { return nil }

type badgeRenderer struct{ BaseRenderer }

func (badgeRenderer) Name() string { return "badge" }
func (badgeRenderer) ArgSchema() []transformers.ArgSpec {
	return []transformers.ArgSpec{{Type: flyqltype.String, Required: true}}
}

func TestDefaultRendererRegistryIsEmpty(t *testing.T) {
	reg := DefaultRendererRegistry()
	if len(reg.Names()) != 0 {
		t.Fatalf("expected empty registry, got %v", reg.Names())
	}
}

func TestRendererRegistryRegisterAndGet(t *testing.T) {
	reg := DefaultRendererRegistry()
	if err := reg.Register(plainRenderer{}); err != nil {
		t.Fatal(err)
	}
	if r := reg.Get("plain"); r == nil {
		t.Error("expected plain renderer to be registered")
	}
	if r := reg.Get("missing"); r != nil {
		t.Error("expected Get to return nil for missing renderer")
	}
}

func TestRendererRegistryRegisterDuplicate(t *testing.T) {
	reg := DefaultRendererRegistry()
	if err := reg.Register(plainRenderer{}); err != nil {
		t.Fatal(err)
	}
	if err := reg.Register(plainRenderer{}); err == nil {
		t.Error("expected duplicate register to return error")
	}
}

func TestRendererRegistryNames(t *testing.T) {
	reg := DefaultRendererRegistry()
	_ = reg.Register(plainRenderer{})
	_ = reg.Register(badgeRenderer{})
	names := reg.Names()
	if len(names) != 2 {
		t.Fatalf("expected 2 names, got %v", names)
	}
}

func TestRendererRegistrySetDiagnose(t *testing.T) {
	reg := DefaultRendererRegistry()
	if reg.GetDiagnose() != nil {
		t.Error("expected nil diagnose hook initially")
	}
	reg.SetDiagnose(func(col ParsedColumn, chain []Renderer) []flyql.Diagnostic {
		return nil
	})
	if reg.GetDiagnose() == nil {
		t.Error("expected diagnose hook to be set")
	}
}

func TestBaseRendererDescriptionDefault(t *testing.T) {
	if got := (BaseRenderer{}).Description(); got != "" {
		t.Errorf("Description() = %q, want empty", got)
	}
}
