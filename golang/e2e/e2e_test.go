package e2e_test

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"sync"
	"testing"

	clickhousegen "github.com/iamtelescope/flyql/golang/generators/clickhouse"
	postgresqlgen "github.com/iamtelescope/flyql/golang/generators/postgresql"
	starrocksgen "github.com/iamtelescope/flyql/golang/generators/starrocks"
)

// ---------- shared test data types ----------

type testCase struct {
	Name        string   `json:"name"`
	FlyQL       string   `json:"flyql"`
	ExpectedIDs []int    `json:"expected_ids"`
	Databases   []string `json:"databases"`
}

type testCasesFile struct {
	Tests []testCase `json:"tests"`
}

type chColumnDef struct {
	Name       string   `json:"name"`
	JSONString bool     `json:"jsonstring"`
	Type       string   `json:"type"`
	Values     []string `json:"values"`
}

type pgColumnDef struct {
	Name   string   `json:"name"`
	Type   string   `json:"type"`
	Values []string `json:"values"`
}

type chColumnsFile struct {
	Columns map[string]chColumnDef `json:"columns"`
}

type pgColumnsFile struct {
	Columns map[string]pgColumnDef `json:"columns"`
}

// ---------- report result ----------

type testResult struct {
	Kind        string `json:"kind"` // "where" or "select"
	Database    string `json:"database"`
	Name        string `json:"name"`
	FlyQL       string `json:"flyql"`
	SQL         string `json:"sql"`
	ExpectedIDs []int  `json:"expected_ids"`
	ReturnedIDs []int  `json:"returned_ids"`
	Passed      bool   `json:"passed"`
	Error       string `json:"error"`
}

type jsonReport struct {
	Language string       `json:"language"`
	Results  []testResult `json:"results"`
}

var (
	resultsMu sync.Mutex
	results   []testResult
)

func addResult(r testResult) {
	resultsMu.Lock()
	defer resultsMu.Unlock()
	results = append(results, r)
}

func idsMatch(expected, got []int) bool {
	if len(expected) != len(got) {
		return false
	}
	a := make([]int, len(expected))
	copy(a, expected)
	sort.Ints(a)
	b := make([]int, len(got))
	copy(b, got)
	sort.Ints(b)
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func formatIDs(ids []int) string {
	if len(ids) == 0 {
		return "[]"
	}
	s := "["
	for i, id := range ids {
		if i > 0 {
			s += ", "
		}
		s += fmt.Sprintf("%d", id)
	}
	return s + "]"
}

// ---------- TestMain: run tests then write report ----------

func TestMain(m *testing.M) {
	code := m.Run()
	writeJSONReport()
	os.Exit(code)
}

func writeJSONReport() {
	path := os.Getenv("E2E_REPORT_JSON")
	if path == "" {
		return
	}

	resultsMu.Lock()
	rs := make([]testResult, len(results))
	copy(rs, results)
	resultsMu.Unlock()

	report := jsonReport{
		Language: "go",
		Results:  rs,
	}

	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "warn: could not marshal JSON report: %v\n", err)
		return
	}

	if err := os.WriteFile(path, data, 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "warn: could not write JSON report %s: %v\n", path, err)
		return
	}
	fmt.Printf("json report: %s\n", path)
}

// ---------- file loaders ----------

func repoRoot() string {
	_, file, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(file), "..", "..")
}

func testDataPath(parts ...string) string {
	return filepath.Join(append([]string{repoRoot(), "tests-data", "e2e"}, parts...)...)
}

func loadTestCases(t *testing.T) []testCase {
	t.Helper()
	data, err := os.ReadFile(testDataPath("test_cases.json"))
	if err != nil {
		t.Fatalf("read test_cases.json: %v", err)
	}
	var f testCasesFile
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatalf("parse test_cases.json: %v", err)
	}
	return f.Tests
}

func loadClickHouseColumns(t *testing.T) map[string]*clickhousegen.Column {
	t.Helper()
	data, err := os.ReadFile(testDataPath("clickhouse", "columns.json"))
	if err != nil {
		t.Fatalf("read clickhouse columns.json: %v", err)
	}
	var f chColumnsFile
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatalf("parse clickhouse columns.json: %v", err)
	}
	cols := make(map[string]*clickhousegen.Column, len(f.Columns))
	for name, def := range f.Columns {
		cols[name] = clickhousegen.NewColumn(def.Name, def.JSONString, def.Type, def.Values)
	}
	return cols
}

func loadPostgreSQLColumns(t *testing.T) map[string]*postgresqlgen.Column {
	t.Helper()
	data, err := os.ReadFile(testDataPath("postgresql", "columns.json"))
	if err != nil {
		t.Fatalf("read postgresql columns.json: %v", err)
	}
	var f pgColumnsFile
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatalf("parse postgresql columns.json: %v", err)
	}
	cols := make(map[string]*postgresqlgen.Column, len(f.Columns))
	for name, def := range f.Columns {
		cols[name] = postgresqlgen.NewColumn(def.Name, def.Type, def.Values)
	}
	return cols
}

type srColumnDef struct {
	Name       string   `json:"name"`
	JSONString bool     `json:"jsonstring"`
	Type       string   `json:"type"`
	Values     []string `json:"values"`
}

type srColumnsFile struct {
	Columns map[string]srColumnDef `json:"columns"`
}

func loadStarRocksColumns(t *testing.T) map[string]*starrocksgen.Column {
	t.Helper()
	data, err := os.ReadFile(testDataPath("starrocks", "columns.json"))
	if err != nil {
		t.Fatalf("read starrocks columns.json: %v", err)
	}
	var f srColumnsFile
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatalf("parse starrocks columns.json: %v", err)
	}
	cols := make(map[string]*starrocksgen.Column, len(f.Columns))
	for name, def := range f.Columns {
		cols[name] = starrocksgen.NewColumn(def.Name, def.JSONString, def.Type, def.Values)
	}
	return cols
}

type selectTestCase struct {
	Name                string     `json:"name"`
	SelectColumns       string     `json:"select_columns"`
	ExpectedColumnNames []string   `json:"expected_column_names,omitempty"`
	ExpectedRows        [][]string `json:"expected_rows"`
}

type selectTestCasesFile struct {
	Tests []selectTestCase `json:"tests"`
}

func loadSelectTestCases(t *testing.T, database string) []selectTestCase {
	t.Helper()
	data, err := os.ReadFile(testDataPath(database, "select_test_cases.json"))
	if err != nil {
		t.Fatalf("read %s/select_test_cases.json: %v", database, err)
	}
	var f selectTestCasesFile
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatalf("parse %s/select_test_cases.json: %v", database, err)
	}
	return f.Tests
}

func containsDB(databases []string, db string) bool {
	for _, d := range databases {
		if d == db {
			return true
		}
	}
	return false
}
