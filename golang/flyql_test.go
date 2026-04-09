package flyql

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
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
	Negated      bool                `json:"negated"`
	Expression   *expectedExpression `json:"expression"`
	Left         *expectedAST        `json:"left"`
	Right        *expectedAST        `json:"right"`
}

type expectedExpression struct {
	Key         string   `json:"key"`
	Operator    string   `json:"operator"`
	Value       any      `json:"value"`
	ValueType   string   `json:"value_type"`
	Values      []any    `json:"values,omitempty"`
	ValuesType  string   `json:"values_type,omitempty"`
	ValuesTypes []string `json:"values_types,omitempty"`
}

func nodeToExpectedAST(node *Node) *expectedAST {
	if node == nil {
		return nil
	}

	result := &expectedAST{
		BoolOperator: node.BoolOperator,
		Negated:      node.Negated,
	}

	if node.Expression != nil {
		var value any = node.Expression.Value
		if fc, ok := node.Expression.Value.(*FunctionCall); ok {
			durationArgs := make([]map[string]any, len(fc.DurationArgs))
			for i, d := range fc.DurationArgs {
				durationArgs[i] = map[string]any{"value": d.Value, "unit": d.Unit}
			}
			value = map[string]any{
				"name":          fc.Name,
				"duration_args": durationArgs,
				"unit":          fc.Unit,
				"timezone":      fc.Timezone,
			}
		}
		expr := &expectedExpression{
			Key:       node.Expression.Key.Raw,
			Operator:  node.Expression.Operator,
			Value:     value,
			ValueType: string(node.Expression.ValueType),
		}
		if node.Expression.Values != nil {
			expr.Values = node.Expression.Values
			if node.Expression.ValuesType != nil {
				expr.ValuesType = *node.Expression.ValuesType
			}
			if node.Expression.ValuesTypes != nil {
				vts := make([]string, len(node.Expression.ValuesTypes))
				for i, vt := range node.Expression.ValuesTypes {
					vts[i] = string(vt)
				}
				expr.ValuesTypes = vts
			}
		}
		result.Expression = expr
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
			Negated:      node.Left.Negated,
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
		Negated:      node.Negated,
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

	if got.Negated != want.Negated {
		t.Errorf("%s: Negated mismatch: got %v, want %v", path, got.Negated, want.Negated)
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

		// Skip value/valueType comparison for IN expressions (they use values/valuesType instead)
		if want.Expression.Values == nil {
			if got.Expression.ValueType != want.Expression.ValueType {
				t.Errorf("%s: ValueType mismatch: got %v, want %v", path, got.Expression.ValueType, want.Expression.ValueType)
			}
		}

		switch wv := want.Expression.Value.(type) {
		case float64:
			switch gv := got.Expression.Value.(type) {
			case float64:
				if gv != wv {
					t.Errorf("%s: Value mismatch: got %v, want %v", path, gv, wv)
				}
			case int64:
				if float64(gv) != wv {
					t.Errorf("%s: Value mismatch: got %v, want %v", path, gv, wv)
				}
			case uint64:
				if float64(gv) != wv {
					t.Errorf("%s: Value mismatch: got %v, want %v", path, gv, wv)
				}
			default:
				t.Errorf("%s: Value type mismatch: got %T, want float64", path, got.Expression.Value)
			}
		case string:
			// A string expected value with numeric value_type means a large integer
			// stored as string to avoid JSON float64 precision loss.
			if want.Expression.ValueType == "integer" || want.Expression.ValueType == "bigint" {
				var gotStr string
				switch gv := got.Expression.Value.(type) {
				case int64:
					gotStr = strconv.FormatInt(gv, 10)
				case uint64:
					gotStr = strconv.FormatUint(gv, 10)
				case float64:
					gotStr = strconv.FormatFloat(gv, 'f', -1, 64)
				default:
					t.Errorf("%s: Value type mismatch: got %T, want numeric", path, got.Expression.Value)
					return
				}
				if gotStr != wv {
					t.Errorf("%s: Value mismatch: got %q, want %q", path, gotStr, wv)
				}
			} else {
				gv, ok := got.Expression.Value.(string)
				if !ok {
					t.Errorf("%s: Value type mismatch: got %T, want string", path, got.Expression.Value)
				} else if gv != wv {
					t.Errorf("%s: Value mismatch: got %q, want %q", path, gv, wv)
				}
			}
		case map[string]any:
			gv, ok := got.Expression.Value.(map[string]any)
			if !ok {
				t.Errorf("%s: Value type mismatch: got %T, want map[string]any", path, got.Expression.Value)
			} else {
				compareFunctionCallMaps(t, gv, wv, path)
			}
		}

		if want.Expression.Values != nil {
			if got.Expression.Values == nil {
				t.Errorf("%s: expected values but got nil", path)
			} else {
				if got.Expression.ValuesType != want.Expression.ValuesType {
					t.Errorf("%s: ValuesType mismatch: got %q, want %q", path, got.Expression.ValuesType, want.Expression.ValuesType)
				}
				if len(got.Expression.Values) != len(want.Expression.Values) {
					t.Errorf("%s: Values length mismatch: got %d, want %d", path, len(got.Expression.Values), len(want.Expression.Values))
				} else {
					for i, wv := range want.Expression.Values {
						gv := got.Expression.Values[i]
						switch wval := wv.(type) {
						case string:
							if gval, ok := gv.(string); !ok || gval != wval {
								t.Errorf("%s: Values[%d] mismatch: got %v, want %q", path, i, gv, wval)
							}
						case float64:
							switch gval := gv.(type) {
							case float64:
								if gval != wval {
									t.Errorf("%s: Values[%d] mismatch: got %v, want %v", path, i, gval, wval)
								}
							case int64:
								if float64(gval) != wval {
									t.Errorf("%s: Values[%d] mismatch: got %v, want %v", path, i, gval, wval)
								}
							case uint64:
								if float64(gval) != wval {
									t.Errorf("%s: Values[%d] mismatch: got %v, want %v", path, i, gval, wval)
								}
							default:
								t.Errorf("%s: Values[%d] type mismatch: got %T, want number", path, i, gv)
							}
						}
					}
				}
				if want.Expression.ValuesTypes != nil {
					if got.Expression.ValuesTypes == nil {
						t.Errorf("%s: expected values_types but got nil", path)
					} else if len(got.Expression.ValuesTypes) != len(want.Expression.ValuesTypes) {
						t.Errorf("%s: ValuesTypes length mismatch: got %d, want %d", path, len(got.Expression.ValuesTypes), len(want.Expression.ValuesTypes))
					} else {
						for i, wvt := range want.Expression.ValuesTypes {
							if got.Expression.ValuesTypes[i] != wvt {
								t.Errorf("%s: ValuesTypes[%d] mismatch: got %q, want %q", path, i, got.Expression.ValuesTypes[i], wvt)
							}
						}
					}
				}
			}
		}
	} else if got.Expression != nil {
		t.Errorf("%s: expected nil expression but got non-nil", path)
	}

	compareExpectedASTs(t, got.Left, want.Left, path+".Left")
	compareExpectedASTs(t, got.Right, want.Right, path+".Right")
}

func compareFunctionCallMaps(t *testing.T, got, want map[string]any, path string) {
	t.Helper()
	for key, wantVal := range want {
		gotVal, ok := got[key]
		if !ok {
			t.Errorf("%s.Value[%q]: missing key", path, key)
			continue
		}
		wantJSON, _ := json.Marshal(wantVal)
		gotJSON, _ := json.Marshal(gotVal)
		if string(wantJSON) != string(gotJSON) {
			t.Errorf("%s.Value[%q]: got %s, want %s", path, key, gotJSON, wantJSON)
		}
	}
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
		"parser/truthy.json",
		"parser/not.json",
		"parser/int64.json",
		"parser/has.json",
		"parser/escaped_quotes_in_values.json",
		"parser/types.json",
		"parser/null_errors.json",
		"parser/like.json",
		"parser/functions.json",
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
