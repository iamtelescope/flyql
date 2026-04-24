package columns

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/flyqltype"
	"github.com/iamtelescope/flyql/golang/transformers"
)

func validatorDataPath() string {
	_, file, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(file), "..", "..", "tests-data", "columns", "validator.json")
}

type validatorExpectedDiag struct {
	Code            string `json:"code"`
	Severity        string `json:"severity"`
	Range           [2]int `json:"range"`
	MessageContains string `json:"message_contains"`
}

type validatorColumnDef struct {
	Name     string                        `json:"name"`
	Type     string                        `json:"type"`
	Children map[string]validatorColumnDef `json:"children,omitempty"`
}

type validatorTestCase struct {
	Name                string                  `json:"name"`
	Input               string                  `json:"input"`
	Capabilities        *testCapabilities       `json:"capabilities,omitempty"`
	Columns             []validatorColumnDef    `json:"columns"`
	ExpectedDiagnostics []validatorExpectedDiag `json:"expected_diagnostics"`
}

type validatorTestSuite struct {
	Tests []validatorTestCase `json:"tests"`
}

func makeValidatorSchema(defs []validatorColumnDef) *flyql.ColumnSchema {
	m := make(map[string]*flyql.Column, len(defs))
	for _, d := range defs {
		col := buildColumn(d)
		m[d.Name] = &col
	}
	return flyql.NewColumnSchema(m)
}

func buildColumn(d validatorColumnDef) flyql.Column {
	t, _ := flyql.ParseType(d.Type)
	col := flyql.NewColumn(d.Name, t)
	if len(d.Children) > 0 {
		col.Children = make(map[string]*flyql.Column, len(d.Children))
		for childName, childDef := range d.Children {
			child := buildColumn(childDef)
			col.Children[childName] = &child
		}
	}
	return col
}

func TestSharedValidatorFixtures(t *testing.T) {
	data, err := os.ReadFile(validatorDataPath())
	if err != nil {
		t.Fatalf("Cannot read fixture file: %v", err)
	}
	var suite validatorTestSuite
	if err := json.Unmarshal(data, &suite); err != nil {
		t.Fatalf("Cannot unmarshal fixture: %v", err)
	}

	for _, tc := range suite.Tests {
		t.Run(tc.Name, func(t *testing.T) {
			caps := Capabilities{Transformers: true}
			if tc.Capabilities != nil && tc.Capabilities.Transformers != nil {
				caps.Transformers = *tc.Capabilities.Transformers
			}
			parsed, parseErr := Parse(tc.Input, caps)
			if parseErr != nil {
				parsed = nil
			}
			schema := makeValidatorSchema(tc.Columns)
			diags := Diagnose(parsed, schema, nil)
			if diags == nil {
				diags = []flyql.Diagnostic{}
			}
			if len(diags) != len(tc.ExpectedDiagnostics) {
				t.Fatalf("Expected %d diagnostics, got %d", len(tc.ExpectedDiagnostics), len(diags))
			}
			for i, expected := range tc.ExpectedDiagnostics {
				if diags[i].Code != expected.Code {
					t.Errorf("diag[%d].Code = %q, want %q", i, diags[i].Code, expected.Code)
				}
				if string(diags[i].Severity) != expected.Severity {
					t.Errorf("diag[%d].Severity = %q, want %q", i, diags[i].Severity, expected.Severity)
				}
				if diags[i].Range.Start != expected.Range[0] || diags[i].Range.End != expected.Range[1] {
					t.Errorf("diag[%d].Range = {%d, %d}, want {%d, %d}",
						i, diags[i].Range.Start, diags[i].Range.End, expected.Range[0], expected.Range[1])
				}
			}
		})
	}
}

func TestDiagnose_UnknownColumn(t *testing.T) {
	parsed, err := Parse("foo", Capabilities{Transformers: true})
	if err != nil {
		t.Fatal(err)
	}
	columns := []flyql.Column{flyql.NewColumn("level", flyql.TypeString)}
	diags := Diagnose(parsed, flyql.FromColumns(columns), nil)
	if len(diags) != 1 {
		t.Fatalf("Expected 1 diagnostic, got %d", len(diags))
	}
	if diags[0].Code != flyql.CodeUnknownColumn {
		t.Errorf("Code = %q, want %q", diags[0].Code, flyql.CodeUnknownColumn)
	}
	if diags[0].Range.Start != 0 || diags[0].Range.End != 3 {
		t.Errorf("Range = {%d, %d}, want {0, 3}", diags[0].Range.Start, diags[0].Range.End)
	}
}

func TestDiagnose_UnknownTransformer(t *testing.T) {
	parsed, err := Parse("level|zzzz", Capabilities{Transformers: true})
	if err != nil {
		t.Fatal(err)
	}
	columns := []flyql.Column{flyql.NewColumn("level", flyql.TypeString)}
	diags := Diagnose(parsed, flyql.FromColumns(columns), nil)
	if len(diags) != 1 {
		t.Fatalf("Expected 1 diagnostic, got %d", len(diags))
	}
	if diags[0].Code != flyql.CodeUnknownTransformer {
		t.Errorf("Code = %q, want %q", diags[0].Code, flyql.CodeUnknownTransformer)
	}
	if diags[0].Range.Start != 6 || diags[0].Range.End != 10 {
		t.Errorf("Range = {%d, %d}, want {6, 10}", diags[0].Range.Start, diags[0].Range.End)
	}
}

func TestDiagnose_ValidColumn(t *testing.T) {
	parsed, err := Parse("level", Capabilities{Transformers: true})
	if err != nil {
		t.Fatal(err)
	}
	columns := []flyql.Column{flyql.NewColumn("level", flyql.TypeString)}
	diags := Diagnose(parsed, flyql.FromColumns(columns), nil)
	if len(diags) != 0 {
		t.Errorf("Expected 0 diagnostics, got %d", len(diags))
	}
}

