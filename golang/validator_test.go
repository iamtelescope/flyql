package flyql

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/iamtelescope/flyql/golang/flyqltype"
	"github.com/iamtelescope/flyql/golang/transformers"
)

// ---------------------------------------------------------------------------
// Custom test transformers
// ---------------------------------------------------------------------------

type takesStringThenInt struct{}

func (takesStringThenInt) Name() string        { return "takes_string_then_int" }
func (takesStringThenInt) Description() string { return "" }
func (takesStringThenInt) InputType() flyqltype.Type {
	return flyqltype.String
}
func (takesStringThenInt) OutputType() flyqltype.Type {
	return flyqltype.String
}
func (takesStringThenInt) SQL(dialect, col string, args []any) string      { return col }
func (takesStringThenInt) Apply(value interface{}, args []any) interface{} { return value }
func (takesStringThenInt) ArgSchema() []transformers.ArgSpec {
	return []transformers.ArgSpec{
		{Type: flyqltype.String, Required: true},
		{Type: flyqltype.Int, Required: true},
	}
}

type stringToInt struct{}

func (stringToInt) Name() string        { return "string_to_int" }
func (stringToInt) Description() string { return "" }
func (stringToInt) InputType() flyqltype.Type {
	return flyqltype.String
}
func (stringToInt) OutputType() flyqltype.Type                      { return flyqltype.Int }
func (stringToInt) SQL(dialect, col string, args []any) string      { return col }
func (stringToInt) Apply(value interface{}, args []any) interface{} { return 0 }
func (stringToInt) ArgSchema() []transformers.ArgSpec               { return []transformers.ArgSpec{} }

type takesFloat struct{}

func (takesFloat) Name() string              { return "takes_float" }
func (takesFloat) Description() string       { return "" }
func (takesFloat) InputType() flyqltype.Type { return flyqltype.String }
func (takesFloat) OutputType() flyqltype.Type {
	return flyqltype.String
}
func (takesFloat) SQL(dialect, col string, args []any) string      { return col }
func (takesFloat) Apply(value interface{}, args []any) interface{} { return value }
func (takesFloat) ArgSchema() []transformers.ArgSpec {
	return []transformers.ArgSpec{
		{Type: flyqltype.Float, Required: true},
	}
}

type takesIntTransformer struct{}

