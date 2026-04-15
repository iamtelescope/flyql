package flyql

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

type tokenizeTestFile struct {
	Version     string             `json:"version"`
	Description string             `json:"description"`
	TestSuite   string             `json:"test_suite"`
	AsciiOnly   bool               `json:"ascii_only"`
	Coverage    []string           `json:"coverage"`
	Tests       []tokenizeTestCase `json:"tests"`
}

type tokenizeTestCase struct {
	Name           string          `json:"name"`
	Input          string          `json:"input"`
	ExpectedTokens []expectedToken `json:"expected_tokens"`
}

type expectedToken struct {
	Text  string `json:"text"`
	Type  string `json:"type"`
	Start int    `json:"start"`
	End   int    `json:"end"`
}

func getTokenizeTestDataDir() string {
	_, filename, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(filename), "..", "tests-data", "tokenize")
}

func loadTokenizeFixture(t *testing.T, name string) tokenizeTestFile {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(getTokenizeTestDataDir(), name))
	if err != nil {
		t.Fatalf("failed to read %s: %v", name, err)
	}
	var f tokenizeTestFile
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatalf("failed to parse %s: %v", name, err)
	}
	return f
}

func TestTokenizeQueryFixture(t *testing.T) {
	fixture := loadTokenizeFixture(t, "query_tokens.json")
	for _, tc := range fixture.Tests {
		tc := tc
		t.Run(tc.Name, func(t *testing.T) {
			got, err := Tokenize(tc.Input, "query")
			if err != nil {
				t.Fatalf("Tokenize(%q) returned error: %v", tc.Input, err)
			}
			if len(got) != len(tc.ExpectedTokens) {
				t.Fatalf("token count mismatch: got %d, want %d (got=%#v)", len(got), len(tc.ExpectedTokens), got)
			}
			for i, want := range tc.ExpectedTokens {
				g := got[i]
				if g.Text != want.Text || g.Type != want.Type || g.Start != want.Start || g.End != want.End {
					t.Errorf("token[%d] mismatch: got {%q %q %d %d}, want {%q %q %d %d}",
						i, g.Text, g.Type, g.Start, g.End, want.Text, want.Type, want.Start, want.End)
				}
			}
		})
	}
}

func TestTokenizeEmptyInput(t *testing.T) {
	got, err := Tokenize("", "query")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got == nil {
		t.Fatalf("expected non-nil empty slice, got nil")
	}
	if len(got) != 0 {
		t.Fatalf("expected empty slice, got %#v", got)
	}
}

func TestTokenizeColumnsModeReturnsError(t *testing.T) {
	got, err := Tokenize("x", "columns")
	if err == nil {
		t.Fatalf("expected error for columns mode, got nil (tokens=%#v)", got)
	}
	if !strings.Contains(err.Error(), "columns mode") {
		t.Errorf("error should mention 'columns mode', got %q", err.Error())
	}
	if got != nil {
		t.Errorf("expected nil tokens on error, got %#v", got)
	}
}

var roundTripInputs = []string{
	"a=1",
	"x='y'",
	"status=200 and region='us-east'",
	"count>=10 or count<0",
	"key=*wild",
}

func TestTokenizeRoundTripHandcrafted(t *testing.T) {
	for _, input := range roundTripInputs {
		got, err := Tokenize(input, "query")
		if err != nil {
			t.Fatalf("Tokenize(%q) returned error: %v", input, err)
		}
		var sb strings.Builder
		for _, tok := range got {
			sb.WriteString(tok.Text)
		}
		if sb.String() != input {
			t.Errorf("round-trip mismatch: got %q, want %q", sb.String(), input)
		}
	}
}

func TestTokenizeMonotonicOffsets(t *testing.T) {
	fixture := loadTokenizeFixture(t, "query_tokens.json")
	var inputs []string
	for _, tc := range fixture.Tests {
		inputs = append(inputs, tc.Input)
	}
	inputs = append(inputs, roundTripInputs...)

	for _, input := range inputs {
		tokens, err := Tokenize(input, "query")
		if err != nil {
			t.Fatalf("Tokenize(%q) returned error: %v", input, err)
		}
		if input == "" {
			if len(tokens) != 0 {
				t.Errorf("empty input should produce empty tokens, got %#v", tokens)
			}
			continue
		}
		if tokens[0].Start != 0 {
			t.Errorf("%q: tokens[0].Start = %d, want 0", input, tokens[0].Start)
		}
		for i, tok := range tokens {
			if tok.End <= tok.Start {
				t.Errorf("%q: tokens[%d].End (%d) not greater than Start (%d)", input, i, tok.End, tok.Start)
			}
			if i > 0 && tok.Start != tokens[i-1].End {
				t.Errorf("%q: tokens[%d].Start=%d != tokens[%d].End=%d", input, i, tok.Start, i-1, tokens[i-1].End)
			}
		}
		if tokens[len(tokens)-1].End != len(input) {
			t.Errorf("%q: last token End=%d != len(input)=%d", input, tokens[len(tokens)-1].End, len(input))
		}
	}
}

func TestTokenizeCharTypeCoverage(t *testing.T) {
	fixture := loadTokenizeFixture(t, "query_tokens.json")
	required := map[string]bool{
		"flyqlKey":      false,
		"flyqlOperator": false,
		"number":        false,
		"string":        false,
		"flyqlBoolean":  false,
		"flyqlNull":     false,
		"flyqlColumn":   false,
		"flyqlError":    false,
	}
	for _, tc := range fixture.Tests {
		for _, tok := range tc.ExpectedTokens {
			if _, ok := required[tok.Type]; ok {
				required[tok.Type] = true
			}
		}
	}
	for typeName, seen := range required {
		if !seen {
			t.Errorf("fixture missing required CharType %q", typeName)
		}
	}
}

