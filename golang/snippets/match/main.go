package main

import (
	"fmt"
	"github.com/iamtelescope/flyql/golang/matcher"
)

func main() {
	data := map[string]any{
		"status": 200,
		"active": true,
		"host":   "prod-api-01",
	}

	matches, err := matcher.Match("status = 200 and active", data)
	if err != nil {
		panic(err)
	}
	fmt.Printf("Matches: %v\n", matches) // true
}
