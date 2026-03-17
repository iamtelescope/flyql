package postgresql

import (
	"strings"
	"testing"
)

func runSelectTestCases(t *testing.T, filename string) {
	t.Helper()
	columns := loadColumns(t)
	tf := loadTestFile(t, filename)

	for _, tc := range tf.Tests {
		t.Run(tc.Name, func(t *testing.T) {
			result, err := ToSQLSelect(tc.Input, columns)

			if tc.ExpectedResult == "error" {
				if err == nil {
					t.Errorf("expected error but got none (SQL: %q)", result.SQL)
					return
				}
				if tc.ExpectedErrorContains != "" && !strings.Contains(err.Error(), tc.ExpectedErrorContains) {
					t.Errorf("error %q does not contain %q", err.Error(), tc.ExpectedErrorContains)
				}
				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			if tc.ExpectedSQL != "" && result.SQL != tc.ExpectedSQL {
				t.Errorf("SQL mismatch:\ngot:  %q\nwant: %q", result.SQL, tc.ExpectedSQL)
			}
		})
	}
}

func TestSelectBasic(t *testing.T) {
	runSelectTestCases(t, "select_basic.json")
}

func TestSelectComposite(t *testing.T) {
	runSelectTestCases(t, "select_composite.json")
}

func TestSelectErrors(t *testing.T) {
	runSelectTestCases(t, "select_errors.json")
}
