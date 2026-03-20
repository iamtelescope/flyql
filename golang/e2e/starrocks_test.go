package e2e_test

import (
	"database/sql"
	"fmt"
	"os"
	"testing"

	_ "github.com/go-sql-driver/mysql"
	flyql "github.com/iamtelescope/flyql/golang"
	starrocksgen "github.com/iamtelescope/flyql/golang/generators/starrocks"
)

func starRocksDSN() string {
	if dsn := os.Getenv("STARROCKS_DSN"); dsn != "" {
		return dsn
	}
	return "root:@tcp(localhost:19030)/flyql_test"
}

func TestStarRocksE2E(t *testing.T) {
	dsn := starRocksDSN()

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		t.Skipf("StarRocks not available: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		t.Skipf("StarRocks ping failed: %v", err)
	}

	columns := loadStarRocksColumns(t)
	testCases := loadTestCases(t)

	for _, tc := range testCases {
		tc := tc
		if !containsDB(tc.Databases, "starrocks") {
			continue
		}
		t.Run(tc.Name, func(t *testing.T) {
			r := testResult{
				Kind:        "where",
				Database:    "starrocks",
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

			sqlWhere, err := starrocksgen.ToSQLWhere(parsed.Root, columns)
			if err != nil {
				r.Error = fmt.Sprintf("generate SQL: %v", err)
				addResult(r)
				t.Fatal(r.Error)
			}
			r.SQL = sqlWhere

			query := fmt.Sprintf("SELECT id FROM flyql_e2e_test WHERE %s ORDER BY id", sqlWhere)
			rows, err := db.Query(query)
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

func TestStarRocksSelectE2E(t *testing.T) {
	dsn := starRocksDSN()

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		t.Skipf("StarRocks not available: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		t.Skipf("StarRocks ping failed: %v", err)
	}

	columns := loadStarRocksColumns(t)
	testCases := loadSelectTestCases(t, "starrocks")

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.Name, func(t *testing.T) {
			r := testResult{
				Kind:     "select",
				Database: "starrocks",
				Name:     tc.Name,
				FlyQL:    tc.SelectColumns,
			}
			defer func() {
				r.Passed = !t.Failed()
				addResult(r)
			}()

			selectResult, err := starrocksgen.ToSQLSelect(tc.SelectColumns, columns)
			if err != nil {
				r.Error = fmt.Sprintf("ToSQLSelect: %v", err)
				t.Fatal(r.Error)
			}
			r.SQL = selectResult.SQL

			query := fmt.Sprintf("SELECT %s FROM flyql_e2e_test ORDER BY id", selectResult.SQL)
			rows, err := db.Query(query)
			if err != nil {
				r.Error = fmt.Sprintf("query: %v", err)
				t.Fatal(r.Error)
			}
			defer rows.Close()

			cols, _ := rows.Columns()
			var gotRows [][]string
			for rows.Next() {
				vals := make([]sql.NullString, len(cols))
				ptrs := make([]any, len(cols))
				for i := range vals {
					ptrs[i] = &vals[i]
				}
				if err := rows.Scan(ptrs...); err != nil {
					r.Error = fmt.Sprintf("scan: %v", err)
					t.Fatal(r.Error)
				}
				row := make([]string, len(vals))
				for i, v := range vals {
					if !v.Valid {
						row[i] = "null"
						continue
					}
					s := v.String
					// Strip JSON quotes from StarRocks JSON path values
					if len(s) >= 2 && s[0] == '"' && s[len(s)-1] == '"' {
						s = s[1 : len(s)-1]
					}
					row[i] = s
				}
				gotRows = append(gotRows, row)
			}

			if len(gotRows) != len(tc.ExpectedRows) {
				r.Error = fmt.Sprintf("row count: got %d, want %d", len(gotRows), len(tc.ExpectedRows))
				t.Error(r.Error)
				return
			}
			for i, expected := range tc.ExpectedRows {
				got := gotRows[i]
				for j := range expected {
					if j < len(got) && got[j] != expected[j] {
						t.Errorf("row %d col %d: got %q, want %q", i, j, got[j], expected[j])
					}
				}
			}
		})
	}
}
