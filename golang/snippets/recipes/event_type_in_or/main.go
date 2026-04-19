// Filter records where event_type is either 'login' or 'logout'.
//
// FlyQL query: event_type = 'login' or event_type = 'logout'
//
// Text values like 'login' MUST be quoted; without quotes, FlyQL would treat
// `login` as a column reference. See syntax/values for details.
package main

import (
	"fmt"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/generators/clickhouse"
)

func main() {
	result, err := flyql.Parse("event_type = 'login' or event_type = 'logout'")
	if err != nil {
		panic(err)
	}

	columns := map[string]*clickhouse.Column{
		"event_type": clickhouse.NewColumn(clickhouse.ColumnDef{Name: "event_type", Type: "String"}),
	}

	sql, err := clickhouse.ToSQLWhere(result.Root, columns)
	if err != nil {
		panic(err)
	}
	fmt.Println(sql)
}
