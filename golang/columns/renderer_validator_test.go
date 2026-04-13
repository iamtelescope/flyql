package columns

import (
	"testing"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/flyqltype"
	"github.com/iamtelescope/flyql/golang/transformers"
)

type hrefRenderer struct{ BaseRenderer }

func (hrefRenderer) Name() string { return "href" }
func (hrefRenderer) ArgSchema() []transformers.ArgSpec {
	return []transformers.ArgSpec{{Type: flyqltype.String, Required: true}}
}

type truncateRenderer struct{ BaseRenderer }

func (truncateRenderer) Name() string { return "truncate" }
func (truncateRenderer) ArgSchema() []transformers.ArgSpec {
	return []transformers.ArgSpec{{Type: flyqltype.Int, Required: true}}
}

type hrefWithHook struct{ BaseRenderer }

func (hrefWithHook) Name() string { return "href" }
func (hrefWithHook) ArgSchema() []transformers.ArgSpec {
	return []transformers.ArgSpec{{Type: flyqltype.String, Required: true}}
}
func (hrefWithHook) Diagnose(args []any, _ ParsedColumn) []flyql.Diagnostic {
	if len(args) == 0 {
		return nil
	}
	s, ok := args[0].(string)
	if !ok {
		return nil
	}
	if !contains(s, "{{value}}") {
		return []flyql.Diagnostic{{
			Range:    flyql.Range{Start: 0, End: 1},
			Message:  "href should contain {{value}}",
			Severity: flyql.SeverityWarning,
			Code:     "custom_href_no_placeholder",
		}}
	}
	return nil
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || (len(sub) > 0 && indexOf(s, sub) >= 0))
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

func makeURLSchema() *flyql.ColumnSchema {
	col := flyql.NewColumn("url", flyqltype.String)
	return flyql.NewColumnSchema(map[string]*flyql.Column{"url": &col})
}

func parseCols(t *testing.T, text string) []ParsedColumn {
	t.Helper()
	cols, err := Parse(text, Capabilities{Transformers: true, Renderers: true})
	if err != nil {
		t.Fatalf("parse %q failed: %v", text, err)
	}
	return cols
}

func TestRendererUnknown(t *testing.T) {
	reg := DefaultRendererRegistry()
	_ = reg.Register(hrefRenderer{})
	cols := parseCols(t, `url as link|unknown("x")`)
	diags := DiagnoseWithOptions(cols, makeURLSchema(), DiagnoseOptions{RendererRegistry: reg})
	if len(diags) != 1 || diags[0].Code != flyql.CodeUnknownRenderer {
		t.Fatalf("expected 1 unknown_renderer diag, got %+v", diags)
	}
}

func TestRendererValidNoDiagnostics(t *testing.T) {
	reg := DefaultRendererRegistry()
	_ = reg.Register(hrefRenderer{})
	cols := parseCols(t, `url as link|href("/x")`)
	diags := DiagnoseWithOptions(cols, makeURLSchema(), DiagnoseOptions{RendererRegistry: reg})
	if len(diags) != 0 {
		t.Fatalf("expected 0 diags, got %+v", diags)
	}
}

func TestRendererArgCount(t *testing.T) {
	reg := DefaultRendererRegistry()
	_ = reg.Register(hrefRenderer{})
	cols := parseCols(t, `url as link|href("/x", "extra")`)
	diags := DiagnoseWithOptions(cols, makeURLSchema(), DiagnoseOptions{RendererRegistry: reg})
	found := false
	for _, d := range diags {
		if d.Code == flyql.CodeRendererArgCount {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected renderer_arg_count diag, got %+v", diags)
	}
}

func TestRendererArgType(t *testing.T) {
	reg := DefaultRendererRegistry()
	_ = reg.Register(hrefRenderer{})
	cols := parseCols(t, `url as link|href(42)`)
	diags := DiagnoseWithOptions(cols, makeURLSchema(), DiagnoseOptions{RendererRegistry: reg})
	found := false
	for _, d := range diags {
		if d.Code == flyql.CodeRendererArgType {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected renderer_arg_type diag, got %+v", diags)
	}
}

func TestRendererPerRendererDiagnoseHook(t *testing.T) {
	reg := DefaultRendererRegistry()
	_ = reg.Register(hrefWithHook{})
	cols := parseCols(t, `url as link|href("/static")`)
	diags := DiagnoseWithOptions(cols, makeURLSchema(), DiagnoseOptions{RendererRegistry: reg})
	found := false
	for _, d := range diags {
		if d.Code == "custom_href_no_placeholder" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected custom diag from Diagnose hook, got %+v", diags)
	}
}

func TestRendererChainLevelDiagnoseHook(t *testing.T) {
	reg := DefaultRendererRegistry()
	_ = reg.Register(hrefRenderer{})
	_ = reg.Register(truncateRenderer{})
	reg.SetDiagnose(func(col ParsedColumn, chain []Renderer) []flyql.Diagnostic {
		names := make([]string, len(chain))
		for i, r := range chain {
			names[i] = r.Name
		}
		var ti, hi = -1, -1
		for i, n := range names {
			if n == "truncate" {
				ti = i
			}
			if n == "href" {
				hi = i
			}
		}
		if ti >= 0 && hi >= 0 && ti < hi {
			return []flyql.Diagnostic{{
				Range:    flyql.Range{Start: 0, End: 1},
				Message:  "href cannot follow truncate",
				Severity: flyql.SeverityError,
				Code:     "chain_forbidden",
			}}
		}
		return nil
	})
	cols := parseCols(t, `url as link|truncate(10)|href("/x")`)
	diags := DiagnoseWithOptions(cols, makeURLSchema(), DiagnoseOptions{RendererRegistry: reg})
	found := false
	for _, d := range diags {
		if d.Code == "chain_forbidden" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected chain_forbidden diag, got %+v", diags)
	}
}

func TestRendererNilRegistryEmitsUnknownRenderer(t *testing.T) {
	cols := parseCols(t, `url as link|href("/x")`)
	diags := DiagnoseWithOptions(cols, makeURLSchema(), DiagnoseOptions{})
	if len(diags) != 1 || diags[0].Code != flyql.CodeUnknownRenderer {
		t.Fatalf("expected 1 unknown_renderer diag, got %+v", diags)
	}
}
