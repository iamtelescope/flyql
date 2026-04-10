package main

import (
	"fmt"
	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/generators/clickhouse"
)

func main() {
	// Parse a query with parameter placeholders
	result, err := flyql.Parse(`status = $code and env in [$env, 'staging']`)
	if err != nil {
		panic(err)
	}

	// Bind concrete values to the parameters
	if err := flyql.BindParams(result.Root, map[string]any{
		"code": 200,
		"env":  "prod",
	}); err != nil {
		panic(err)
	}

	// Generate SQL
	columns := map[string]*clickhouse.Column{
		"status": clickhouse.NewColumn(clickhouse.ColumnDef{Name: "status", Type: "Int32"}),
		"env":    clickhouse.NewColumn(clickhouse.ColumnDef{Name: "env", Type: "String"}),
	}

	sql, err := clickhouse.ToSQLWhere(result.Root, columns)
	if err != nil {
		panic(err)
	}
	fmt.Println(sql)
	// (status = 200 AND env IN ('prod', 'staging'))
}