func TestTokenizePinsReproductionStartofWeek(t *testing.T) {
	tokens, err := Tokenize("created_at > startOf('week')", "query")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	var weekTok, fnTok *Token
	for i := range tokens {
		if tokens[i].Text == "'week'" {
			weekTok = &tokens[i]
		}
		if tokens[i].Text == "startOf" {
			fnTok = &tokens[i]
		}
	}
	if weekTok == nil || weekTok.Type != CharTypeString {
		t.Errorf("expected 'week' token with type %q, got %+v", CharTypeString, weekTok)
	}
	if fnTok == nil || fnTok.Type != CharTypeFunction {
		t.Errorf("expected startOf token with type %q, got %+v", CharTypeFunction, fnTok)
	}
	last := tokens[len(tokens)-1]
	if last.Text != ")" || last.Type != CharTypeOperator {
		t.Errorf("expected last token ) with type %q, got {%q %q}", CharTypeOperator, last.Text, last.Type)
	}
}

func TestTokenizeDurationLiteralsUpgradeToNumber(t *testing.T) {
	cases := map[string]string{
		"t > ago(1h)":    "1h",
		"t > ago(1h30m)": "1h30m",
		"t > ago(2w3d)":  "2w3d",
	}
	for input, expectedText := range cases {
		tokens, err := Tokenize(input, "query")
		if err != nil {
			t.Fatalf("unexpected error for %q: %v", input, err)
		}
		var match *Token
		for i := range tokens {
			if tokens[i].Text == expectedText {
				match = &tokens[i]
				break
			}
		}
		if match == nil {
			t.Errorf("%q: expected token with text %q, got %#v", input, expectedText, tokens)
			continue
		}
		if match.Type != CharTypeNumber {
			t.Errorf("%q: token %q type=%q, want %q", input, expectedText, match.Type, CharTypeNumber)
		}
	}
}

func TestTokenizePlainIdentifierNotDuration(t *testing.T) {
	for _, input := range []string{"x=whom", "x=salt", "x=dim"} {
		tokens, err := Tokenize(input, "query")
		if err != nil {
			t.Fatalf("unexpected error for %q: %v", input, err)
		}
		last := tokens[len(tokens)-1]
		if last.Type != CharTypeColumn {
			t.Errorf("%q: last token type=%q, want %q", input, last.Type, CharTypeColumn)
		}
	}
}

func TestTokenizeMidTypingFunctionCall(t *testing.T) {
	cases := []string{"t > ago(", "t > ago(1h"}
	for _, input := range cases {
		tokens, err := Tokenize(input, "query")
		if err != nil {
			t.Fatalf("unexpected error for %q: %v", input, err)
		}
		var joined strings.Builder
		for _, tok := range tokens {
			joined.WriteString(tok.Text)
		}
		if joined.String() != input {
			t.Errorf("round-trip mismatch for %q: got %q", input, joined.String())
		}
		found := false
		for _, tok := range tokens {
			if tok.Text == "ago" && tok.Type == CharTypeFunction {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("%q: expected flyqlFunction token for 'ago', got %#v", input, tokens)
		}
	}
}

func TestTokenizeFunctionCallFollowedByBoolOp(t *testing.T) {
	input := "t > ago(1h) and status = 200"
	tokens, err := Tokenize(input, "query")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	var joined strings.Builder
	for _, tok := range tokens {
		joined.WriteString(tok.Text)
	}
	if joined.String() != input {
		t.Errorf("round-trip mismatch: got %q, want %q", joined.String(), input)
	}
	type want struct{ text, typ string }
	for _, w := range []want{
		{"ago", CharTypeFunction},
		{"1h", CharTypeNumber},
		{"and", CharTypeOperator},
	} {
		found := false
		for _, tok := range tokens {
			if tok.Text == w.text && tok.Type == w.typ {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("missing token {%q %q} in %#v", w.text, w.typ, tokens)
		}
	}
}

func TestTokenizeWhitespaceOnlyInput(t *testing.T) {
	tokens, err := Tokenize("   ", "query")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(tokens) != 1 {
		t.Fatalf("expected 1 token, got %#v", tokens)
	}
	tok := tokens[0]
	if tok.Text != "   " || tok.Type != CharTypeSpace || tok.Start != 0 || tok.End != 3 {
		t.Errorf("got %#v, want {'   ', space, 0, 3}", tok)
	}
}

func TestTokenizeRejectsNonCanonicalNumerics(t *testing.T) {
	for _, input := range []string{"val=Infinity", "val=NaN", "val=0x1F"} {
		tokens, err := Tokenize(input, "query")
		if err != nil {
			t.Fatalf("Tokenize(%q) returned error: %v", input, err)
		}
		valueTok := tokens[len(tokens)-1]
		if valueTok.Type != CharTypeColumn {
			t.Errorf("%q: value token type=%q, want %q", input, valueTok.Type, CharTypeColumn)
		}
	}
}

func TestTokenizeProhibitsFlyqlValue(t *testing.T) {
	fixture := loadTokenizeFixture(t, "query_tokens.json")
	for _, tc := range fixture.Tests {
		for i, tok := range tc.ExpectedTokens {
			if tok.Type == "flyqlValue" {
				t.Errorf("case %q token[%d]: unupgraded flyqlValue is not allowed", tc.Name, i)
			}
		}
	}
}