func (takesIntTransformer) Name() string        { return "takes_int" }
func (takesIntTransformer) Description() string { return "" }
func (takesIntTransformer) InputType() flyqltype.Type {
	return flyqltype.String
}
func (takesIntTransformer) OutputType() flyqltype.Type {
	return flyqltype.String
}
func (takesIntTransformer) SQL(dialect, col string, args []any) string      { return col }
func (takesIntTransformer) Apply(value interface{}, args []any) interface{} { return value }
func (takesIntTransformer) ArgSchema() []transformers.ArgSpec {
	return []transformers.ArgSpec{
		{Type: flyqltype.Int, Required: true},
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func testRegistry() *transformers.TransformerRegistry {
	reg := transformers.DefaultRegistry()
	_ = reg.Register(takesStringThenInt{})
	_ = reg.Register(stringToInt{})
	_ = reg.Register(takesFloat{})
	_ = reg.Register(takesIntTransformer{})
	return reg
}

func makeColumn(name, typeStr string) Column {
	t, _ := ParseType(typeStr)
	return NewColumn(name, t)
}

func parseAST(t *testing.T, query string) *Node {
	t.Helper()
	result, err := Parse(query)
	if err != nil {
		t.Fatalf("Parse(%q) failed: %v", query, err)
	}
	return result.Root
}

// ---------------------------------------------------------------------------
// Shared fixture loading
// ---------------------------------------------------------------------------

type validatorFixtureColumn struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

type validatorExpectedDiag struct {
	Code            string `json:"code"`
	Severity        string `json:"severity"`
	Range           []int  `json:"range,omitempty"`
	MessageContains string `json:"message_contains,omitempty"`
}

type validatorTestCase struct {
	Name                string                   `json:"name"`
	Query               *string                  `json:"query"`
	Columns             []validatorFixtureColumn `json:"columns"`
	ExpectedDiagnostics []validatorExpectedDiag  `json:"expected_diagnostics"`
	AbsentCodes         []string                 `json:"absent_codes,omitempty"`
	UseDefaultRegistry  bool                     `json:"use_default_registry,omitempty"`
}

type validatorFixtureFile struct {
	Tests []validatorTestCase `json:"tests"`
}

func findValidatorFixture(t *testing.T) string {
	t.Helper()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	for i := 0; i < 5; i++ {
		candidate := filepath.Join(wd, "tests-data", "core", "validator.json")
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
		wd = filepath.Dir(wd)
	}
	t.Fatalf("could not locate tests-data/core/validator.json")
	return ""
}

func loadValidatorFixtures(t *testing.T) []validatorTestCase {
	t.Helper()
	data, err := os.ReadFile(findValidatorFixture(t))
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var ff validatorFixtureFile
	if err := json.Unmarshal(data, &ff); err != nil {
		t.Fatalf("unmarshal fixture: %v", err)
	}
	return ff.Tests
}

// ---------------------------------------------------------------------------
// Shared fixture-driven tests
// ---------------------------------------------------------------------------

func TestValidatorShared(t *testing.T) {
	cases := loadValidatorFixtures(t)
	reg := testRegistry()

	for _, tc := range cases {
		tc := tc
		t.Run(tc.Name, func(t *testing.T) {
			var cols []Column
			for _, c := range tc.Columns {
				cols = append(cols, makeColumn(c.Name, c.Type))
			}

			var registry *transformers.TransformerRegistry
			if !tc.UseDefaultRegistry {
				registry = reg
			}

			var ast *Node
			if tc.Query != nil {
				result, err := Parse(*tc.Query)
				if err != nil {
					t.Fatalf("Parse(%q) failed: %v", *tc.Query, err)
				}
				ast = result.Root
			}

			diags := Diagnose(ast, FromColumns(cols), registry)

			if len(diags) != len(tc.ExpectedDiagnostics) {
				t.Fatalf("expected %d diagnostics, got %d: %+v",
					len(tc.ExpectedDiagnostics), len(diags), diags)
			}

			for i, exp := range tc.ExpectedDiagnostics {
				d := diags[i]
				if d.Code != exp.Code {
					t.Errorf("diag[%d]: code=%q, want %q", i, d.Code, exp.Code)
				}
				if string(d.Severity) != exp.Severity {
					t.Errorf("diag[%d]: severity=%q, want %q", i, d.Severity, exp.Severity)
				}
				if len(exp.Range) == 2 {
					want := Range{Start: exp.Range[0], End: exp.Range[1]}
					if d.Range != want {
						t.Errorf("diag[%d]: range=%+v, want %+v", i, d.Range, want)
					}
				}
				if exp.MessageContains != "" {
					if !strings.Contains(d.Message, exp.MessageContains) {
						t.Errorf("diag[%d]: message %q does not contain %q",
							i, d.Message, exp.MessageContains)
					}
				}
			}

			// Check absent codes
			diagCodes := make(map[string]bool)
			for _, d := range diags {
				diagCodes[d.Code] = true
			}
			for _, absent := range tc.AbsentCodes {
				if diagCodes[absent] {
					t.Errorf("expected code %q to be absent, but found it", absent)
				}
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Language-specific tests
// ---------------------------------------------------------------------------

func TestDiagnoseInvalidASTGuard(t *testing.T) {
	reg := testRegistry()
	expr := &Expression{
		Key: Key{
			Segments:      []string{"foo"},
			Raw:           "foo",
			SegmentRanges: []Range{},
		},
		Operator: "=",
		Value:    "X",
	}
	node := &Node{
		BoolOperator: "and",
		Expression:   expr,
	}
	cols := []Column{makeColumn("foo", "string")}
	diags := Diagnose(node, FromColumns(cols), reg)
	if len(diags) != 1 {
		t.Fatalf("expected 1 diagnostic, got %d: %+v", len(diags), diags)
	}
	if diags[0].Code != CodeInvalidAST {
		t.Errorf("code = %q, want %q", diags[0].Code, CodeInvalidAST)
	}
	if diags[0].Range != (Range{Start: 0, End: 0}) {
		t.Errorf("range = %+v, want {0 0}", diags[0].Range)
	}
}

func TestDiagnoseDialectColumnSubclass(t *testing.T) {
	reg := testRegistry()
	col := Column{
		Name:      "`1host`",
		Type:      TypeString,
		MatchName: "1host",
		Suggest:   true,
	}
	ast := parseAST(t, "host='X'")
	cols := []Column{makeColumn("host", "string"), col}
	diags := Diagnose(ast, FromColumns(cols), reg)
	if len(diags) != 0 {
		t.Errorf("expected no diagnostics, got %d: %+v", len(diags), diags)
	}
}

func TestDiagnoseNilAST(t *testing.T) {
	cols := []Column{makeColumn("host", "string")}
	diags := Diagnose(nil, FromColumns(cols), nil)
	if diags != nil {
		t.Errorf("expected nil for nil AST, got %+v", diags)
	}
}

// ---------------------------------------------------------------------------
// Diagnostic.Entry population (rich error objects)
// ---------------------------------------------------------------------------

func TestDiagnosticEntryPopulated(t *testing.T) {
	reg := testRegistry()

	type tc struct {
		query string
		cols  []Column
		code  string
	}
	cases := []tc{
		{"unknown_col=1", []Column{makeColumn("known", "string")}, CodeUnknownColumn},
		{"host|wat", []Column{makeColumn("host", "string")}, CodeUnknownTransformer},
		{"host|takes_int(1, 2)", []Column{makeColumn("host", "string")}, CodeArgCount},
		{"host|takes_int('not-an-int')", []Column{makeColumn("host", "string")}, CodeArgType},
		{"n|string_to_int|takes_int(1)", []Column{makeColumn("n", "string")}, CodeChainType},
		{"field=nonexistent", []Column{makeColumn("field", "string")}, CodeUnknownColumnValue},
		{"event_day > foo+bar", []Column{makeColumn("event_day", "date")}, CodeInvalidColumnValue},
		{"ts > 'not-a-date'", []Column{makeColumn("ts", "datetime")}, CodeInvalidDatetimeLiteral},
	}
	for _, c := range cases {
		c := c
		t.Run(c.code, func(t *testing.T) {
			ast := parseAST(t, c.query)
			diags := Diagnose(ast, FromColumns(c.cols), reg)
			matched := false
			for _, d := range diags {
				if d.Code != c.code {
					continue
				}
				matched = true
				codeStr, _ := d.Entry.Code.(string)
				if codeStr != d.Code {
					t.Errorf("Entry.Code = %v; want %q", d.Entry.Code, d.Code)
				}
				if d.Entry.Name == "" {
					t.Errorf("Entry.Name is empty for %s", d.Code)
				}
				if d.Entry.Name != validatorRegistry[d.Code].Name {
					t.Errorf("Entry.Name mismatch: got %q, want %q", d.Entry.Name, validatorRegistry[d.Code].Name)
				}
			}
			if !matched {
				t.Fatalf("no diagnostic with code %q from %q (got %+v)", c.code, c.query, diags)
			}
		})
	}
}

func TestMakeDiagUnknownCodeReturnsZeroEntry(t *testing.T) {
	d := MakeDiag(Range{Start: 0, End: 1}, "totally_made_up", SeverityError, "fake")
	if d.Entry.Name != "" {
		t.Errorf("Entry.Name should be empty for unknown code; got %q", d.Entry.Name)
	}
	if d.Code != "totally_made_up" {
		t.Errorf("Code should be preserved; got %q", d.Code)
	}
}

// ---------------------------------------------------------------------------
// ParseError.Entry population
// ---------------------------------------------------------------------------

func TestParseErrorEntryPopulated(t *testing.T) {
	type tc struct {
		query string
		errno int
	}
	cases := []tc{
		{"", errEmptyInput},
		{"a='unclosed", errUnclosedString},
		{"(a=1", errUnmatchedParenAtEof},
		{"a= ", errUnexpectedEof},
	}
	for _, c := range cases {
		c := c
		t.Run("", func(t *testing.T) {
			_, err := Parse(c.query)
			if err == nil {
				t.Fatalf("Parse(%q): expected error, got nil", c.query)
			}
			pe, ok := err.(*ParseError)
			if !ok {
				t.Fatalf("Parse(%q): expected *ParseError, got %T", c.query, err)
			}
			if pe.Code != c.errno {
				t.Errorf("Code = %d; want %d", pe.Code, c.errno)
			}
			codeInt, _ := pe.Entry.Code.(int)
			if codeInt != c.errno {
				t.Errorf("Entry.Code = %v; want %d", pe.Entry.Code, c.errno)
			}
			if pe.Entry.Name == "" {
				t.Errorf("Entry.Name empty for errno=%d", c.errno)
			}
			if pe.Entry.Name != coreParserRegistry[c.errno].Name {
				t.Errorf("Entry.Name mismatch: got %q, want %q", pe.Entry.Name, coreParserRegistry[c.errno].Name)
			}
		})
	}
}
