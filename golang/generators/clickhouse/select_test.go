package clickhouse

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type selectTestCase struct {
	Name                  string   `json:"name"`
	Input                 string   `json:"input"`
	ExpectedResult        string   `json:"expected_result"`
	ExpectedSQL           string   `json:"expected_sql,omitempty"`
	ExpectedErrorContains []string `json:"expected_error_contains,omitempty"`
}

type selectTestFile struct {
	Version     string           `json:"version"`
	Description string           `json:"description"`
	TestSuite   string           `json:"test_suite"`
	Tests       []selectTestCase `json:"tests"`
}

func loadSelectTestFile(t *testing.T, filename string) selectTestFile {
	data, err := os.ReadFile(filepath.Join(getTestDataDir(), filename))
	if err != nil {
		t.Fatalf("failed to read %s: %v", filename, err)
	}
	var stf selectTestFile
	if err := json.Unmarshal(data, &stf); err != nil {
		t.Fatalf("failed to parse %s: %v", filename, err)
	}
	return stf
}

func runSelectTestSuite(t *testing.T, columns map[string]*Column, filename string) {
	stf := loadSelectTestFile(t, filename)
	for _, tc := range stf.Tests {
		tc := tc
		t.Run(tc.Name, func(t *testing.T) {
			result, err := ToSQLSelect(tc.Input, columns)
			if tc.ExpectedResult == "error" {
				if err == nil {
					t.Fatalf("expected error, got SQL: %s", result.SQL)
				}
				for _, substr := range tc.ExpectedErrorContains {
					if !strings.Contains(strings.ToLower(err.Error()), strings.ToLower(substr)) {
						t.Errorf("expected error containing %q, got %q", substr, err.Error())
					}
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if tc.ExpectedSQL != "" && result.SQL != tc.ExpectedSQL {
				t.Errorf("SQL mismatch:\n  got:  %s\n  want: %s", result.SQL, tc.ExpectedSQL)
			}
		})
	}
}

func TestSelectBasic(t *testing.T) {
	columns := loadColumns(t)
	runSelectTestSuite(t, columns, "select_basic.json")
}

func TestSelectComposite(t *testing.T) {
	columns := loadColumns(t)
	runSelectTestSuite(t, columns, "select_composite.json")
}

func TestSelectErrors(t *testing.T) {
	columns := loadColumns(t)
	runSelectTestSuite(t, columns, "select_errors.json")
}
