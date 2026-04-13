package columns

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	flyql "github.com/iamtelescope/flyql/golang"
)

func testDataPath(filename string) string {
	_, file, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(file), "..", "..", "tests-data", "columns", "parser", filename)
}

type expectedTransformer struct {
	Name      string `json:"name"`
	Arguments []any  `json:"arguments"`
}

type expectedRenderer struct {
	Name      string `json:"name"`
	Arguments []any  `json:"arguments"`
}

type expectedColumn struct {
	Name         string                `json:"name"`
	Transformers []expectedTransformer `json:"transformers"`
	Alias        *string               `json:"alias"`
	Segments     []string              `json:"segments"`
	IsSegmented  bool                  `json:"is_segmented"`
	DisplayName  string                `json:"display_name"`
	Renderers    []expectedRenderer    `json:"renderers,omitempty"`
}

type expectedError struct {
	Errno           int    `json:"errno"`
	MessageContains string `json:"message_contains"`
}

type testCapabilities struct {
	Transformers *bool `json:"transformers,omitempty"`
	Renderers    *bool `json:"renderers,omitempty"`
}

type testCase struct {
	Name            string            `json:"name"`
	Input           string            `json:"input"`
	ExpectedResult  string            `json:"expected_result"`
	ExpectedColumns []expectedColumn  `json:"expected_columns"`
	ExpectedError   *expectedError    `json:"expected_error"`
	Capabilities    *testCapabilities `json:"capabilities,omitempty"`
}

type testSuite struct {
	Tests               []testCase        `json:"tests"`
	DefaultCapabilities *testCapabilities `json:"default_capabilities,omitempty"`
}

func resolveCapabilities(tc testCase, suite testSuite) Capabilities {
	caps := Capabilities{}
	src := tc.Capabilities
	if src == nil {
		src = suite.DefaultCapabilities
	}
	if src != nil {
		if src.Transformers != nil {
			caps.Transformers = *src.Transformers
		}
		if src.Renderers != nil {
			caps.Renderers = *src.Renderers
		}
	}
	return caps
}

func loadTestSuite(t *testing.T, filename string) testSuite {
	t.Helper()
	path := testDataPath(filename)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read test data %s: %v", path, err)
	}
	var suite testSuite
	if err := json.Unmarshal(data, &suite); err != nil {
		t.Fatalf("failed to parse test data %s: %v", path, err)
	}
	return suite
}

// normalizeForComparison serializes a value to JSON for comparison,
// handling int vs float64 differences.
func normalizeForComparison(t *testing.T, v any) string {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("failed to marshal for comparison: %v", err)
	}
	return string(b)
}

func compareParsedColumn(t *testing.T, idx int, got ParsedColumn, want expectedColumn) {
	t.Helper()

	if got.Name != want.Name {
		t.Errorf("column[%d].Name = %q, want %q", idx, got.Name, want.Name)
	}

	if got.IsSegmented != want.IsSegmented {
		t.Errorf("column[%d].IsSegmented = %v, want %v", idx, got.IsSegmented, want.IsSegmented)
	}

	if got.DisplayName != want.DisplayName {
		t.Errorf("column[%d].DisplayName = %q, want %q", idx, got.DisplayName, want.DisplayName)
	}

	// Compare alias
	if want.Alias == nil {
		if got.Alias != nil {
			t.Errorf("column[%d].Alias = %q, want nil", idx, *got.Alias)
		}
	} else {
		if got.Alias == nil {
			t.Errorf("column[%d].Alias = nil, want %q", idx, *want.Alias)
		} else if *got.Alias != *want.Alias {
			t.Errorf("column[%d].Alias = %q, want %q", idx, *got.Alias, *want.Alias)
		}
	}

	// Compare segments via JSON
	gotSegJSON := normalizeForComparison(t, got.Segments)
	wantSegJSON := normalizeForComparison(t, want.Segments)
	if gotSegJSON != wantSegJSON {
		t.Errorf("column[%d].Segments = %s, want %s", idx, gotSegJSON, wantSegJSON)
	}

	// Compare transformers via JSON to handle int/float64 differences
	gotTrJSON := normalizeForComparison(t, got.Transformers)
	wantTrJSON := normalizeForComparison(t, want.Transformers)
	if gotTrJSON != wantTrJSON {
		t.Errorf("column[%d].Transformers = %s, want %s", idx, gotTrJSON, wantTrJSON)
	}

	// Compare renderers via JSON (only when the fixture declares renderers)
	if len(want.Renderers) > 0 || len(got.Renderers) > 0 {
		wantR := want.Renderers
		if wantR == nil {
			wantR = []expectedRenderer{}
		}
		gotR := got.Renderers
		if gotR == nil {
			gotR = []Renderer{}
		}
		gotRJSON := normalizeForComparison(t, gotR)
		wantRJSON := normalizeForComparison(t, wantR)
		if gotRJSON != wantRJSON {
			t.Errorf("column[%d].Renderers = %s, want %s", idx, gotRJSON, wantRJSON)
		}
	}
}

