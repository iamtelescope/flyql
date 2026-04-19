// Filter products that are in stock, in selected categories, with high rating.
//
// FlyQL query:
//
//	in_stock and category in ['electronics', 'appliances'] and rating > 4.5
//
// Combines truthy (in_stock), list membership (in [...]), and a numeric
// comparison in a single query.
package main

import (
	"fmt"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/generators/clickhouse"
)

func main() {
	result, err := flyql.Parse(
		"in_stock and category in ['electronics', 'appliances'] and rating > 4.5",
	)
	if err != nil {
		panic(err)
	}

	columns := map[string]*clickhouse.Column{
		"in_stock": clickhouse.NewColumn(clickhouse.ColumnDef{Name: "in_stock", Type: "Bool"}),
		"category": clickhouse.NewColumn(clickhouse.ColumnDef{Name: "category", Type: "String"}),
		"rating":   clickhouse.NewColumn(clickhouse.ColumnDef{Name: "rating", Type: "Float64"}),
	}

	sql, err := clickhouse.ToSQLWhere(result.Root, columns)
	if err != nil {
		panic(err)
	}
	fmt.Println(sql)
}
