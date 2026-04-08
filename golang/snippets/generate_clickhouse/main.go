package main

import (
	"fmt"
	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/generators/clickhouse"
)

func main() {
	result, err := flyql.Parse("status >= 400 and host = prod*")
	if err != nil {
		panic(err)
	}

	columns := map[string]*clickhouse.Column{
		"status": clickhouse.NewColumn(clickhouse.ColumnDef{Name: "status", Type: "UInt32"}),
		"host":   clickhouse.NewColumn(clickhouse.ColumnDef{Name: "host", Type: "String"}),
	}

	sql, err := clickhouse.ToSQLWhere(result.Root, columns)
	if err != nil {
		panic(err)
	}
	fmt.Println(sql)
}
