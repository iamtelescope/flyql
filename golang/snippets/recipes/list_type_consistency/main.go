// Demonstrate IN-list type validation across three cases.
//
// FlyQL parsers always accept heterogeneous lists. SQL generators run a
// type-consistency check ONLY when (a) the column has a declared type, (b) the
// key is not segmented, and (c) the list is homogeneous. Heterogeneous lists
// bypass the check at the call site and pass through.
//
// Three demonstrated cases:
//
//	(a) Homogeneous list matching column type — SQL is generated.
//	(b) Heterogeneous list against a typed column — SQL is generated (validator
//	    is skipped because the values_types set has more than one entry).
//	(c) Homogeneous list with the wrong element type — error is returned with
//	    the canonical message "type mismatch in IN list: ...".
package main

import (
	"fmt"
	"strings"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/generators/clickhouse"
)

func mustGenerate(query string, columns map[string]*clickhouse.Column) string {
	result, err := flyql.Parse(query)
	if err != nil {
		panic(err)
	}
	sql, err := clickhouse.ToSQLWhere(result.Root, columns)
	if err != nil {
		panic(err)
	}
	return sql
}

func main() {
	columns := map[string]*clickhouse.Column{
		"category": clickhouse.NewColumn(clickhouse.ColumnDef{Name: "category", Type: "String"}),
		"status":   clickhouse.NewColumn(clickhouse.ColumnDef{Name: "status", Type: "UInt32"}),
	}

	// (a) Homogeneous list matching column type — SQL is generated.
	fmt.Println("(a)", mustGenerate("category in ['electronics', 'appliances']", columns))

	// (b) Heterogeneous list — validator is skipped, SQL is generated.
	fmt.Println("(b)", mustGenerate("status in [200, 'ok', 404]", columns))

	// (c) Homogeneous wrong-type list — error is returned.
	resultC, err := flyql.Parse("status in ['ok', 'fail']")
	if err != nil {
		panic(err)
	}
	if _, err := clickhouse.ToSQLWhere(resultC.Root, columns); err != nil {
		if strings.Contains(err.Error(), "type mismatch in IN list:") {
			fmt.Println("(c)", err.Error())
		} else {
			panic(err)
		}
	}
}
