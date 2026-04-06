package flyql

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

type typedCharsTestFile struct {
	Version     string               `json:"version"`
	Description string               `json:"description"`
	TestSuite   string               `json:"test_suite"`
	Tests       []typedCharsTestCase `json:"tests"`
}

type typedCharsTestCase struct {
	Name               string     `json:"name"`
	Input              string     `json:"input"`
	ExpectedTypedChars [][]string `json:"expected_typed_chars"`
}

func TestTypedCharsSharedFixtures(t *testing.T) {
	data, err := os.ReadFile(filepath.Join(getTestDataDir(), "parser", "typed_chars.json"))
	if err != nil {
		t.Fatalf("failed to read test data: %v", err)
	}

	var testFile typedCharsTestFile
	if err := json.Unmarshal(data, &testFile); err != nil {
		t.Fatalf("failed to parse test data: %v", err)
	}

	for _, tc := range testFile.Tests {
		t.Run(tc.Name, func(t *testing.T) {
			result, err := Parse(tc.Input)
			if err != nil {
				t.Fatalf("parse error for %q: %v", tc.Input, err)
			}

			if len(result.TypedChars) != len(tc.ExpectedTypedChars) {
				t.Fatalf("typed chars length mismatch for %q: got %d, want %d",
					tc.Input, len(result.TypedChars), len(tc.ExpectedTypedChars))
			}

			for i, expected := range tc.ExpectedTypedChars {
				actual := result.TypedChars[i]
				actualValue := string(actual.Value)
				if actualValue != expected[0] || actual.Type != expected[1] {
					t.Errorf("typed char [%d] for %q: got [%q, %q], want [%q, %q]",
						i, tc.Input, actualValue, actual.Type, expected[0], expected[1])
				}
			}
		})
	}
}

func TestTypedCharsPositionTracking(t *testing.T) {
	result, err := Parse("key=value")
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}

	if len(result.TypedChars) != 9 {
		t.Fatalf("expected 9 typed chars, got %d", len(result.TypedChars))
	}

	// Verify positions
	for i, tc := range result.TypedChars {
		if tc.Pos != i {
			t.Errorf("typed char [%d] pos: got %d, want %d", i, tc.Pos, i)
		}
		if tc.Line != 0 {
			t.Errorf("typed char [%d] line: got %d, want 0", i, tc.Line)
		}
		if tc.LinePos != i {
			t.Errorf("typed char [%d] linePos: got %d, want %d", i, tc.LinePos, i)
		}
	}

	// Verify types for key=value
	expectedTypes := []string{
		CharTypeKey, CharTypeKey, CharTypeKey, // k, e, y
		CharTypeOperator,                                                          // =
		CharTypeValue, CharTypeValue, CharTypeValue, CharTypeValue, CharTypeValue, // v, a, l, u, e
	}
	for i, et := range expectedTypes {
		if result.TypedChars[i].Type != et {
			t.Errorf("typed char [%d] type: got %q, want %q", i, result.TypedChars[i].Type, et)
		}
	}
}
