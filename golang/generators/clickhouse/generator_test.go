package clickhouse

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	flyql "github.com/iamtelescope/flyql/golang"
)

func getTestDataDir() string {
	_, filename, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(filename), "..", "..", "..", "tests-data", "generators", "clickhouse")
}

type columnsFile struct {
	Version     string               `json:"version"`
	Description string               `json:"description"`
	Columns     map[string]columnDef `json:"columns"`
}

type columnDef struct {
	Name       string   `json:"name"`
	JSONString bool     `json:"jsonstring"`
	Type       string   `json:"type"`
	Values     []string `json:"values"`
}

type testFile struct {
	Version     string     `json:"version"`
	Description string     `json:"description"`
	TestSuite   string     `json:"test_suite"`
	Tests       []testCase `json:"tests"`
}

type testCase struct {
	Name                  string   `json:"name"`
	Input                 string   `json:"input"`
	ExpectedResult        string   `json:"expected_result"`
	ExpectedSQL           string   `json:"expected_sql,omitempty"`
	ExpectedSQLContains   []string `json:"expected_sql_contains,omitempty"`
	ExpectedErrorContains string   `json:"expected_error_contains,omitempty"`
}

func loadColumns(t *testing.T) map[string]*Column {
	data, err := os.ReadFile(filepath.Join(getTestDataDir(), "columns.json"))
	if err != nil {
		t.Fatalf("failed to read columns.json: %v", err)
	}

	var ff columnsFile
	if err := json.Unmarshal(data, &ff); err != nil {
		t.Fatalf("failed to parse columns.json: %v", err)
	}

	columns := make(map[string]*Column)
	for name, fd := range ff.Columns {
		columns[name] = NewColumn(fd.Name, fd.JSONString, fd.Type, fd.Values)
	}
	return columns
}

func loadTestFile(t *testing.T, filename string) *testFile {
	data, err := os.ReadFile(filepath.Join(getTestDataDir(), filename))
	if err != nil {
		t.Fatalf("failed to read %s: %v", filename, err)
	}

	var tf testFile
	if err := json.Unmarshal(data, &tf); err != nil {
		t.Fatalf("failed to parse %s: %v", filename, err)
	}
	return &tf
}

func runTestCases(t *testing.T, filename string) {
	columns := loadColumns(t)
	tf := loadTestFile(t, filename)

	for _, tc := range tf.Tests {
		t.Run(tc.Name, func(t *testing.T) {
			result, err := flyql.Parse(tc.Input)
			if err != nil {
				t.Fatalf("parse error: %v", err)
			}

			sql, genErr := ToSQL(result.Root, columns)

			if tc.ExpectedResult == "error" {
				if genErr == nil {
					t.Errorf("expected error but got none")
					return
				}
				if tc.ExpectedErrorContains != "" && !strings.Contains(genErr.Error(), tc.ExpectedErrorContains) {
					t.Errorf("error %q does not contain %q", genErr.Error(), tc.ExpectedErrorContains)
				}
				return
			}

			if genErr != nil {
				t.Fatalf("unexpected error: %v", genErr)
			}

			if tc.ExpectedSQL != "" && sql != tc.ExpectedSQL {
				t.Errorf("SQL mismatch:\ngot:  %q\nwant: %q", sql, tc.ExpectedSQL)
			}

			if len(tc.ExpectedSQLContains) > 0 {
				for _, substr := range tc.ExpectedSQLContains {
					if !strings.Contains(sql, substr) {
						t.Errorf("SQL %q does not contain %q", sql, substr)
					}
				}
			}
		})
	}
}

func TestBasic(t *testing.T) {
	runTestCases(t, "basic.json")
}

func TestBoolean(t *testing.T) {
	runTestCases(t, "boolean.json")
}

func TestJSONColumns(t *testing.T) {
	runTestCases(t, "json_columns.json")
}

func TestMapArray(t *testing.T) {
	runTestCases(t, "map_array.json")
}

func TestErrors(t *testing.T) {
	runTestCases(t, "errors.json")
}

func TestTruthy(t *testing.T) {
	runTestCases(t, "truthy.json")
}

func TestNot(t *testing.T) {
	runTestCases(t, "not.json")
}

func TestIn(t *testing.T) {
	runTestCases(t, "in.json")
}

func TestEscapeParam(t *testing.T) {
	tests := []struct {
		name      string
		input     any
		expected  string
		expectErr bool
	}{
		{"string", "hello", "'hello'", false},
		{"string_with_quote", "test'quote", "'test\\'quote'", false},
		{"string_with_backslash", "test\\backslash", "'test\\\\backslash'", false},
		{"string_with_newline", "test\nNewline", "'test\\nNewline'", false},
		{"string_with_tab", "test\ttab", "'test\\ttab'", false},
		{"nil", nil, "NULL", false},
		{"int", 123, "123", false},
		{"int8", int8(8), "8", false},
		{"int64", int64(64), "64", false},
		{"uint", uint(42), "42", false},
		{"float32", float32(1.5), "1.5", false},
		{"float64", 12.34, "12.34", false},
		{"bool_true", true, "True", false},
		{"bool_false", false, "False", false},
		{"unknown_type", struct{ x int }{1}, "", true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result, err := EscapeParam(tc.input)
			if tc.expectErr {
				if err == nil {
					t.Errorf("expected error, got nil")
				}
			} else {
				if err != nil {
					t.Errorf("unexpected error: %v", err)
				}
				if result != tc.expected {
					t.Errorf("got %q, want %q", result, tc.expected)
				}
			}
		})
	}
}

