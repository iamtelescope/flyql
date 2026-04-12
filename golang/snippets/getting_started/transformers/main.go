package main

import (
	"fmt"
	flyql "github.com/iamtelescope/flyql/golang"
	clickhousegen "github.com/iamtelescope/flyql/golang/generators/clickhouse"
)

func main() {
	result, _ := flyql.Parse("message|upper = 'ERROR'")
	columns := map[string]*clickhousegen.Column{
		"message": clickhousegen.NewColumn(clickhousegen.ColumnDef{Name: "message", Type: "String"}),
	}
	sql, _ := clickhousegen.ToSQLWhere(result.Root, columns)
	fmt.Println(sql) // equals(upper(message), 'ERROR')
}
