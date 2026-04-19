// Filter records by price greater than 50.00 and quantity at most 10.
//
// FlyQL query: price > 50.00 and quantity <= 10
package main

import (
	"fmt"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/generators/clickhouse"
)

func main() {
	result, err := flyql.Parse("price > 50.00 and quantity <= 10")
	if err != nil {
		panic(err)
	}

	columns := map[string]*clickhouse.Column{
		"price":    clickhouse.NewColumn(clickhouse.ColumnDef{Name: "price", Type: "Float64"}),
		"quantity": clickhouse.NewColumn(clickhouse.ColumnDef{Name: "quantity", Type: "UInt32"}),
	}

	sql, err := clickhouse.ToSQLWhere(result.Root, columns)
	if err != nil {
		panic(err)
	}
	fmt.Println(sql)
}