func TestBasic(t *testing.T) {
	suite := loadTestSuite(t, "basic.json")

	for _, tc := range suite.Tests {
		t.Run(tc.Name, func(t *testing.T) {
			caps := resolveCapabilities(tc, suite)
			columns, err := Parse(tc.Input, caps)
			if tc.ExpectedResult == "success" {
				if err != nil {
					t.Fatalf("Parse(%q) returned error: %v", tc.Input, err)
				}
				if len(columns) != len(tc.ExpectedColumns) {
					t.Fatalf("Parse(%q) returned %d columns, want %d", tc.Input, len(columns), len(tc.ExpectedColumns))
				}
				for i, col := range columns {
					compareParsedColumn(t, i, col, tc.ExpectedColumns[i])
				}
			} else {
				if err == nil {
					t.Fatalf("Parse(%q) expected error, got nil", tc.Input)
				}
			}
		})
	}
}

func TestTransformers(t *testing.T) {
	suite := loadTestSuite(t, "transformers.json")

	for _, tc := range suite.Tests {
		t.Run(tc.Name, func(t *testing.T) {
			caps := resolveCapabilities(tc, suite)
			columns, err := Parse(tc.Input, caps)
			if tc.ExpectedResult == "success" {
				if err != nil {
					t.Fatalf("Parse(%q) returned error: %v", tc.Input, err)
				}
				if len(columns) != len(tc.ExpectedColumns) {
					t.Fatalf("Parse(%q) returned %d columns, want %d", tc.Input, len(columns), len(tc.ExpectedColumns))
				}
				for i, col := range columns {
					compareParsedColumn(t, i, col, tc.ExpectedColumns[i])
				}
			} else {
				if err == nil {
					t.Fatalf("Parse(%q) expected error, got nil", tc.Input)
				}
			}
		})
	}
}

func TestErrors(t *testing.T) {
	suite := loadTestSuite(t, "errors.json")

	for _, tc := range suite.Tests {
		t.Run(tc.Name, func(t *testing.T) {
			caps := resolveCapabilities(tc, suite)
			_, err := Parse(tc.Input, caps)
			if err == nil {
				t.Fatalf("Parse(%q) expected error, got nil", tc.Input)
			}

			parserErr, ok := err.(*ParserError)
			if !ok {
				t.Fatalf("Parse(%q) error is not *ParserError: %T", tc.Input, err)
			}

			if tc.ExpectedError != nil {
				if parserErr.Errno != tc.ExpectedError.Errno {
					t.Errorf("Parse(%q) errno = %d, want %d", tc.Input, parserErr.Errno, tc.ExpectedError.Errno)
				}
				if tc.ExpectedError.MessageContains != "" {
					if !strings.Contains(parserErr.Message, tc.ExpectedError.MessageContains) {
						t.Errorf("Parse(%q) error message %q does not contain %q", tc.Input, parserErr.Message, tc.ExpectedError.MessageContains)
					}
				}
			}
		})
	}
}

func TestRenderers(t *testing.T) {
	suite := loadTestSuite(t, "renderers.json")

	for _, tc := range suite.Tests {
		t.Run(tc.Name, func(t *testing.T) {
			caps := resolveCapabilities(tc, suite)
			columns, err := Parse(tc.Input, caps)
			if tc.ExpectedResult == "success" {
				if err != nil {
					t.Fatalf("Parse(%q) returned error: %v", tc.Input, err)
				}
				if len(columns) != len(tc.ExpectedColumns) {
					t.Fatalf("Parse(%q) returned %d columns, want %d", tc.Input, len(columns), len(tc.ExpectedColumns))
				}
				for i, col := range columns {
					compareParsedColumn(t, i, col, tc.ExpectedColumns[i])
				}
			} else {
				if err == nil {
					t.Fatalf("Parse(%q) expected error, got nil", tc.Input)
				}
			}
		})
	}
}

func TestRenderersErrors(t *testing.T) {
	suite := loadTestSuite(t, "renderers_errors.json")

	for _, tc := range suite.Tests {
		t.Run(tc.Name, func(t *testing.T) {
			caps := resolveCapabilities(tc, suite)
			_, err := Parse(tc.Input, caps)
			if err == nil {
				t.Fatalf("Parse(%q) expected error, got nil", tc.Input)
			}

			parserErr, ok := err.(*ParserError)
			if !ok {
				t.Fatalf("Parse(%q) error is not *ParserError: %T", tc.Input, err)
			}

			if tc.ExpectedError != nil {
				if parserErr.Errno != tc.ExpectedError.Errno {
					t.Errorf("Parse(%q) errno = %d, want %d", tc.Input, parserErr.Errno, tc.ExpectedError.Errno)
				}
				if tc.ExpectedError.MessageContains != "" {
					if !strings.Contains(parserErr.Message, tc.ExpectedError.MessageContains) {
						t.Errorf("Parse(%q) error message %q does not contain %q", tc.Input, parserErr.Message, tc.ExpectedError.MessageContains)
					}
				}
			}
		})
	}
}

