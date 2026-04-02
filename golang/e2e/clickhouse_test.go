package e2e_test

import (
	"context"
	"fmt"
	"os"
	"reflect"
	"strings"
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

func TestClickHouseJoinE2E(t *testing.T) {
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

	columns := loadClickHouseJoinColumns(t)
	testCases := loadJoinTestCases(t)

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

			query := fmt.Sprintf("SELECT t.id FROM flyql_e2e_test t INNER JOIN flyql_e2e_related r ON t.id = r.test_id WHERE %s ORDER BY t.id", sqlWhere)
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

func TestClickHouseJoinSelectE2E(t *testing.T) {
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

	columns := loadClickHouseJoinColumns(t)
	testCases := loadJoinSelectTestCases(t, "clickhouse")

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.Name, func(t *testing.T) {
			r := testResult{
				Kind:         "select",
				Database:     "clickhouse",
				Name:         tc.Name,
				FlyQL:        tc.SelectColumns,
				ExpectedRows: tc.ExpectedRows,
			}
			defer func() {
				r.Passed = !t.Failed()
				addResult(r)
			}()

			selectResult, err := clickhousegen.ToSQLSelect(tc.SelectColumns, columns)
			if err != nil {
				r.Error = fmt.Sprintf("ToSQLSelect: %v", err)
				t.Fatal(r.Error)
			}
			r.SQL = selectResult.SQL

			query := fmt.Sprintf("SELECT %s FROM flyql_e2e_test t INNER JOIN flyql_e2e_related r ON t.id = r.test_id ORDER BY t.id", selectResult.SQL)
			rows, err := conn.Query(ctx, query)
			if err != nil {
				r.Error = fmt.Sprintf("query: %v", err)
				t.Fatal(r.Error)
			}
			defer rows.Close()

			colTypes := rows.ColumnTypes()
			var gotRows [][]string
			for rows.Next() {
				ptrs := make([]any, len(colTypes))
				for i, ct := range colTypes {
					switch ct.DatabaseTypeName() {
					case "Int8":
						ptrs[i] = new(int8)
					case "Int16":
						ptrs[i] = new(int16)
					case "Int32":
						ptrs[i] = new(int32)
					case "Int64":
						ptrs[i] = new(int64)
					case "UInt8":
						ptrs[i] = new(uint8)
					case "UInt16":
						ptrs[i] = new(uint16)
					case "UInt32":
						ptrs[i] = new(uint32)
					case "UInt64":
						ptrs[i] = new(uint64)
					case "Float32":
						ptrs[i] = new(float32)
					case "Float64":
						ptrs[i] = new(float64)
					case "Bool":
						ptrs[i] = new(bool)
					default:
						ptrs[i] = new(string)
					}
				}
				if err := rows.Scan(ptrs...); err != nil {
					r.Error = fmt.Sprintf("scan: %v", err)
					t.Fatal(r.Error)
				}
				row := make([]string, len(ptrs))
				for i, p := range ptrs {
					row[i] = fmt.Sprintf("%v", reflect.ValueOf(p).Elem().Interface())
				}
				gotRows = append(gotRows, row)
			}

			r.ReturnedRows = gotRows

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

func TestClickHouseSelectE2E(t *testing.T) {
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
	testCases := loadSelectTestCases(t, "clickhouse")

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.Name, func(t *testing.T) {
			r := testResult{
				Kind:         "select",
				Database:     "clickhouse",
				Name:         tc.Name,
				FlyQL:        tc.SelectColumns,
				ExpectedRows: tc.ExpectedRows,
			}
			defer func() {
				r.Passed = !t.Failed()
				addResult(r)
			}()

			selectResult, err := clickhousegen.ToSQLSelect(tc.SelectColumns, columns)
			if err != nil {
				r.Error = fmt.Sprintf("ToSQLSelect: %v", err)
				t.Fatal(r.Error)
			}
			r.SQL = selectResult.SQL

			// Skip DB execution for native JSON — Go ClickHouse driver doesn't support Dynamic type
			if strings.Contains(tc.SelectColumns, "meta_json") {
				r.Passed = true
				return
			}

			query := fmt.Sprintf("SELECT %s FROM flyql_e2e_test ORDER BY id", selectResult.SQL)
			rows, err := conn.Query(ctx, query)
			if err != nil {
				r.Error = fmt.Sprintf("query: %v", err)
				t.Fatal(r.Error)
			}
			defer rows.Close()

			colTypes := rows.ColumnTypes()
			var gotRows [][]string
			for rows.Next() {
				ptrs := make([]any, len(colTypes))
				for i, ct := range colTypes {
					switch ct.DatabaseTypeName() {
					case "Int8":
						ptrs[i] = new(int8)
					case "Int16":
						ptrs[i] = new(int16)
					case "Int32":
						ptrs[i] = new(int32)
					case "Int64":
						ptrs[i] = new(int64)
					case "UInt8":
						ptrs[i] = new(uint8)
					case "UInt16":
						ptrs[i] = new(uint16)
					case "UInt32":
						ptrs[i] = new(uint32)
					case "UInt64":
						ptrs[i] = new(uint64)
					case "Float32":
						ptrs[i] = new(float32)
					case "Float64":
						ptrs[i] = new(float64)
					case "Bool":
						ptrs[i] = new(bool)
					default:
						ptrs[i] = new(string)
					}
				}
				if err := rows.Scan(ptrs...); err != nil {
					r.Error = fmt.Sprintf("scan: %v", err)
					t.Fatal(r.Error)
				}
				row := make([]string, len(ptrs))
				for i, p := range ptrs {
					row[i] = fmt.Sprintf("%v", reflect.ValueOf(p).Elem().Interface())
				}
				gotRows = append(gotRows, row)
			}

			r.ReturnedRows = gotRows

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
