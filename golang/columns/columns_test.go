package columns

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func testDataPath(filename string) string {
	_, file, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(file), "..", "..", "tests-data", "columns", "parser", filename)
}

type expectedModifier struct {
	Name      string `json:"name"`
	Arguments []any  `json:"arguments"`
}

type expectedColumn struct {
	Name        string             `json:"name"`
	Modifiers   []expectedModifier `json:"modifiers"`
	Alias       *string            `json:"alias"`
	Segments    []string           `json:"segments"`
	IsSegmented bool               `json:"is_segmented"`
	DisplayName string             `json:"display_name"`
}

type expectedError struct {
	Errno           int    `json:"errno"`
	MessageContains string `json:"message_contains"`
}

type testCase struct {
	Name            string           `json:"name"`
	Input           string           `json:"input"`
	ExpectedResult  string           `json:"expected_result"`
	ExpectedColumns []expectedColumn `json:"expected_columns"`
	ExpectedError   *expectedError   `json:"expected_error"`
}

type testSuite struct {
	Tests []testCase `json:"tests"`
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

	// Compare modifiers via JSON to handle int/float64 differences
	gotModJSON := normalizeForComparison(t, got.Modifiers)
	wantModJSON := normalizeForComparison(t, want.Modifiers)
	if gotModJSON != wantModJSON {
		t.Errorf("column[%d].Modifiers = %s, want %s", idx, gotModJSON, wantModJSON)
	}
}

func TestBasic(t *testing.T) {
	suite := loadTestSuite(t, "basic.json")

	for _, tc := range suite.Tests {
		t.Run(tc.Name, func(t *testing.T) {
			columns, err := Parse(tc.Input)
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

func TestModifiers(t *testing.T) {
	suite := loadTestSuite(t, "modifiers.json")

	for _, tc := range suite.Tests {
		t.Run(tc.Name, func(t *testing.T) {
			columns, err := Parse(tc.Input)
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
			_, err := Parse(tc.Input)
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
	// Test that empty modifiers serialize as [] not null
	columns, err := Parse("message")
	if err != nil {
		t.Fatalf("Parse failed: %v", err)
	}

	data, err := json.Marshal(columns)
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}

	jsonStr := string(data)
	if strings.Contains(jsonStr, `"modifiers":null`) {
		t.Error("modifiers serialized as null instead of []")
	}
	if strings.Contains(jsonStr, `"arguments":null`) {
		t.Error("arguments serialized as null instead of []")
	}
	if !strings.Contains(jsonStr, `"alias":null`) {
		t.Error("alias should be null when not set")
	}
}

func TestParseToJSON(t *testing.T) {
	data, err := ParseToJSON("message|upper as MSG")
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