func TestDiagnose_DottedColumnHighlightsBase(t *testing.T) {
	parsed, err := Parse("resource.service.name", Capabilities{Transformers: true})
	if err != nil {
		t.Fatal(err)
	}
	columns := []flyql.Column{flyql.NewColumn("level", flyql.TypeString)}
	diags := Diagnose(parsed, flyql.FromColumns(columns), nil)
	if len(diags) != 1 {
		t.Fatalf("Expected 1 diagnostic, got %d", len(diags))
	}
	if diags[0].Range.Start != 0 || diags[0].Range.End != 8 {
		t.Errorf("Range = {%d, %d}, want {0, 8} (just 'resource')", diags[0].Range.Start, diags[0].Range.End)
	}
}

// ---------------------------------------------------------------------------
// Diagnostic.Entry population (rich error objects in columns validator)
// ---------------------------------------------------------------------------

func TestColumnsDiagnoseEntryPopulated(t *testing.T) {
	parsed, err := Parse("foo", Capabilities{Transformers: true})
	if err != nil {
		t.Fatal(err)
	}
	cols := []flyql.Column{flyql.NewColumn("level", flyql.TypeString)}
	diags := Diagnose(parsed, flyql.FromColumns(cols), nil)
	if len(diags) != 1 {
		t.Fatalf("Expected 1 diagnostic, got %d", len(diags))
	}
	d := diags[0]
	if d.Entry.Name == "" {
		t.Errorf("Entry.Name empty for unknown_column")
	}
	codeStr, _ := d.Entry.Code.(string)
	if codeStr != d.Code {
		t.Errorf("Entry.Code = %v; want %q", d.Entry.Code, d.Code)
	}
}

type acceptsAnyT struct{}

func (acceptsAnyT) Name() string                                     { return "accepts_any" }
func (acceptsAnyT) Description() string                              { return "" }
func (acceptsAnyT) InputType() flyqltype.Type                        { return flyqltype.Any }
func (acceptsAnyT) OutputType() flyqltype.Type                       { return flyqltype.String }
func (acceptsAnyT) ArgSchema() []transformers.ArgSpec                { return nil }
func (acceptsAnyT) SQL(dialect, columnRef string, args []any) string { return columnRef }
func (acceptsAnyT) Apply(value any, args []any) any                  { return value }

type acceptsAnyReturningArrayT struct{}

func (acceptsAnyReturningArrayT) Name() string                                     { return "accepts_any_returning_array" }
func (acceptsAnyReturningArrayT) Description() string                              { return "" }
func (acceptsAnyReturningArrayT) InputType() flyqltype.Type                        { return flyqltype.Any }
func (acceptsAnyReturningArrayT) OutputType() flyqltype.Type                       { return flyqltype.Array }
func (acceptsAnyReturningArrayT) ArgSchema() []transformers.ArgSpec                { return nil }
func (acceptsAnyReturningArrayT) SQL(dialect, columnRef string, args []any) string { return columnRef }
func (acceptsAnyReturningArrayT) Apply(value any, args []any) any                  { return value }

func registryWithAny(t *testing.T) *transformers.TransformerRegistry {
	t.Helper()
	reg := transformers.DefaultRegistry()
	if err := reg.Register(acceptsAnyT{}); err != nil {
		t.Fatalf("Register(acceptsAnyT) failed: %v", err)
	}
	if err := reg.Register(acceptsAnyReturningArrayT{}); err != nil {
		t.Fatalf("Register(acceptsAnyReturningArrayT) failed: %v", err)
	}
	return reg
}

func TestColumnsValidator_AnyInputBypass(t *testing.T) {
	parsed, err := Parse("level|accepts_any", Capabilities{Transformers: true})
	if err != nil {
		t.Fatal(err)
	}
	cols := []flyql.Column{flyql.NewColumn("level", flyql.TypeInt)}
	diags := Diagnose(parsed, flyql.FromColumns(cols), registryWithAny(t))
	for _, d := range diags {
		if d.Code == flyql.CodeChainType {
			t.Errorf("expected no chain_type diagnostic, got %+v", d)
		}
	}
}

func TestColumnsValidator_ChainStrictAfterAnyInput(t *testing.T) {
	parsed, err := Parse("level|accepts_any_returning_array|upper", Capabilities{Transformers: true})
	if err != nil {
		t.Fatal(err)
	}
	cols := []flyql.Column{flyql.NewColumn("level", flyql.TypeInt)}
	diags := Diagnose(parsed, flyql.FromColumns(cols), registryWithAny(t))
	chainCount := 0
	for _, d := range diags {
		if d.Code == flyql.CodeChainType {
			chainCount++
		}
	}
	if chainCount != 1 {
		t.Fatalf("expected exactly 1 chain_type diagnostic, got %d (diags=%+v)", chainCount, diags)
	}
}

func TestColumnsParserErrorEntryPopulated(t *testing.T) {
	// Trigger a columns parser error: trailing pipe with no transformer.
	_, err := Parse("foo|", Capabilities{Transformers: true})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	pe, ok := err.(*ParserError)
	if !ok {
		t.Fatalf("expected *ParserError, got %T", err)
	}
	if pe.Errno == 0 {
		t.Fatalf("expected non-zero Errno, got 0")
	}
	if pe.Entry.Name == "" {
		t.Errorf("Entry.Name empty for errno=%d", pe.Errno)
	}
	codeInt, _ := pe.Entry.Code.(int)
	if codeInt != pe.Errno {
		t.Errorf("Entry.Code = %v; want %d", pe.Entry.Code, pe.Errno)
	}
}
