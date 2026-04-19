// Filter pending tasks that are either past due or urgent.
//
// FlyQL query: pending and (due_date < '2023-12-31' or priority = 'urgent')
//
// Date comparisons use ISO-8601 string literals; ClickHouse, PostgreSQL, and
// StarRocks all coerce them to DATE/DATETIME values. See syntax/dates for when
// to use string literals versus temporal functions like ago(...).
package main

import (
	"fmt"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/generators/clickhouse"
)

func main() {
	result, err := flyql.Parse("pending and (due_date < '2023-12-31' or priority = 'urgent')")
	if err != nil {
		panic(err)
	}

	columns := map[string]*clickhouse.Column{
		"pending":  clickhouse.NewColumn(clickhouse.ColumnDef{Name: "pending", Type: "Bool"}),
		"due_date": clickhouse.NewColumn(clickhouse.ColumnDef{Name: "due_date", Type: "Date"}),
		"priority": clickhouse.NewColumn(clickhouse.ColumnDef{Name: "priority", Type: "String"}),
	}

	sql, err := clickhouse.ToSQLWhere(result.Root, columns)
	if err != nil {
		panic(err)
	}
	fmt.Println(sql)
}
