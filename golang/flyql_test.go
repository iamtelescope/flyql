package flyql

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func getTestDataDir() string {
	_, filename, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(filename), "..", "tests-data", "core")
}

type parserTestFile struct {
	Version     string           `json:"version"`
	Description string           `json:"description"`
	TestSuite   string           `json:"test_suite"`
	Tests       []parserTestCase `json:"tests"`
}

type parserTestCase struct {
	Name           string       `json:"name"`
	Input          string       `json:"input"`
	ExpectedResult string       `json:"expected_result"`
	ExpectedAST    *expectedAST `json:"expected_ast,omitempty"`
	ExpectedError  *struct {
		Errno           int    `json:"errno,omitempty"`
		ErrnoOptions    []int  `json:"errno_options,omitempty"`
		MessageContains string `json:"message_contains,omitempty"`
	} `json:"expected_error,omitempty"`
}

type expectedAST struct {
	BoolOperator string              `json:"bool_operator"`
	Expression   *expectedExpression `json:"expression"`
	Left         *expectedAST        `json:"left"`
	Right        *expectedAST        `json:"right"`
}

type expectedExpression struct {
	Key       string `json:"key"`
	Operator  string `json:"operator"`
	Value     any    `json:"value"`
	ValueType string `json:"value_type"`
}

func nodeToExpectedAST(node *Node) *expectedAST {
	if node == nil {
		return nil
	}

	result := &expectedAST{
		BoolOperator: node.BoolOperator,
	}

	if node.Expression != nil {
		valueType := "string"
		if node.Expression.ValueType == ValueTypeNumber {
			valueType = "number"
		}
		result.Expression = &expectedExpression{
			Key:       node.Expression.Key.Raw,
			Operator:  node.Expression.Operator,
			Value:     node.Expression.Value,
			ValueType: valueType,
		}
	}

	result.Left = nodeToExpectedAST(node.Left)
	result.Right = nodeToExpectedAST(node.Right)

	return result
}

func normalizeAST(node *expectedAST) *expectedAST {
	if node == nil {
		return nil
	}

	if node.Expression == nil &&
		node.Left != nil &&
		node.Left.Expression != nil &&
		node.Right == nil &&
		node.Left.Left == nil &&
		node.Left.Right == nil {
		return &expectedAST{
			BoolOperator: "",
			Expression:   node.Left.Expression,
			Left:         nil,
			Right:        nil,
		}
	}

	if node.Expression == nil &&
		node.Left == nil &&
		node.Right != nil {
		return normalizeAST(node.Right)
	}

	result := &expectedAST{
		BoolOperator: node.BoolOperator,
		Expression:   node.Expression,
	}
	if node.Left != nil {
		result.Left = normalizeAST(node.Left)
	}
	if node.Right != nil {
		result.Right = normalizeAST(node.Right)
	}

	return result
}

func compareExpectedASTs(t *testing.T, got *expectedAST, want *expectedAST, path string) {
	if want == nil {
		if got != nil {
			t.Errorf("%s: expected nil node but got non-nil", path)
		}
		return
	}

	if got == nil {
		t.Errorf("%s: expected non-nil node but got nil", path)
		return
	}

	if got.BoolOperator != want.BoolOperator {
		t.Errorf("%s: BoolOperator mismatch: got %q, want %q", path, got.BoolOperator, want.BoolOperator)
	}

	if want.Expression != nil {
		if got.Expression == nil {
			t.Errorf("%s: expected expression but got nil", path)
			return
		}

		if got.Expression.Key != want.Expression.Key {
			t.Errorf("%s: Key mismatch: got %q, want %q", path, got.Expression.Key, want.Expression.Key)
		}

		if got.Expression.Operator != want.Expression.Operator {
			t.Errorf("%s: Operator mismatch: got %q, want %q", path, got.Expression.Operator, want.Expression.Operator)
		}

		if got.Expression.ValueType != want.Expression.ValueType {
			t.Errorf("%s: ValueType mismatch: got %v, want %v", path, got.Expression.ValueType, want.Expression.ValueType)
		}

		switch wv := want.Expression.Value.(type) {
		case float64:
			gv, ok := got.Expression.Value.(float64)
			if !ok {
				t.Errorf("%s: Value type mismatch: got %T, want float64", path, got.Expression.Value)
			} else if gv != wv {
				t.Errorf("%s: Value mismatch: got %v, want %v", path, gv, wv)
			}
		case string:
			gv, ok := got.Expression.Value.(string)
			if !ok {
				t.Errorf("%s: Value type mismatch: got %T, want string", path, got.Expression.Value)
			} else if gv != wv {
				t.Errorf("%s: Value mismatch: got %q, want %q", path, gv, wv)
			}
		}
	} else if got.Expression != nil {
		t.Errorf("%s: expected nil expression but got non-nil", path)
	}

	compareExpectedASTs(t, got.Left, want.Left, path+".Left")
	compareExpectedASTs(t, got.Right, want.Right, path+".Right")
}

func TestParser(t *testing.T) {
	files := []string{
		"parser/basic.json",
		"parser/boolean.json",
		"parser/complex.json",
		"parser/errors.json",
		"parser/quoted_keys.json",
		"parser/syntax.json",
		"parser/whitespace.json",
	}

	for _, file := range files {
		data, err := os.ReadFile(filepath.Join(getTestDataDir(), file))
		if err != nil {
			t.Logf("skipping %s: %v", file, err)
			continue
		}

		var testFile parserTestFile
		if err := json.Unmarshal(data, &testFile); err != nil {
			t.Fatalf("failed to parse %s: %v", file, err)
		}

		suiteName := filepath.Base(file)
		t.Run(suiteName, func(t *testing.T) {
			for _, tc := range testFile.Tests {
				t.Run(tc.Name, func(t *testing.T) {
					result, err := Parse(tc.Input)

					if tc.ExpectedResult == "error" {
						if err == nil {
							t.Errorf("expected error but got none for input: %q", tc.Input)
						} else if tc.ExpectedError != nil {
							parseErr, ok := err.(*ParseError)
							if ok {
								if tc.ExpectedError.Errno != 0 && parseErr.Code != tc.ExpectedError.Errno {
									found := false
									for _, opt := range tc.ExpectedError.ErrnoOptions {
										if parseErr.Code == opt {
											found = true
											break
										}
									}
									if !found && len(tc.ExpectedError.ErrnoOptions) == 0 {
										t.Errorf("errno mismatch: got %d, want %d", parseErr.Code, tc.ExpectedError.Errno)
									}
								}
							}
						}
						return
					}

					if err != nil {
						t.Errorf("unexpected error for input %q: %v", tc.Input, err)
						return
					}

					if tc.ExpectedAST != nil {
						gotAST := normalizeAST(nodeToExpectedAST(result.Root))
						compareExpectedASTs(t, gotAST, tc.ExpectedAST, "Root")
					}
				})
			}
		})
	}
}
