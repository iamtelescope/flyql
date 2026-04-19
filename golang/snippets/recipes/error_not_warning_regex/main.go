// Filter messages that match (case-insensitive) 'error' but not 'warning'.
//
// FlyQL query: message ~ "(?i)error" and message !~ "(?i)warning"
//
// The `~` operator is regex match; `!~` is regex non-match. The `(?i)` inline
// flag enables case-insensitive matching.
package main

import (
	"fmt"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/generators/clickhouse"
)

func main() {
	result, err := flyql.Parse(`message ~ "(?i)error" and message !~ "(?i)warning"`)
	if err != nil {
		panic(err)
	}

	columns := map[string]*clickhouse.Column{
		"message": clickhouse.NewColumn(clickhouse.ColumnDef{Name: "message", Type: "String"}),
	}

	sql, err := clickhouse.ToSQLWhere(result.Root, columns)
	if err != nil {
		panic(err)
	}
	fmt.Println(sql)
}