func TestJSONSerialization(t *testing.T) {
	// Test that empty transformers serialize as [] not null
	columns, err := Parse("message", Capabilities{})
	if err != nil {
		t.Fatalf("Parse failed: %v", err)
	}

	data, err := json.Marshal(columns)
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}

	jsonStr := string(data)
	if strings.Contains(jsonStr, `"transformers":null`) {
		t.Error("transformers serialized as null instead of []")
	}
	if strings.Contains(jsonStr, `"arguments":null`) {
		t.Error("arguments serialized as null instead of []")
	}
	if !strings.Contains(jsonStr, `"alias":null`) {
		t.Error("alias should be null when not set")
	}
}

func TestParseToJSON(t *testing.T) {
	data, err := ParseToJSON("message|upper as MSG", Capabilities{Transformers: true})
	if err != nil {
		t.Fatalf("ParseToJSON failed: %v", err)
	}

	var columns []ParsedColumn
	if err := json.Unmarshal(data, &columns); err != nil {
		t.Fatalf("Unmarshal failed: %v", err)
	}

	if len(columns) != 1 {
		t.Fatalf("expected 1 column, got %d", len(columns))
	}
	if columns[0].Name != "message" {
		t.Errorf("Name = %q, want %q", columns[0].Name, "message")
	}
	if columns[0].Alias == nil || *columns[0].Alias != "MSG" {
		t.Error("Alias should be 'MSG'")
	}
	if columns[0].DisplayName != "MSG" {
		t.Errorf("DisplayName = %q, want %q", columns[0].DisplayName, "MSG")
	}
}

func TestRangeTracking(t *testing.T) {
	t.Run("single column", func(t *testing.T) {
		result, err := Parse("level", Capabilities{Transformers: true})
		if err != nil {
			t.Fatal(err)
		}
		if result[0].NameRange != (flyql.Range{Start: 0, End: 5}) {
			t.Errorf("NameRange = %v, want {0, 5}", result[0].NameRange)
		}
	})

	t.Run("multiple columns", func(t *testing.T) {
		result, err := Parse("level, service", Capabilities{Transformers: true})
		if err != nil {
			t.Fatal(err)
		}
		if result[0].NameRange != (flyql.Range{Start: 0, End: 5}) {
			t.Errorf("NameRange[0] = %v, want {0, 5}", result[0].NameRange)
		}
		if result[1].NameRange != (flyql.Range{Start: 7, End: 14}) {
			t.Errorf("NameRange[1] = %v, want {7, 14}", result[1].NameRange)
		}
	})

	t.Run("column with transformer", func(t *testing.T) {
		result, err := Parse("level|upper", Capabilities{Transformers: true})
		if err != nil {
			t.Fatal(err)
		}
		if result[0].NameRange != (flyql.Range{Start: 0, End: 5}) {
			t.Errorf("NameRange = %v, want {0, 5}", result[0].NameRange)
		}
		if len(result[0].TransformerRanges) != 1 {
			t.Fatalf("TransformerRanges length = %d, want 1", len(result[0].TransformerRanges))
		}
		if result[0].TransformerRanges[0].NameRange != (flyql.Range{Start: 6, End: 11}) {
			t.Errorf("TransformerRanges[0].NameRange = %v, want {6, 11}", result[0].TransformerRanges[0].NameRange)
		}
	})

	t.Run("chained transformers", func(t *testing.T) {
		result, err := Parse("level|upper|len", Capabilities{Transformers: true})
		if err != nil {
			t.Fatal(err)
		}
		if len(result[0].TransformerRanges) != 2 {
			t.Fatalf("TransformerRanges length = %d, want 2", len(result[0].TransformerRanges))
		}
		if result[0].TransformerRanges[0].NameRange != (flyql.Range{Start: 6, End: 11}) {
			t.Errorf("TransformerRanges[0].NameRange = %v, want {6, 11}", result[0].TransformerRanges[0].NameRange)
		}
		if result[0].TransformerRanges[1].NameRange != (flyql.Range{Start: 12, End: 15}) {
			t.Errorf("TransformerRanges[1].NameRange = %v, want {12, 15}", result[0].TransformerRanges[1].NameRange)
		}
	})

	t.Run("column with alias", func(t *testing.T) {
		result, err := Parse("level as lvl", Capabilities{Transformers: true})
		if err != nil {
			t.Fatal(err)
		}
		if result[0].NameRange != (flyql.Range{Start: 0, End: 5}) {
			t.Errorf("NameRange = %v, want {0, 5}", result[0].NameRange)
		}
	})
}
