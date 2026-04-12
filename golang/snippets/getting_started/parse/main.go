package main

import (
	"fmt"
	flyql "github.com/iamtelescope/flyql/golang"
)

func main() {
	result, err := flyql.Parse("status = 200 and active")
	if err != nil {
		panic(err)
	}
	fmt.Printf("Parsed: %+v\n", result.Root)
}