func TestIsNumber(t *testing.T) {
	tests := []struct {
		name     string
		input    any
		expected bool
	}{
		{"string_int", "123", true},
		{"string_float", "12.34", true},
		{"string_negative", "-5", true},
		{"string_text", "hello", false},
		{"string_empty", "", false},
		{"int", 123, true},
		{"int8", int8(8), true},
		{"int64", int64(64), true},
		{"uint", uint(42), true},
		{"float32", float32(1.5), true},
		{"float", 12.34, true},
		{"negative_int", -5, true},
		{"nil", nil, false},
		{"bool", true, false},
		{"struct", struct{ x int }{1}, false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := IsNumber(tc.input)
			if result != tc.expected {
				t.Errorf("got %v, want %v", result, tc.expected)
			}
		})
	}
}

func TestPrepareLikePatternValue(t *testing.T) {
	tests := []struct {
		name            string
		input           string
		expectedPattern bool
		expectedValue   string
	}{
		{"no_pattern", "hello", false, "hello"},
		{"star_pattern", "hello*", true, "hello%"},
		{"multiple_stars", "*hello*world*", true, "%hello%world%"},
		{"escaped_star", "hello\\*world", false, "hello\\*world"},
		{"percent_escaping", "hello%world", true, "hello\\%world"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			pattern, value := PrepareLikePatternValue(tc.input)
			if pattern != tc.expectedPattern {
				t.Errorf("pattern: got %v, want %v", pattern, tc.expectedPattern)
			}
			if value != tc.expectedValue {
				t.Errorf("value: got %q, want %q", value, tc.expectedValue)
			}
		})
	}
}

func TestNormalizeClickHouseType(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		// Empty
		{"empty", "", ""},

		// String types
		{"string", "String", NormalizedTypeString},
		{"nullable_string", "Nullable(String)", NormalizedTypeString},
		{"lowcardinality_string", "LowCardinality(String)", NormalizedTypeString},
		{"fixedstring", "FixedString(100)", NormalizedTypeString},
		{"varchar", "VARCHAR(255)", NormalizedTypeString},

		// Int types
		{"int64", "Int64", NormalizedTypeInt},
		{"uint32", "UInt32", NormalizedTypeInt},
		{"nullable_int8", "Nullable(Int8)", NormalizedTypeInt},
		{"int16", "Int16", NormalizedTypeInt},
		{"uint64", "UInt64", NormalizedTypeInt},
		{"tinyint", "TINYINT(4)", NormalizedTypeInt},

		// Float types
		{"float64", "Float64", NormalizedTypeFloat},
		{"float32", "Float32", NormalizedTypeFloat},
		{"decimal", "Decimal(10,2)", NormalizedTypeFloat},
		{"decimal64", "Decimal64(4)", NormalizedTypeFloat},

		// Bool type
		{"bool", "Bool", NormalizedTypeBool},

		// Date types
		{"date", "Date", NormalizedTypeDate},
		{"date32", "Date32", NormalizedTypeDate},
		{"datetime", "DateTime", NormalizedTypeDate},
		{"datetime64", "DateTime64(3)", NormalizedTypeDate},
		{"datetime64_tz", "DateTime64(3, 'UTC')", NormalizedTypeDate},

		// JSON types
		{"json", "JSON", NormalizedTypeJSON},
		{"json_params", "JSON(a String)", NormalizedTypeJSON},

		// Array types
		{"array_string", "Array(String)", NormalizedTypeArray},
		{"array_int", "Array(Int64)", NormalizedTypeArray},

		// Map types
		{"map", "Map(String, Int64)", NormalizedTypeMap},
		{"map_complex", "Map(String, Array(Int64))", NormalizedTypeMap},

		// Tuple types
		{"tuple", "Tuple(String, Int64)", NormalizedTypeTuple},

		// Geometry types
		{"point", "Point", NormalizedTypeGeometry},
		{"ring", "Ring", NormalizedTypeGeometry},
		{"polygon", "Polygon", NormalizedTypeGeometry},

		// Interval types
		{"interval_second", "IntervalSecond", NormalizedTypeInterval},
		{"interval_day", "IntervalDay", NormalizedTypeInterval},

		// Special types (uuid, ipv4, ipv6 are classified as string in this impl)
		{"object", "Object", NormalizedTypeSpecial},
		{"nothing", "Nothing", NormalizedTypeSpecial},

		// Types classified as string
		{"uuid", "UUID", NormalizedTypeString},
		{"ipv4", "IPv4", NormalizedTypeString},
		{"ipv6", "IPv6", NormalizedTypeString},

		// Unknown type
		{"unknown", "UnknownType", ""},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := NormalizeClickHouseType(tc.input)
			if result != tc.expected {
				t.Errorf("got %q, want %q", result, tc.expected)
			}
		})
	}
}
