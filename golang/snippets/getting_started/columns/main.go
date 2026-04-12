package main

import (
	"fmt"
	"github.com/iamtelescope/flyql/golang/columns"
)

func main() {
	// Parse basic columns (transformers disabled by default)
	parsed, err := columns.Parse("message, status", columns.Capabilities{})
	if err != nil {
		panic(err)
	}
	for _, col := range parsed {
		fmt.Printf("%s (display: %q, segments: %v)\n", col.Name, col.DisplayName, col.Segments)
	}

	// Enable transformers via capabilities
	caps := columns.Capabilities{Transformers: true}
	withTransforms, err := columns.Parse("message|chars(25) as msg, status", caps)
	if err != nil {
		panic(err)
	}
	fmt.Println(withTransforms[0].Transformers)

	// Or serialize directly to JSON for API responses
	jsonBytes, _ := columns.ParseToJSON("message, status|upper", caps)
	fmt.Println(string(jsonBytes))
}
