package matcher

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	flyql "github.com/iamtelescope/flyql/golang"
)

func getTestDataDir() string {
	_, filename, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(filename), "..", "..", "tests-data", "matcher")
}

type matcherTestFile struct {
	Version     string            `json:"version"`
	Description string            `json:"description"`
	TestSuite   string            `json:"test_suite"`
	Tests       []matcherTestCase `json:"tests"`
}

type matcherTestCase struct {
	Name     string         `json:"name"`
	Query    string         `json:"query"`
	Data     map[string]any `json:"data"`
	Expected bool           `json:"expected"`
}

func TestMatcherEvaluatesCorrectly(t *testing.T) {
	tests := []struct {
		name     string
		query    string
		data     map[string]any
		expected bool
	}{
		{"equals_string_match", "message=hello", map[string]any{"message": "hello"}, true},
		{"equals_string_no_match", "message=hello", map[string]any{"message": "hllo"}, false},
		{"not_equals_no_match", "message!=hello", map[string]any{"message": "hello"}, false},
		{"not_equals_match", "message!=hello", map[string]any{"message": "hellohello"}, true},
		{"regex_match", "message~hello", map[string]any{"message": "hello"}, true},
		{"regex_not_match", "message!~hello", map[string]any{"message": "hello"}, false},
		{"equals_int", "message=1", map[string]any{"message": 1}, true},
		{"quoted_string_vs_int_no_match", "message='1'", map[string]any{"message": 1}, false},
		{"quoted_string_vs_string_match", "message='1'", map[string]any{"message": "1"}, true},
		{"equals_float", "message=1.0", map[string]any{"message": 1.0}, true},
		{"double_quoted_string_vs_float", "message=\"1.0\"", map[string]any{"message": 1.0}, false},
		{"single_quoted_string_vs_float", "message='1.0'", map[string]any{"message": 1.0}, false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result, err := flyql.Parse(tc.query)
			if err != nil {
				t.Fatalf("parse error: %v", err)
			}

			evaluator := NewEvaluator()
			record := NewRecord(tc.data)
			got := evaluator.Evaluate(result.Root, record)

			if got != tc.expected {
				t.Errorf("query %q with data %v: got %v, want %v", tc.query, tc.data, got, tc.expected)
			}
		})
	}
}

func TestMatcherWithComplexQuery(t *testing.T) {
	query := "status=200 and message=hello"
	data := map[string]any{"status": 200, "message": "hello"}

	result, err := flyql.Parse(query)
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}

	evaluator := NewEvaluator()
	record := NewRecord(data)
	got := evaluator.Evaluate(result.Root, record)

	if !got {
		t.Errorf("expected true, got false")
	}
}

func TestMatcherWithOrOperator(t *testing.T) {
	query := "status=200 or status=404"
	data := map[string]any{"status": 404}

	result, err := flyql.Parse(query)
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}

	evaluator := NewEvaluator()
	record := NewRecord(data)
	got := evaluator.Evaluate(result.Root, record)

	if !got {
		t.Errorf("expected true, got false")
	}
}

func TestMatcherWithNestedJSON(t *testing.T) {
	query := "user.name=john"
	data := map[string]any{"user": map[string]any{"name": "john"}}

	result, err := flyql.Parse(query)
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}

	evaluator := NewEvaluator()
	record := NewRecord(data)
	got := evaluator.Evaluate(result.Root, record)

	if !got {
		t.Errorf("expected true, got false")
	}
}

func TestMatcherWithJSONString(t *testing.T) {
	query := "metadata.user.name=john"
	data := map[string]any{"metadata": `{"user": {"name": "john"}}`}

	result, err := flyql.Parse(query)
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}

	evaluator := NewEvaluator()
	record := NewRecord(data)
	got := evaluator.Evaluate(result.Root, record)

	if !got {
		t.Errorf("expected true, got false")
	}
}

func TestMatcherWithRegex(t *testing.T) {
	query := "message~^hello.*world$"
	data := map[string]any{"message": "hello beautiful world"}

	result, err := flyql.Parse(query)
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}

	evaluator := NewEvaluator()
	record := NewRecord(data)
	got := evaluator.Evaluate(result.Root, record)

	if !got {
		t.Errorf("expected true, got false")
	}
}

func TestMatcherWithComparisonOperators(t *testing.T) {
	query := "count>10 and price<=100.5"
	data := map[string]any{"count": 15, "price": 99.99}

	result, err := flyql.Parse(query)
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}

	evaluator := NewEvaluator()
	record := NewRecord(data)
	got := evaluator.Evaluate(result.Root, record)

	if !got {
		t.Errorf("expected true, got false")
	}
}

func TestMatchConvenienceFunction(t *testing.T) {
	result, err := Match("status=200", map[string]any{"status": 200})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result {
		t.Errorf("expected true, got false")
	}

	result, err = Match("status=404", map[string]any{"status": 200})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result {
		t.Errorf("expected false, got true")
	}
}

func TestMatcherFromDataFiles(t *testing.T) {
	files := []string{
		"truthy.json",
		"not.json",
		"in.json",
		"has.json",
	}

	for _, file := range files {
		data, err := os.ReadFile(filepath.Join(getTestDataDir(), file))
		if err != nil {
			t.Logf("skipping %s: %v", file, err)
			continue
		}

		var testFile matcherTestFile
		if err := json.Unmarshal(data, &testFile); err != nil {
			t.Fatalf("failed to parse %s: %v", file, err)
		}

		suiteName := filepath.Base(file)
		t.Run(suiteName, func(t *testing.T) {
			for _, tc := range testFile.Tests {
				t.Run(tc.Name, func(t *testing.T) {
					result, err := flyql.Parse(tc.Query)
					if err != nil {
						t.Fatalf("parse error for query %q: %v", tc.Query, err)
					}

					evaluator := NewEvaluator()
					record := NewRecord(tc.Data)
					got := evaluator.Evaluate(result.Root, record)

					if got != tc.Expected {
						t.Errorf("query %q with data %v: got %v, want %v", tc.Query, tc.Data, got, tc.Expected)
					}
				})
			}
		})
	}
}
