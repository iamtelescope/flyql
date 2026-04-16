package flyql

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type maxDepthParserConfig struct {
	MaxDepth int `json:"max_depth"`
}

type maxDepthExpectedError struct {
	Errno           int    `json:"errno,omitempty"`
	MessageContains string `json:"message_contains,omitempty"`
	MessageEquals   string `json:"message_equals,omitempty"`
}

type maxDepthTestCase struct {
	Name           string                 `json:"name"`
	Depth          int                    `json:"depth"`
	QueryPrefix    string                 `json:"query_prefix,omitempty"`
	QuerySuffix    string                 `json:"query_suffix,omitempty"`
	LiteralQuery   string                 `json:"literal_query,omitempty"`
	ParserConfig   *maxDepthParserConfig  `json:"parser_config,omitempty"`
	ExpectedResult string                 `json:"expected_result"`
	ExpectedError  *maxDepthExpectedError `json:"expected_error,omitempty"`
}

type maxDepthTestFile struct {
	Version     string             `json:"version"`
	Description string             `json:"description"`
	TestSuite   string             `json:"test_suite"`
	Tests       []maxDepthTestCase `json:"tests"`
}

func buildNestedQuery(depth int) string {
	return strings.Repeat("(", depth) + "a=1" + strings.Repeat(")", depth)
}

func TestParserMaxDepthFixture(t *testing.T) {
	path := filepath.Join(getTestDataDir(), "parser", "max_depth.json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read %s: %v", path, err)
	}

	var tf maxDepthTestFile
	if err := json.Unmarshal(data, &tf); err != nil {
		t.Fatalf("failed to parse %s: %v", path, err)
	}

	for _, tc := range tf.Tests {
		t.Run(tc.Name, func(t *testing.T) {
			var query string
			if tc.LiteralQuery != "" {
				query = tc.LiteralQuery
			} else {
				query = tc.QueryPrefix + buildNestedQuery(tc.Depth) + tc.QuerySuffix
			}

			parser := NewParser()
			if tc.ParserConfig != nil {
				parser.MaxDepth = tc.ParserConfig.MaxDepth
			}

			err := parser.Parse(query)

			if tc.ExpectedResult == "error" {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				if tc.ExpectedError != nil {
					parseErr, ok := err.(*ParseError)
					if !ok {
						t.Fatalf("expected *ParseError, got %T", err)
					}
					if tc.ExpectedError.Errno != 0 && parseErr.Code != tc.ExpectedError.Errno {
						t.Errorf("errno mismatch: got %d, want %d", parseErr.Code, tc.ExpectedError.Errno)
					}
					if tc.ExpectedError.MessageContains != "" &&
						!strings.Contains(parseErr.Message, tc.ExpectedError.MessageContains) {
						t.Errorf("message %q does not contain %q", parseErr.Message, tc.ExpectedError.MessageContains)
					}
					if tc.ExpectedError.MessageEquals != "" &&
						parseErr.Message != tc.ExpectedError.MessageEquals {
						t.Errorf("message mismatch: got %q, want %q", parseErr.Message, tc.ExpectedError.MessageEquals)
					}
				}
			} else {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if parser.Root == nil {
					t.Fatalf("expected non-nil Root")
				}
			}
		})
	}
}

func TestDefaultMaxDepthAllows128(t *testing.T) {
	parser := NewParser()
	if err := parser.Parse(buildNestedQuery(128)); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if parser.Root == nil {
		t.Fatalf("expected non-nil Root")
	}
}

func TestDefaultMaxDepthRejects129(t *testing.T) {
	parser := NewParser()
	err := parser.Parse(buildNestedQuery(129))
	if err == nil {
		t.Fatalf("expected error, got nil")
	}
	parseErr, ok := err.(*ParseError)
	if !ok {
		t.Fatalf("expected *ParseError, got %T", err)
	}
	if parseErr.Code != errMaxDepthExceeded {
		t.Errorf("errno: got %d, want %d", parseErr.Code, errMaxDepthExceeded)
	}
	if !strings.Contains(parseErr.Message, "maximum nesting depth exceeded") {
		t.Errorf("message %q missing expected substring", parseErr.Message)
	}
}

func TestDefaultMaxDepthErrorMessageIncludesLimit(t *testing.T) {
	parser := NewParser()
	err := parser.Parse(buildNestedQuery(129))
	if err == nil {
		t.Fatalf("expected error, got nil")
	}
	parseErr, ok := err.(*ParseError)
	if !ok {
		t.Fatalf("expected *ParseError, got %T", err)
	}
	if parseErr.Message != "maximum nesting depth exceeded (128)" {
		t.Errorf("message mismatch: got %q", parseErr.Message)
	}
}

func TestZeroDisablesLimit(t *testing.T) {
	parser := NewParser()
	parser.MaxDepth = 0
	if err := parser.Parse(buildNestedQuery(500)); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if parser.Root == nil {
		t.Fatalf("expected non-nil Root")
	}
}

func TestNegativeMaxDepthDisablesLimit(t *testing.T) {
	parser := NewParser()
	parser.MaxDepth = -1
	if err := parser.Parse(buildNestedQuery(500)); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestDepthZeroAfterSuccessfulParse(t *testing.T) {
	parser := NewParser()
	if err := parser.Parse("(a=1)"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if parser.depth != 0 {
		t.Errorf("expected depth 0, got %d", parser.depth)
	}
}

func TestParserReuseAfterError(t *testing.T) {
	// Go's Parse() fully resets instance state at the top, so — unlike
	// Python/JS — a Parser can be safely reused after a failed parse.
	// Verify both that depth resets AND the second parse succeeds end-to-end.
	parser := NewParser()
	_ = parser.Parse("(((")
	if err := parser.Parse("(a=1)"); err != nil {
		t.Fatalf("unexpected error on reuse: %v", err)
	}
	if parser.depth != 0 {
		t.Errorf("expected depth 0, got %d", parser.depth)
	}
	if parser.Root == nil {
		t.Fatalf("expected non-nil Root after reuse")
	}
}

func TestParserReuseAfterMaxDepthError(t *testing.T) {
	parser := NewParser()
	parser.MaxDepth = 4
	_ = parser.Parse(buildNestedQuery(5))
	parser.MaxDepth = 128
	if err := parser.Parse(buildNestedQuery(128)); err != nil {
		t.Fatalf("unexpected error on reuse after depth error: %v", err)
	}
	if parser.depth != 0 {
		t.Errorf("expected depth 0 after reuse, got %d", parser.depth)
	}
}

func TestSyntaxErrorTakesPrecedenceOverDepth(t *testing.T) {
	// `==` is a syntax error, and parsing stops on the first error.
	// Even though 9 `(` chars would blow past MaxDepth=2, the syntax
	// error at position 3 fires first.
	parser := NewParser()
	parser.MaxDepth = 2
	err := parser.Parse("(a== (((((((((")
	if err == nil {
		t.Fatalf("expected error")
	}
	parseErr, ok := err.(*ParseError)
	if !ok {
		t.Fatalf("expected *ParseError, got %T", err)
	}
	if parseErr.Code == errMaxDepthExceeded {
		t.Errorf("expected non-depth error, got %d", parseErr.Code)
	}
}
