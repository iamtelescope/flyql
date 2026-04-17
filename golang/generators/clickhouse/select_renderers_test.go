package clickhouse

import (
	"reflect"
	"strings"
	"testing"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/columns"
)

func TestToKeyTransformers_RoundTrip(t *testing.T) {
	cases := []struct {
		name     string
		input    []columns.Transformer
		expected []flyql.Transformer
	}{
		{
			name:     "empty input",
			input:    []columns.Transformer{},
			expected: []flyql.Transformer{},
		},
		{
			name: "single zero-arg transformer",
			input: []columns.Transformer{
				{Name: "upper", Arguments: []any{}},
			},
			expected: []flyql.Transformer{
				{Name: "upper", Arguments: []any{}},
			},
		},
		{
			name: "two-entry chain with mixed args",
			input: []columns.Transformer{
				{Name: "chars", Arguments: []any{10}},
				{Name: "upper", Arguments: []any{}},
			},
			expected: []flyql.Transformer{
				{Name: "chars", Arguments: []any{10}},
				{Name: "upper", Arguments: []any{}},
			},
		},
		{
			name: "string plus int args",
			input: []columns.Transformer{
				{Name: "substr", Arguments: []any{0, "."}},
			},
			expected: []flyql.Transformer{
				{Name: "substr", Arguments: []any{0, "."}},
			},
		},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			got := toKeyTransformers(tc.input)
			if len(got) != len(tc.expected) {
				t.Fatalf("length mismatch: got %d want %d", len(got), len(tc.expected))
			}
			for i := range got {
				if got[i].Name != tc.expected[i].Name {
					t.Errorf("[%d] Name: got %q want %q", i, got[i].Name, tc.expected[i].Name)
				}
				if !reflect.DeepEqual(got[i].Arguments, tc.expected[i].Arguments) {
					t.Errorf("[%d] Arguments: got %v want %v", i, got[i].Arguments, tc.expected[i].Arguments)
				}
				zero := flyql.Range{}
				if got[i].Range != zero {
					t.Errorf("[%d] Range: expected zero, got %+v", i, got[i].Range)
				}
				if got[i].NameRange != zero {
					t.Errorf("[%d] NameRange: expected zero, got %+v", i, got[i].NameRange)
				}
				if len(got[i].ArgumentRanges) != 0 {
					t.Errorf("[%d] ArgumentRanges: expected empty, got %v", i, got[i].ArgumentRanges)
				}
			}
		})
	}
}

// TestToKeyTransformers_DefensiveCopy ensures the adapter does not alias
// the source Arguments slice — mutating the output must not touch the input.
func TestToKeyTransformers_DefensiveCopy(t *testing.T) {
	input := []columns.Transformer{
		{Name: "chars", Arguments: []any{10, 20}},
	}
	got := toKeyTransformers(input)
	got[0].Arguments[0] = 999
	if input[0].Arguments[0] != 10 {
		t.Errorf("mutation leaked: input[0].Arguments[0] = %v, want 10", input[0].Arguments[0])
	}
}

func TestToSQLSelect_RendererSuffix(t *testing.T) {
	cols := map[string]*Column{
		"message": NewColumn(ColumnDef{Name: "message", Type: "String"}),
	}
	cases := []struct {
		name          string
		input         string
		expectedAlias string
		expectedExpr  string
		forbidSubstrs []string
	}{
		{
			name:          "tag no-arg renderer",
			input:         "message as msg|tag",
			expectedAlias: "msg",
			expectedExpr:  "message AS msg",
			forbidSubstrs: []string{"|", "tag"},
		},
		{
			name:          "tag with string arg",
			input:         "message as msg|tag('red')",
			expectedAlias: "msg",
			expectedExpr:  "message AS msg",
			forbidSubstrs: []string{"|", "tag", "red"},
		},
		{
			name:          "transformer plus renderer",
			input:         "message|upper as msg|tag",
			expectedAlias: "msg",
			expectedExpr:  "upper(message) AS msg",
			forbidSubstrs: []string{"|", "tag"},
		},
		{
			name:          "tag multi arg",
			input:         "message as msg|tag('red', 'blue')",
			expectedAlias: "msg",
			expectedExpr:  "message AS msg",
			forbidSubstrs: []string{"|", "tag", "red", "blue"},
		},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			result, err := ToSQLSelect(tc.input, cols)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(result.Columns) != 1 {
				t.Fatalf("expected 1 column, got %d", len(result.Columns))
			}
			c := result.Columns[0]
			if c.Alias != tc.expectedAlias {
				t.Errorf("alias: got %q want %q", c.Alias, tc.expectedAlias)
			}
			if c.SQLExpr != tc.expectedExpr {
				t.Errorf("sqlExpr: got %q want %q", c.SQLExpr, tc.expectedExpr)
			}
			for _, sub := range tc.forbidSubstrs {
				if strings.Contains(c.SQLExpr, sub) {
					t.Errorf("sqlExpr %q must not contain %q", c.SQLExpr, sub)
				}
			}
		})
	}
}

// TestToSQLSelect_RendererWithoutAliasErrors ensures that `message|tag` with
// no AS clause is rejected — renderers require an alias, and if the parser
// treats `|tag` as a transformer it must fail in validation.
func TestToSQLSelect_RendererWithoutAliasErrors(t *testing.T) {
	cols := map[string]*Column{
		"message": NewColumn(ColumnDef{Name: "message", Type: "String"}),
	}
	_, err := ToSQLSelect("message|tag", cols)
	if err == nil {
		t.Fatalf("expected error for 'message|tag' (no alias), got nil")
	}
}
