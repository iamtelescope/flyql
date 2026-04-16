package flyql

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
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
			p := NewParser()
			if err := p.Parse(tc.Input); err != nil {
				t.Fatalf("parse error for %q: %v", tc.Input, err)
			}

			if len(p.TypedChars) != len(tc.ExpectedTypedChars) {
				t.Fatalf("typed chars length mismatch for %q: got %d, want %d",
					tc.Input, len(p.TypedChars), len(tc.ExpectedTypedChars))
			}

			for i, expected := range tc.ExpectedTypedChars {
				actual := p.TypedChars[i]
				actualValue := string(actual.Value)
				if actualValue != expected[0] || actual.Type != expected[1] {
					t.Errorf("typed char [%d] for %q: got [%q, %q], want [%q, %q]",
						i, tc.Input, actualValue, actual.Type, expected[0], expected[1])
				}
			}
		})
	}
}

func TestTypedCharsFunctionRetroactiveRetype(t *testing.T) {
	p := NewParser()
	if err := p.Parse("created_at > startOf('week')"); err != nil {
		t.Fatalf("parse error: %v", err)
	}
	var fn strings.Builder
	for _, tc := range p.TypedChars {
		if tc.Type == CharTypeFunction {
			fn.WriteRune(tc.Value)
		}
	}
	if fn.String() != "startOf" {
		t.Errorf("expected FUNCTION chars to spell 'startOf', got %q", fn.String())
	}
}

func TestTypedCharsFunctionStructuralChars(t *testing.T) {
	input := "t = startOf('month', 'Asia/Tokyo')"
	p := NewParser()
	if err := p.Parse(input); err != nil {
		t.Fatalf("parse error: %v", err)
	}
	// Expected OPERATOR positions (0-indexed): 2 (=), 11 ((), 19 (,), 33 ())
	wantOpPositions := map[int]rune{2: '=', 11: '(', 19: ',', 33: ')'}
	gotOps := make(map[int]rune)
	for _, tc := range p.TypedChars {
		if tc.Type == CharTypeOperator {
			gotOps[tc.Pos] = tc.Value
		}
	}
	for pos, want := range wantOpPositions {
		got, ok := gotOps[pos]
		if !ok {
			t.Errorf("input %q: expected OPERATOR at pos %d (%q), got none", input, pos, want)
		} else if got != want {
			t.Errorf("input %q: OPERATOR at pos %d = %q, want %q", input, pos, got, want)
		}
	}
}

func TestTypedCharsUnknownIdentifierNotFunction(t *testing.T) {
	p := NewParser()
	if err := p.Parse("t > startsWith"); err != nil {
		t.Fatalf("parse error: %v", err)
	}
	for _, tc := range p.TypedChars {
		if tc.Type == CharTypeFunction {
			t.Errorf("unexpected FUNCTION type for unknown identifier")
		}
	}
}

func TestTypedCharsMidTypingFunctionCall(t *testing.T) {
	// Partial input — parser errors on unclosed call but typed chars must
	// retain the retyped function name regardless.
	p := NewParser()
	_ = p.Parse("t > ago(")
	var fn strings.Builder
	for _, tc := range p.TypedChars {
		if tc.Type == CharTypeFunction {
			fn.WriteRune(tc.Value)
		}
	}
	if fn.String() != "ago" {
		t.Errorf("expected 'ago' in FUNCTION-typed chars, got %q", fn.String())
	}
}

func TestKnownFunctionsAreAscii(t *testing.T) {
	// The retroactive FUNCTION retype walks back len(p.value) typed-char
	// entries, where len() on a Go string is BYTE length. That equals the
	// typed-char count only while every rune in the name is single-byte
	// ASCII. A future multi-byte name would silently mis-align the window.
	// Fail loudly instead.
	for name := range knownFunctions {
		for _, r := range name {
			if r > 0x7F {
				t.Errorf("knownFunctions entry %q contains non-ASCII rune %q", name, r)
			}
		}
	}
}

func TestDurationOrderingValid(t *testing.T) {
	valid := []string{
		"t > ago(1s)",
		"t > ago(1m)",
		"t > ago(1h)",
		"t > ago(1d)",
		"t > ago(1w)",
		"t > ago(1h30m)",
		"t > ago(2w3d4h5m6s)",
		"t > ago(1w30s)",
	}
	for _, input := range valid {
		if _, err := Parse(input); err != nil {
			t.Errorf("expected %q to parse, got error: %v", input, err)
		}
	}
}

func TestDurationOrderingInvalid(t *testing.T) {
	cases := map[string]string{
		"t > ago(1m2h)":   "ascending m before h",
		"t > ago(30m1h)":  "ascending m before h",
		"t > ago(1h2h)":   "repeated unit h",
		"t > ago(30m30m)": "repeated unit m",
		"t > ago(3h1w)":   "ascending h before w",
		"t > ago(1s1m)":   "ascending s before m",
		"t > ago(1d1w)":   "ascending d before w",
	}
	for input, why := range cases {
		_, err := Parse(input)
		if err == nil {
			t.Errorf("expected %q to fail (%s), but parsed successfully", input, why)
			continue
		}
		pe, ok := err.(*ParseError)
		if !ok {
			t.Errorf("%q: expected *ParseError, got %T", input, err)
			continue
		}
		if pe.Code != errInvalidDuration {
			t.Errorf("%q: code=%d, want errInvalidDuration=%d", input, pe.Code, errInvalidDuration)
		}
	}
}

func TestTypedCharsPositionTracking(t *testing.T) {
	p := NewParser()
	if err := p.Parse("key=value"); err != nil {
		t.Fatalf("parse error: %v", err)
	}

	if len(p.TypedChars) != 9 {
		t.Fatalf("expected 9 typed chars, got %d", len(p.TypedChars))
	}

	// Verify positions
	for i, tc := range p.TypedChars {
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
		if p.TypedChars[i].Type != et {
			t.Errorf("typed char [%d] type: got %q, want %q", i, p.TypedChars[i].Type, et)
		}
	}
}
