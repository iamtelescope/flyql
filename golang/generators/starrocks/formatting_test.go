package starrocks

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	flyql "github.com/iamtelescope/flyql/golang"
)

type formattingOptions struct {
	Format      bool   `json:"format"`
	IndentChar  string `json:"indent_char"`
	IndentCount int    `json:"indent_count"`
}

type formattingCase struct {
	Name                   string            `json:"name"`
	Kind                   string            `json:"kind"`
	Input                  string            `json:"input"`
	Options                formattingOptions `json:"options"`
	ExpectedUnformattedSQL string            `json:"expected_unformatted_sql"`
	ExpectedFormattedSQL   string            `json:"expected_formatted_sql"`
}

type formattingFile struct {
	Tests []formattingCase `json:"tests"`
}

func normalizeWS(s string) string {
	s = strings.Join(strings.Fields(s), " ")
	s = strings.ReplaceAll(s, "( ", "(")
	s = strings.ReplaceAll(s, " )", ")")
	return s
}

func loadFormattingFixture(t *testing.T) *formattingFile {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(getTestDataDir(), "formatting.json"))
	if err != nil {
		t.Fatalf("failed to read formatting.json: %v", err)
	}
	var ff formattingFile
	if err := json.Unmarshal(data, &ff); err != nil {
		t.Fatalf("failed to parse formatting.json: %v", err)
	}
	return &ff
}

func TestFormatting(t *testing.T) {
	cols := loadColumns(t)
	ff := loadFormattingFixture(t)

	for _, tc := range ff.Tests {
		t.Run(tc.Name, func(t *testing.T) {
			opts := &GeneratorOptions{
				DefaultTimezone: "UTC",
				Format:          tc.Options.Format,
				IndentChar:      tc.Options.IndentChar,
				IndentCount:     tc.Options.IndentCount,
			}

			kind := tc.Kind
			if kind == "" {
				kind = "where"
			}

			var unformatted, formatted string
			if kind == "where" {
				res, err := flyql.Parse(tc.Input)
				if err != nil {
					t.Fatalf("parse error: %v", err)
				}
				u, err := ToSQLWhere(res.Root, cols)
				if err != nil {
					t.Fatalf("unformatted generator error: %v", err)
				}
				unformatted = u
				f, err := ToSQLWhereWithOptions(res.Root, cols, opts)
				if err != nil {
					t.Fatalf("formatted generator error: %v", err)
				}
				formatted = f
			} else {
				u, err := ToSQLSelect(tc.Input, cols)
				if err != nil {
					t.Fatalf("unformatted select error: %v", err)
				}
				unformatted = u.SQL
				f, err := ToSQLSelectWithOptions(tc.Input, cols, opts)
				if err != nil {
					t.Fatalf("formatted select error: %v", err)
				}
				formatted = f.SQL
			}

			if unformatted != tc.ExpectedUnformattedSQL {
				t.Errorf("regression:\ngot:  %q\nwant: %q", unformatted, tc.ExpectedUnformattedSQL)
			}
			if formatted != tc.ExpectedFormattedSQL {
				t.Errorf("formatted:\ngot:  %q\nwant: %q", formatted, tc.ExpectedFormattedSQL)
			}
			if strings.Contains(unformatted, "\n") {
				t.Errorf("unformatted contains newline: %q", unformatted)
			}
			if got, want := normalizeWS(formatted), unformatted; got != want {
				t.Errorf("equivalence:\nnormalized: %q\nunformatted: %q", got, want)
			}
		})
	}
}
