// Filter accounts that are enabled, not suspended, and have a last_login set.
//
// FlyQL query: enabled and not suspended and last_login
//
// All three terms use truthy/falsy semantics: a bare key (no operator, no
// value) means "this field is truthy". `not suspended` flips the truthy check
// into a falsy check.
package main

import (
	"fmt"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/generators/clickhouse"
)

func main() {
	result, err := flyql.Parse("enabled and not suspended and last_login")
	if err != nil {
		panic(err)
	}

	columns := map[string]*clickhouse.Column{
		"enabled":    clickhouse.NewColumn(clickhouse.ColumnDef{Name: "enabled", Type: "Bool"}),
		"suspended":  clickhouse.NewColumn(clickhouse.ColumnDef{Name: "suspended", Type: "Bool"}),
		"last_login": clickhouse.NewColumn(clickhouse.ColumnDef{Name: "last_login", Type: "DateTime"}),
	}

	sql, err := clickhouse.ToSQLWhere(result.Root, columns)
	if err != nil {
		panic(err)
	}
	fmt.Println(sql)
}
