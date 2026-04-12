package starrocks

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	flyql "github.com/iamtelescope/flyql/golang"
)

func getTestDataDir() string {
	_, filename, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(filename), "..", "..", "..", "tests-data", "generators", "starrocks")
}

type columnsFile struct {
	Version     string               `json:"version"`
	Description string               `json:"description"`
	Columns     map[string]columnDef `json:"columns"`
}

type columnDef struct {
	Name   string   `json:"name"`
	Type   string   `json:"type"`
	Values []string `json:"values"`
}

type testFile struct {
	Version     string     `json:"version"`
	Description string     `json:"description"`
	TestSuite   string     `json:"test_suite"`
	Tests       []testCase `json:"tests"`
}

type testCase struct {
	Name                  string          `json:"name"`
	Input                 string          `json:"input"`
	ExpectedResult        string          `json:"expected_result"`
	ExpectedSQL           string          `json:"expected_sql,omitempty"`
	ExpectedSQLContains   json.RawMessage `json:"expected_sql_contains,omitempty"`
	ExpectedErrorContains string          `json:"expected_error_contains,omitempty"`
}

func (tc testCase) getSQLContains() []string {
	if tc.ExpectedSQLContains == nil {
		return nil
	}
	var arr []string
	if err := json.Unmarshal(tc.ExpectedSQLContains, &arr); err == nil {
		return arr
	}
	var s string
	if err := json.Unmarshal(tc.ExpectedSQLContains, &s); err == nil {
		return []string{s}
	}
	return nil
}

func loadColumns(t *testing.T) map[string]*Column {
	data, err := os.ReadFile(filepath.Join(getTestDataDir(), "columns.json"))
	if err != nil {
		t.Fatalf("failed to read columns.json: %v", err)
	}

	var ff columnsFile
	if err := json.Unmarshal(data, &ff); err != nil {
		t.Fatalf("failed to parse columns.json: %v", err)
	}

	columns := make(map[string]*Column)
	for name, fd := range ff.Columns {
		columns[name] = NewColumn(ColumnDef{
			Name:   fd.Name,
			Type:   fd.Type,
			Values: fd.Values,
		})
	}
	return columns
}

func loadTestFile(t *testing.T, filename string) testFile {
	data, err := os.ReadFile(filepath.Join(getTestDataDir(), filename))
	if err != nil {
		t.Fatalf("failed to read %s: %v", filename, err)
	}

	var tf testFile
	if err := json.Unmarshal(data, &tf); err != nil {
		t.Fatalf("failed to parse %s: %v", filename, err)
	}
	return tf
}

func runWhereTestSuite(t *testing.T, columns map[string]*Column, filename string) {
	tf := loadTestFile(t, filename)
	for _, tc := range tf.Tests {
		tc := tc
		t.Run(tc.Name, func(t *testing.T) {
			parsed, err := flyql.Parse(tc.Input)
			if err != nil {
				if tc.ExpectedResult == "error" {
					if tc.ExpectedErrorContains != "" && !strings.Contains(err.Error(), tc.ExpectedErrorContains) {
						t.Errorf("expected error containing %q, got %q", tc.ExpectedErrorContains, err.Error())
					}
					return
				}
				t.Fatalf("parse error: %v", err)
			}

			sql, err := ToSQLWhere(parsed.Root, columns)
			if tc.ExpectedResult == "error" {
				if err == nil {
					t.Fatalf("expected error, got SQL: %s", sql)
				}
				if tc.ExpectedErrorContains != "" && !strings.Contains(err.Error(), tc.ExpectedErrorContains) {
					t.Errorf("expected error containing %q, got %q", tc.ExpectedErrorContains, err.Error())
				}
				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			if tc.ExpectedSQL != "" && sql != tc.ExpectedSQL {
				t.Errorf("SQL mismatch:\n  got:  %s\n  want: %s", sql, tc.ExpectedSQL)
			}

			for _, substr := range tc.getSQLContains() {
				if !strings.Contains(sql, substr) {
					t.Errorf("SQL %q does not contain %q", sql, substr)
				}
			}
		})
	}
}

func TestBasic(t *testing.T) {
	columns := loadColumns(t)
	runWhereTestSuite(t, columns, "basic.json")
}

func TestBoolean(t *testing.T) {
	columns := loadColumns(t)
	runWhereTestSuite(t, columns, "boolean.json")
}

func TestJsonColumns(t *testing.T) {
	columns := loadColumns(t)
	runWhereTestSuite(t, columns, "json_columns.json")
}

func TestMapArray(t *testing.T) {
	columns := loadColumns(t)
	runWhereTestSuite(t, columns, "map_array.json")
}

func TestIn(t *testing.T) {
	columns := loadColumns(t)
	runWhereTestSuite(t, columns, "in.json")
}

func TestHas(t *testing.T) {
	columns := loadColumns(t)
	runWhereTestSuite(t, columns, "has.json")
}

func TestTruthy(t *testing.T) {
	columns := loadColumns(t)
	runWhereTestSuite(t, columns, "truthy.json")
}

func TestNot(t *testing.T) {
	columns := loadColumns(t)
	runWhereTestSuite(t, columns, "not.json")
}

func TestErrors(t *testing.T) {
	columns := loadColumns(t)
	runWhereTestSuite(t, columns, "errors.json")
}

func TestStruct(t *testing.T) {
	columns := loadColumns(t)
	runWhereTestSuite(t, columns, "struct.json")
}

func TestTransformers(t *testing.T) {
	columns := loadColumns(t)
	runWhereTestSuite(t, columns, "transformers.json")
}

func TestTypes(t *testing.T) {
	columns := loadColumns(t)
	runWhereTestSuite(t, columns, "types.json")
}

func TestLike(t *testing.T) {
	columns := loadColumns(t)
	runWhereTestSuite(t, columns, "like.json")
}

func TestColumnRef(t *testing.T) {
	columns := loadColumns(t)
	runWhereTestSuite(t, columns, "column_ref.json")
}
