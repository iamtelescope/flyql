package e2e_test

import (
	"context"
	"fmt"
	"os"
	"testing"

	"encoding/json"

	flyql "github.com/iamtelescope/flyql/golang"
	postgresqlgen "github.com/iamtelescope/flyql/golang/generators/postgresql"
	"github.com/jackc/pgx/v5"
)

type pgSelectTestCase struct {
	Name                string     `json:"name"`
	SelectColumns       string     `json:"select_columns"`
	ExpectedColumnNames []string   `json:"expected_column_names,omitempty"`
	ExpectedRows        [][]string `json:"expected_rows"`
}

type pgSelectTestCasesFile struct {
	Tests []pgSelectTestCase `json:"tests"`
}

func loadPostgreSQLSelectTestCases(t *testing.T) []pgSelectTestCase {
	t.Helper()
	data, err := os.ReadFile(testDataPath("postgresql", "select_test_cases.json"))
	if err != nil {
		t.Fatalf("read select_test_cases.json: %v", err)
	}
	var f pgSelectTestCasesFile
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatalf("parse select_test_cases.json: %v", err)
	}
	return f.Tests
}

func postgresqlDSN() string {
	if dsn := os.Getenv("POSTGRESQL_DSN"); dsn != "" {
		return dsn
	}
	return "postgres://flyql:flyql@localhost:15432/flyql_test"
}

func TestPostgreSQLE2E(t *testing.T) {
	dsn := postgresqlDSN()
	ctx := context.Background()

	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Skipf("PostgreSQL not available at %s: %v", dsn, err)
	}
	defer conn.Close(ctx)

	if err := conn.Ping(ctx); err != nil {
		t.Skipf("PostgreSQL ping failed: %v", err)
	}

	columns := loadPostgreSQLColumns(t)
	testCases := loadTestCases(t)

	for _, tc := range testCases {
		tc := tc
		if !containsDB(tc.Databases, "postgresql") {
			continue
		}
		t.Run(tc.Name, func(t *testing.T) {
			r := testResult{
				Kind:        "where",
				Database:    "postgresql",
				Name:        tc.Name,
				FlyQL:       tc.FlyQL,
				ExpectedIDs: tc.ExpectedIDs,
			}

			parsed, err := flyql.Parse(tc.FlyQL)
			if err != nil {
				r.Error = fmt.Sprintf("parse: %v", err)
				addResult(r)
				t.Fatal(r.Error)
			}

			sqlWhere, err := postgresqlgen.ToSQLWhere(parsed.Root, columns)
			if err != nil {
				r.Error = fmt.Sprintf("generate SQL: %v", err)
				addResult(r)
				t.Fatal(r.Error)
			}
			r.SQL = sqlWhere

			query := fmt.Sprintf("SELECT id FROM flyql_e2e_test WHERE %s ORDER BY id", sqlWhere)
			rows, err := conn.Query(ctx, query)
			if err != nil {
				r.Error = fmt.Sprintf("query: %v", err)
				addResult(r)
				t.Fatal(r.Error)
			}
			defer rows.Close()

			var ids []int
			for rows.Next() {
				var id int32
				if err := rows.Scan(&id); err != nil {
					r.Error = fmt.Sprintf("scan: %v", err)
					addResult(r)
					t.Fatal(r.Error)
				}
				ids = append(ids, int(id))
			}
			if err := rows.Err(); err != nil {
				r.Error = fmt.Sprintf("rows: %v", err)
				addResult(r)
				t.Fatal(r.Error)
			}

			r.ReturnedIDs = ids
			r.Passed = idsMatch(tc.ExpectedIDs, ids)
			addResult(r)

			if !r.Passed {
				t.Errorf("expected %v, got %v", tc.ExpectedIDs, ids)
			}
		})
	}
}

func TestPostgreSQLSelectE2E(t *testing.T) {
	dsn := postgresqlDSN()
	ctx := context.Background()

	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Skipf("PostgreSQL not available at %s: %v", dsn, err)
	}
	defer conn.Close(ctx)

	if err := conn.Ping(ctx); err != nil {
		t.Skipf("PostgreSQL ping failed: %v", err)
	}

	columns := loadPostgreSQLColumns(t)
	testCases := loadPostgreSQLSelectTestCases(t)

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.Name, func(t *testing.T) {
			r := testResult{
				Kind:     "select",
				Database: "postgresql",
				Name:     tc.Name,
				FlyQL:    tc.SelectColumns,
			}
			defer func() {
				r.Passed = !t.Failed()
				addResult(r)
			}()

			selectResult, err := postgresqlgen.ToSQLSelect(tc.SelectColumns, columns)
			if err != nil {
				r.Error = fmt.Sprintf("ToSQLSelect: %v", err)
				t.Fatal(r.Error)
			}
			r.SQL = selectResult.SQL

			query := fmt.Sprintf("SELECT %s FROM flyql_e2e_test ORDER BY id", selectResult.SQL)
			rows, err := conn.Query(ctx, query)
			if err != nil {
				r.Error = fmt.Sprintf("query: %v", err)
				t.Fatal(r.Error)
			}
			defer rows.Close()

			if len(tc.ExpectedColumnNames) > 0 {
				fds := rows.FieldDescriptions()
				if len(fds) != len(tc.ExpectedColumnNames) {
					r.Error = fmt.Sprintf("column count: got %d, want %d", len(fds), len(tc.ExpectedColumnNames))
					t.Error(r.Error)
				} else {
					for i, fd := range fds {
						if fd.Name != tc.ExpectedColumnNames[i] {
							r.Error = fmt.Sprintf("column[%d] name: got %q, want %q", i, fd.Name, tc.ExpectedColumnNames[i])
							t.Error(r.Error)
						}
					}
				}
			}

			var gotRows [][]string
			for rows.Next() {
				vals, err := rows.Values()
				if err != nil {
					r.Error = fmt.Sprintf("row values: %v", err)
					t.Fatal(r.Error)
				}
				row := make([]string, len(vals))
				for i, v := range vals {
					row[i] = fmt.Sprintf("%v", v)
				}
				gotRows = append(gotRows, row)
			}
			if err := rows.Err(); err != nil {
				r.Error = fmt.Sprintf("rows: %v", err)
				t.Fatal(r.Error)
			}

			if len(gotRows) != len(tc.ExpectedRows) {
				r.Error = fmt.Sprintf("row count: got %d, want %d", len(gotRows), len(tc.ExpectedRows))
				t.Error(r.Error)
				return
			}
			for i, expected := range tc.ExpectedRows {
				got := gotRows[i]
				if len(got) != len(expected) {
					r.Error = fmt.Sprintf("row %d column count: got %d, want %d", i, len(got), len(expected))
					t.Error(r.Error)
					continue
				}
				for j, expVal := range expected {
					if got[j] != expVal {
						r.Error = fmt.Sprintf("row %d col %d: got %q, want %q", i, j, got[j], expVal)
						t.Error(r.Error)
					}
				}
			}
		})
	}
}
