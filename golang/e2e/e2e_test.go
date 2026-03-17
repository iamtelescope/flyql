package e2e_test

import (
	"encoding/json"
	"fmt"
	"html/template"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"sync"
	"testing"
	"time"

	clickhousegen "github.com/iamtelescope/flyql/golang/generators/clickhouse"
	postgresqlgen "github.com/iamtelescope/flyql/golang/generators/postgresql"
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
	writeReport()
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

// ---------- report data model ----------

type reportData struct {
	Timestamp     string
	Total         int
	Passed        int
	Failed        int
	WhereResults  []testResult
	SelectResults []testResult
}

// ---------- report template ----------

var reportTmpl = template.Must(template.New("report").Funcs(template.FuncMap{
	"dbClass": func(r testResult) string {
		if r.Database == "postgresql" {
			return "pg"
		}
		return "ch"
	},
	"statusIcon": func(r testResult) string {
		if r.Passed {
			return "✓"
		}
		return "✗"
	},
	"statusClass": func(r testResult) string {
		if r.Passed {
			return "pass"
		}
		return "fail"
	},
	"retClass": func(r testResult) string {
		if r.Passed {
			return "ids"
		}
		return "ids mismatch"
	},
	"formatIDs": formatIDs,
}).Parse(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>FlyQL E2E Report</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f6f9;color:#222}
header{background:#16213e;color:#fff;padding:20px 32px}
header h1{font-size:1.4rem;font-weight:600}
header .ts{font-size:.8rem;opacity:.6;margin-top:3px}
.summary{display:flex;gap:12px;padding:16px 32px;background:#fff;border-bottom:1px solid #e4e7ec}
.stat{padding:8px 20px;border-radius:6px;text-align:center;min-width:90px}
.stat .n{font-size:1.8rem;font-weight:700}
.stat .l{font-size:.7rem;text-transform:uppercase;letter-spacing:.5px;opacity:.8}
.total{background:#eef2ff;color:#3730a3}
.spassed{background:#f0fdf4;color:#166534}
.sfailed{background:#fef2f2;color:#991b1b}
.wrap{padding:24px 32px}
h2.section{font-size:1rem;font-weight:600;color:#16213e;margin:28px 0 10px}
h2.section:first-child{margin-top:0}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);margin-bottom:8px}
thead{background:#16213e;color:#fff}
th{padding:11px 14px;text-align:left;font-size:.73rem;text-transform:uppercase;letter-spacing:.4px;font-weight:600}
td{padding:9px 14px;border-bottom:1px solid #f0f2f5;font-size:.85rem;vertical-align:top}
tr:last-child td{border-bottom:none}
tr.pass:hover td{background:#f0fdf4}
tr.fail:hover td{background:#fff5f5}
tr.fail td{background:#fffbfb}
.st{width:32px;text-align:center}
.icon{font-size:1rem}
tr.pass .icon{color:#16a34a}
tr.fail .icon{color:#dc2626}
.db{display:inline-block;padding:2px 9px;border-radius:10px;font-size:.72rem;font-weight:600}
.ch{background:#fff3e0;color:#c2410c}
.pg{background:#eff6ff;color:#1d4ed8}
.name{font-weight:500}
code{font-family:'SFMono-Regular',Consolas,monospace;background:#f8f9fa;padding:2px 6px;border-radius:3px;font-size:.78rem;word-break:break-all}
.ids{font-family:monospace;font-size:.82rem}
.ids.mismatch{color:#dc2626;font-weight:600}
.err{color:#dc2626;font-size:.78rem;margin-top:4px;font-style:italic}
</style>
</head>
<body>
<header>
  <h1>FlyQL E2E Test Report</h1>
  <div class="ts">{{.Timestamp}}</div>
</header>
<div class="summary">
  <div class="stat total"><div class="n">{{.Total}}</div><div class="l">Total</div></div>
  <div class="stat spassed"><div class="n">{{.Passed}}</div><div class="l">Passed</div></div>
  <div class="stat sfailed"><div class="n">{{.Failed}}</div><div class="l">Failed</div></div>
</div>
<div class="wrap">

<h2 class="section">Filter (WHERE) Tests</h2>
<table>
<thead><tr>
  <th class="st"></th><th>DB</th><th>Test</th><th>FlyQL</th><th>Generated SQL</th><th>Expected IDs</th><th>Returned IDs</th><th>Error</th>
</tr></thead>
<tbody>
{{range .WhereResults}}<tr class="{{statusClass .}}">
  <td class="st"><span class="icon">{{statusIcon .}}</span></td>
  <td><span class="db {{dbClass .}}">{{.Database}}</span></td>
  <td class="name">{{.Name}}</td>
  <td><code>{{.FlyQL}}</code></td>
  <td><code>{{.SQL}}</code></td>
  <td class="ids">{{formatIDs .ExpectedIDs}}</td>
  <td class="{{retClass .}}">{{if not .Error}}{{if and (not .Passed) (eq (len .ReturnedIDs) 0)}}<span class="err">(no rows)</span>{{else}}{{formatIDs .ReturnedIDs}}{{end}}{{end}}</td>
  <td class="err">{{.Error}}</td>
</tr>
{{end}}</tbody>
</table>

{{if .SelectResults}}
<h2 class="section">Select Tests</h2>
<table>
<thead><tr>
  <th class="st"></th><th>DB</th><th>Test</th><th>Select Columns</th><th>Generated SQL</th><th>Error</th>
</tr></thead>
<tbody>
{{range .SelectResults}}<tr class="{{statusClass .}}">
  <td class="st"><span class="icon">{{statusIcon .}}</span></td>
  <td><span class="db {{dbClass .}}">{{.Database}}</span></td>
  <td class="name">{{.Name}}</td>
  <td><code>{{.FlyQL}}</code></td>
  <td><code>{{.SQL}}</code></td>
  <td class="err">{{.Error}}</td>
</tr>
{{end}}</tbody>
</table>
{{end}}

</div>
</body>
</html>
`))

// ---------- report writer ----------

func writeReport() {
	path := os.Getenv("E2E_REPORT_PATH")
	if path == "" {
		path = "report.html"
	}

	resultsMu.Lock()
	rs := make([]testResult, len(results))
	copy(rs, results)
	resultsMu.Unlock()

	// failures first, then by database, then by name
	sort.Slice(rs, func(i, j int) bool {
		if rs[i].Passed != rs[j].Passed {
			return !rs[i].Passed
		}
		if rs[i].Database != rs[j].Database {
			return rs[i].Database < rs[j].Database
		}
		return rs[i].Name < rs[j].Name
	})

	data := reportData{Timestamp: time.Now().Format("2006-01-02 15:04:05")}
	for _, r := range rs {
		if r.Passed {
			data.Passed++
		}
		if r.Kind == "select" {
			data.SelectResults = append(data.SelectResults, r)
		} else {
			data.WhereResults = append(data.WhereResults, r)
		}
	}
	data.Total = len(rs)
	data.Failed = data.Total - data.Passed

	f, err := os.Create(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "warn: could not write report %s: %v\n", path, err)
		return
	}
	defer f.Close()

	if err := reportTmpl.Execute(f, data); err != nil {
		fmt.Fprintf(os.Stderr, "warn: could not render report: %v\n", err)
		return
	}
	fmt.Printf("report: %s\n", path)
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

func containsDB(databases []string, db string) bool {
	for _, d := range databases {
		if d == db {
			return true
		}
	}
	return false
}

