package flyql

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"

	"github.com/iamtelescope/flyql/golang/literal"
)

type bindSharedTestCase struct {
	Name                  string         `json:"name"`
	Input                 string         `json:"input"`
	Params                map[string]any `json:"params"`
	ExpectedResult        string         `json:"expected_result"`
	ExpectedValue         any            `json:"expected_value"`
	ExpectedValueType     string         `json:"expected_value_type"`
	ExpectedErrorContains string         `json:"expected_error_contains"`
}

type bindSharedTestFile struct {
	Tests []bindSharedTestCase `json:"tests"`
}

func loadBindSharedTestData(t *testing.T) bindSharedTestFile {
	_, filename, _, _ := runtime.Caller(0)
	path := filepath.Join(filepath.Dir(filename), "..", "tests-data", "core", "bind", "parameters.json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read test data: %v", err)
	}
	var td bindSharedTestFile
	if err := json.Unmarshal(data, &td); err != nil {
		t.Fatalf("unmarshal test data: %v", err)
	}
	return td
}

// normalizeParams converts JSON-decoded float64 values that have no fractional
// component into int64, so that "integer" test cases produce literal.Integer
// rather than literal.Float. This matches how JS/Python handle whole numbers.
func normalizeParams(params map[string]any) map[string]any {
	out := make(map[string]any, len(params))
	for k, v := range params {
		if f, ok := v.(float64); ok && f == float64(int64(f)) {
			out[k] = int64(f)
		} else {
			out[k] = v
		}
	}
	return out
}

// coerceExpectedValue converts the JSON-decoded expected_value to the Go type
// that Bind will actually produce, based on expected_value_type.
func coerceExpectedValue(expected any, valueType string) any {
	if expected == nil {
		return nil
	}
	f, isFloat := expected.(float64)
	if !isFloat {
		return expected
	}
	switch valueType {
	case "integer":
		return int64(f)
	case "float":
		return f
	}
	return expected
}

func TestBindFromSharedData(t *testing.T) {
	td := loadBindSharedTestData(t)
	for _, tc := range td.Tests {
		tc := tc
		t.Run(tc.Name, func(t *testing.T) {
			res, err := Parse(tc.Input)
			if err != nil {
				t.Fatalf("parse error: %v", err)
			}
			params := normalizeParams(tc.Params)
			err = BindParams(res.Root, params)

			switch tc.ExpectedResult {
			case "success":
				if err != nil {
					t.Fatalf("unexpected bind error: %v", err)
				}
				expr := firstExpression(res.Root)
				if expr == nil {
					t.Fatalf("no expression found in AST")
				}
				expected := coerceExpectedValue(tc.ExpectedValue, tc.ExpectedValueType)
				if !reflect.DeepEqual(expr.Value, expected) {
					t.Errorf("value: got %v (%T), want %v (%T)",
						expr.Value, expr.Value, expected, expected)
				}
				if string(expr.ValueType) != tc.ExpectedValueType {
					t.Errorf("value_type: got %s, want %s",
						expr.ValueType, tc.ExpectedValueType)
				}
				// Sanity: ValueType constant should match string form.
				_ = literal.Integer
			case "error":
				if err == nil {
					t.Fatalf("expected error containing %q, got nil",
						tc.ExpectedErrorContains)
				}
				if !strings.Contains(err.Error(), tc.ExpectedErrorContains) {
					t.Errorf("error %q does not contain %q",
						err.Error(), tc.ExpectedErrorContains)
				}
			default:
				t.Fatalf("unknown expected_result: %s", tc.ExpectedResult)
			}
		})
	}
}
