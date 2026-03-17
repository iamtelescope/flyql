package e2e_test

import (
	"context"
	"fmt"
	"os"
	"testing"

	clickhousedriver "github.com/ClickHouse/clickhouse-go/v2"
	flyql "github.com/iamtelescope/flyql/golang"
	clickhousegen "github.com/iamtelescope/flyql/golang/generators/clickhouse"
)

func clickhouseAddr() string {
	if addr := os.Getenv("CLICKHOUSE_ADDR"); addr != "" {
		return addr
	}
	return "localhost:19000"
}

func TestClickHouseE2E(t *testing.T) {
	addr := clickhouseAddr()
	username := os.Getenv("CLICKHOUSE_USER")
	if username == "" {
		username = "flyql"
	}
	password := os.Getenv("CLICKHOUSE_PASSWORD")
	if password == "" {
		password = "flyql"
	}

	conn, err := clickhousedriver.Open(&clickhousedriver.Options{
		Addr: []string{addr},
		Auth: clickhousedriver.Auth{
			Database: "default",
			Username: username,
			Password: password,
		},
		Settings: clickhousedriver.Settings{
			"max_execution_time": 10,
		},
	})
	if err != nil {
		t.Fatalf("open ClickHouse connection: %v", err)
	}
	defer conn.Close()

	ctx := context.Background()
	if err := conn.Ping(ctx); err != nil {
		t.Skipf("ClickHouse not available at %s: %v", addr, err)
	}

	columns := loadClickHouseColumns(t)
	testCases := loadTestCases(t)

	for _, tc := range testCases {
		tc := tc
		if !containsDB(tc.Databases, "clickhouse") {
			continue
		}
		t.Run(tc.Name, func(t *testing.T) {
			r := testResult{
				Kind:        "where",
				Database:    "clickhouse",
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

			sqlWhere, err := clickhousegen.ToSQL(parsed.Root, columns)
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
