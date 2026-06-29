package e2e_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"testing"

	clickhousedriver "github.com/ClickHouse/clickhouse-go/v2"
	flyql "github.com/iamtelescope/flyql/golang"
	clickhousegen "github.com/iamtelescope/flyql/golang/generators/clickhouse"
	postgresqlgen "github.com/iamtelescope/flyql/golang/generators/postgresql"
	starrocksgen "github.com/iamtelescope/flyql/golang/generators/starrocks"
	"github.com/iamtelescope/flyql/golang/matcher"
	"github.com/jackc/pgx/v5"
)

// cyrillicTable is a dedicated table seeded with Cyrillic data (see each
// tests-data/e2e/<db>/init.sql). Kept separate from flyql_e2e_test so the
// shared 6-row dataset and its expected_ids stay untouched.
const cyrillicTable = "flyql_cyrillic_test"

type cyrillicFixture struct {
	Rows  []map[string]any `json:"rows"`
	Tests []testCase       `json:"tests"`
}

func loadCyrillicFixture(t *testing.T) cyrillicFixture {
	t.Helper()
	data, err := os.ReadFile(testDataPath("cyrillic.json"))
	if err != nil {
		t.Fatalf("read cyrillic.json: %v", err)
	}
	var f cyrillicFixture
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatalf("parse cyrillic.json: %v", err)
	}
	return f
}

// TestCyrillicMatcherE2E evaluates every fixture case with the in-memory matcher.
// Identical expected_ids across Python/Go/JS prove cross-language parsing parity
// for non-ASCII input — no database required.
func TestCyrillicMatcherE2E(t *testing.T) {
	fx := loadCyrillicFixture(t)
	for _, tc := range fx.Tests {
		tc := tc
		t.Run(tc.Name, func(t *testing.T) {
			r := testResult{
				Kind:        "where",
				Database:    "matcher",
				Name:        tc.Name,
				FlyQL:       tc.FlyQL,
				SQL:         "(in-memory)",
				ExpectedIDs: tc.ExpectedIDs,
			}

			var matchedIDs []int
			for _, row := range fx.Rows {
				matched, err := matcher.Match(tc.FlyQL, row)
				if err != nil {
					r.Error = err.Error()
					addResult(r)
					t.Fatalf("matcher error: %v", err)
				}
				if matched {
					// JSON unmarshals numbers as float64; fail loudly on anything else
					// rather than silently dropping the row from the result set.
					id, ok := row["id"].(float64)
					if !ok {
						r.Error = fmt.Sprintf("row id is not a JSON number: %T", row["id"])
						addResult(r)
						t.Fatalf("row id is not a JSON number: %T", row["id"])
					}
					matchedIDs = append(matchedIDs, int(id))
				}
			}

			r.ReturnedIDs = matchedIDs
			r.Passed = idsMatch(tc.ExpectedIDs, matchedIDs)
			addResult(r)
			if !r.Passed {
				t.Errorf("expected %v, got %v", tc.ExpectedIDs, matchedIDs)
			}
		})
	}
}

// TestCyrillicDatabaseE2E generates SQL from each fixture case and runs it against
// the Cyrillic table in every database the case lists. Each database is skipped
// independently when unavailable. The e2e runner cross-checks that Python/Go/JS
// produced byte-identical SQL per (case, database).
func TestCyrillicDatabaseE2E(t *testing.T) {
	fx := loadCyrillicFixture(t)
	ctx := context.Background()

	// ClickHouse — open, always defer Close (even if Ping fails), then probe.
	chConn, chErr := clickhousedriver.Open(&clickhousedriver.Options{
		Addr: []string{clickhouseAddr()},
		Auth: clickhousedriver.Auth{Database: "default", Username: "flyql", Password: "flyql"},
	})
	chAvail := false
	if chErr == nil {
		defer chConn.Close()
		chAvail = chConn.Ping(ctx) == nil
	}

	// StarRocks
	srDB, srErr := sql.Open("mysql", starRocksDSN())
	srAvail := false
	if srErr == nil {
		defer srDB.Close()
		srAvail = srDB.Ping() == nil
	}

	// PostgreSQL — pgx.Connect alone doesn't prove the conn is usable; Ping it.
	pgConn, pgErr := pgx.Connect(ctx, postgresqlDSN())
	pgAvail := false
	if pgErr == nil {
		defer pgConn.Close(ctx)
		pgAvail = pgConn.Ping(ctx) == nil
	}

	if !chAvail && !srAvail && !pgAvail {
		t.Skip("no database available for Cyrillic e2e")
	}

	chCols := loadClickHouseColumns(t)
	srCols := loadStarRocksColumns(t)
	pgCols := loadPostgreSQLColumns(t)

	runCH := func(expr string) (string, []int, error) {
		parsed, err := flyql.Parse(expr)
		if err != nil {
			return "", nil, fmt.Errorf("parse: %w", err)
		}
		sqlWhere, err := clickhousegen.ToSQLWhere(parsed.Root, chCols)
		if err != nil {
			return "", nil, fmt.Errorf("generate: %w", err)
		}
		rows, err := chConn.Query(ctx, fmt.Sprintf("SELECT id FROM %s WHERE %s ORDER BY id", cyrillicTable, sqlWhere))
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

	runSR := func(expr string) (string, []int, error) {
		parsed, err := flyql.Parse(expr)
		if err != nil {
			return "", nil, fmt.Errorf("parse: %w", err)
		}
		sqlWhere, err := starrocksgen.ToSQLWhere(parsed.Root, srCols)
		if err != nil {
			return "", nil, fmt.Errorf("generate: %w", err)
		}
		rows, err := srDB.Query(fmt.Sprintf("SELECT id FROM %s WHERE %s ORDER BY id", cyrillicTable, sqlWhere))
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

	runPG := func(expr string) (string, []int, error) {
		parsed, err := flyql.Parse(expr)
		if err != nil {
			return "", nil, fmt.Errorf("parse: %w", err)
		}
		sqlWhere, err := postgresqlgen.ToSQLWhere(parsed.Root, pgCols)
		if err != nil {
			return "", nil, fmt.Errorf("generate: %w", err)
		}
		rows, err := pgConn.Query(ctx, fmt.Sprintf("SELECT id FROM %s WHERE %s ORDER BY id", cyrillicTable, sqlWhere))
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

	dbs := []struct {
		name  string
		avail bool
		run   func(string) (string, []int, error)
	}{
		{"clickhouse", chAvail, runCH},
		{"starrocks", srAvail, runSR},
		{"postgresql", pgAvail, runPG},
	}

	for _, tc := range fx.Tests {
		tc := tc
		t.Run(tc.Name, func(t *testing.T) {
			for _, db := range dbs {
				if !containsDB(tc.Databases, db.name) || !db.avail {
					continue
				}
				r := testResult{
					Kind:        "where",
					Database:    db.name,
					Name:        tc.Name,
					FlyQL:       tc.FlyQL,
					ExpectedIDs: tc.ExpectedIDs,
				}
				sqlText, ids, runErr := db.run(tc.FlyQL)
				r.SQL = sqlText
				if runErr != nil {
					r.Error = runErr.Error()
					addResult(r)
					t.Errorf("%s: %v", db.name, runErr)
					continue
				}
				r.ReturnedIDs = ids
				r.Passed = idsMatch(tc.ExpectedIDs, ids)
				addResult(r)
				if !r.Passed {
					t.Errorf("%s: expected %v got %v", db.name, tc.ExpectedIDs, ids)
				}
			}
		})
	}
}
