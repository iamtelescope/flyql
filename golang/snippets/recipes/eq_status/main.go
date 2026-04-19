// Filter records where status field is exactly 200.
//
// FlyQL query: status = 200
package main

import (
	"fmt"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/generators/clickhouse"
)

func main() {
	result, err := flyql.Parse("status = 200")
	if err != nil {
		panic(err)
	}

	columns := map[string]*clickhouse.Column{
		"status": clickhouse.NewColumn(clickhouse.ColumnDef{Name: "status", Type: "UInt32"}),
	}

	sql, err := clickhouse.ToSQLWhere(result.Root, columns)
	if err != nil {
		panic(err)
	}
	fmt.Println(sql)
}
