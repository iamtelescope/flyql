package e2e_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"testing"

	clickhousedriver "github.com/ClickHouse/clickhouse-go/v2"
	flyql "github.com/iamtelescope/flyql/golang"
	clickhousegen "github.com/iamtelescope/flyql/golang/generators/clickhouse"
	postgresqlgen "github.com/iamtelescope/flyql/golang/generators/postgresql"
	starrocksgen "github.com/iamtelescope/flyql/golang/generators/starrocks"
	"github.com/jackc/pgx/v5"
)

type parityTestCase struct {
	Name           string `json:"name"`
	FlyQL          string `json:"flyql"`
	ExpectedRowIDs []int  `json:"expected_row_ids"`
}

type parityTestCasesFile struct {
	Tests []parityTestCase `json:"tests"`
}

func loadParityTestCases(t *testing.T) []parityTestCase {
	t.Helper()
	data, err := os.ReadFile(testDataPath("dialect_parity_tests.json"))
	if err != nil {
		t.Fatalf("read dialect_parity_tests.json: %v", err)
	}
	var f parityTestCasesFile
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatalf("parse dialect_parity_tests.json: %v", err)
	}
	return f.Tests
}

func parityRunClickHouse(ctx context.Context, conn clickhousedriver.Conn, columns map[string]*clickhousegen.Column, flyqlExpr string) (string, []int, error) {
	parsed, err := flyql.Parse(flyqlExpr)
	if err != nil {
		return "", nil, fmt.Errorf("parse: %w", err)
	}
	sqlWhere, err := clickhousegen.ToSQLWhere(parsed.Root, columns)
	if err != nil {
		return "", nil, fmt.Errorf("generate: %w", err)
	}
	query := fmt.Sprintf("SELECT id FROM flyql_e2e_test WHERE %s ORDER BY id", sqlWhere)
	rows, err := conn.Query(ctx, query)
	if err != nil {
		return sqlWhere, nil, fmt.Errorf("query: %w", err)
	}
	defer rows.Close()
	var ids []int
	for rows.Next() {
		var id int32
		if err := rows.Scan(&id); err != nil {
			return sqlWhere, nil, fmt.Errorf("scan: %w", err)
		}
		ids = append(ids, int(id))
	}
	return sqlWhere, ids, rows.Err()
}

func parityRunStarRocks(db *sql.DB, columns map[string]*starrocksgen.Column, flyqlExpr string) (string, []int, error) {
	parsed, err := flyql.Parse(flyqlExpr)
	if err != nil {
		return "", nil, fmt.Errorf("parse: %w", err)
	}
	sqlWhere, err := starrocksgen.ToSQLWhere(parsed.Root, columns)
	if err != nil {
		return "", nil, fmt.Errorf("generate: %w", err)
	}
	query := fmt.Sprintf("SELECT id FROM flyql_e2e_test WHERE %s ORDER BY id", sqlWhere)
	rows, err := db.Query(query)
	if err != nil {
		return sqlWhere, nil, fmt.Errorf("query: %w", err)
	}
	defer rows.Close()
	var ids []int
	for rows.Next() {
		var id int32
		if err := rows.Scan(&id); err != nil {
			return sqlWhere, nil, fmt.Errorf("scan: %w", err)
		}
		ids = append(ids, int(id))
	}
	return sqlWhere, ids, rows.Err()
}

func parityRunPostgreSQL(ctx context.Context, conn *pgx.Conn, columns map[string]*postgresqlgen.Column, flyqlExpr string) (string, []int, error) {
	parsed, err := flyql.Parse(flyqlExpr)
	if err != nil {
		return "", nil, fmt.Errorf("parse: %w", err)
	}
	sqlWhere, err := postgresqlgen.ToSQLWhere(parsed.Root, columns)
	if err != nil {
		return "", nil, fmt.Errorf("generate: %w", err)
	}
	query := fmt.Sprintf("SELECT id FROM flyql_e2e_test WHERE %s ORDER BY id", sqlWhere)
	rows, err := conn.Query(ctx, query)
	if err != nil {
		return sqlWhere, nil, fmt.Errorf("query: %w", err)
	}
	defer rows.Close()
	var ids []int
	for rows.Next() {
		var id int32
		if err := rows.Scan(&id); err != nil {
			return sqlWhere, nil, fmt.Errorf("scan: %w", err)
		}
		ids = append(ids, int(id))
	}
	return sqlWhere, ids, rows.Err()
}

func TestDialectParityE2E(t *testing.T) {
	ctx := context.Background()

	// ClickHouse
	chConn, err := clickhousedriver.Open(&clickhousedriver.Options{
		Addr: []string{clickhouseAddr()},
		Auth: clickhousedriver.Auth{
			Database: "default",
			Username: "flyql",
			Password: "flyql",
		},
	})
	if err != nil {
		t.Fatalf("open clickhouse: %v", err)
	}
	defer chConn.Close()
	if err := chConn.Ping(ctx); err != nil {
		t.Skipf("ClickHouse not available: %v", err)
	}

	// StarRocks
	srDB, err := sql.Open("mysql", starRocksDSN())
	if err != nil {
		t.Fatalf("open starrocks: %v", err)
	}
	defer srDB.Close()
	if err := srDB.Ping(); err != nil {
		t.Skipf("StarRocks not available: %v", err)
	}

	// PostgreSQL
	pgConn, err := pgx.Connect(ctx, postgresqlDSN())
	if err != nil {
		t.Skipf("PostgreSQL not available: %v", err)
	}
	defer pgConn.Close(ctx)

	chCols := loadClickHouseColumns(t)
	srCols := loadStarRocksColumns(t)
	pgCols := loadPostgreSQLColumns(t)

	cases := loadParityTestCases(t)
	for _, tc := range cases {
		tc := tc
		expected := append([]int(nil), tc.ExpectedRowIDs...)
		sort.Ints(expected)

		t.Run(tc.Name, func(t *testing.T) {
			runners := []struct {
				database string
				run      func() (string, []int, error)
			}{
				{"clickhouse", func() (string, []int, error) {
					return parityRunClickHouse(ctx, chConn, chCols, tc.FlyQL)
				}},
				{"starrocks", func() (string, []int, error) {
					return parityRunStarRocks(srDB, srCols, tc.FlyQL)
				}},
				{"postgresql", func() (string, []int, error) {
					return parityRunPostgreSQL(ctx, pgConn, pgCols, tc.FlyQL)
				}},
			}

			for _, r := range runners {
				r := r
				result := testResult{
					Kind:        "dialect_parity",
					Database:    r.database,
					Name:        tc.Name,
					FlyQL:       tc.FlyQL,
					ExpectedIDs: expected,
				}
				sqlText, ids, runErr := r.run()
				result.SQL = sqlText
				if runErr != nil {
					result.Error = runErr.Error()
					addResult(result)
					t.Errorf("%s: %v", r.database, runErr)
					continue
				}
				sort.Ints(ids)
				result.ReturnedIDs = ids
				result.Passed = idsMatch(expected, ids)
				addResult(result)
				if !result.Passed {
					t.Errorf("%s: expected %v got %v", r.database, expected, ids)
				}
			}
		})
	}
}
