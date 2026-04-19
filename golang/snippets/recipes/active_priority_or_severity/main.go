// Filter active records that are either high priority or critical severity.
//
// FlyQL query: active and (priority = 'high' or severity = 'critical')
package main

import (
	"fmt"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/generators/clickhouse"
)

func main() {
	result, err := flyql.Parse("active and (priority = 'high' or severity = 'critical')")
	if err != nil {
		panic(err)
	}

	columns := map[string]*clickhouse.Column{
		"active":   clickhouse.NewColumn(clickhouse.ColumnDef{Name: "active", Type: "Bool"}),
		"priority": clickhouse.NewColumn(clickhouse.ColumnDef{Name: "priority", Type: "String"}),
		"severity": clickhouse.NewColumn(clickhouse.ColumnDef{Name: "severity", Type: "String"}),
	}

	sql, err := clickhouse.ToSQLWhere(result.Root, columns)
	if err != nil {
		panic(err)
	}
	fmt.Println(sql)
}
