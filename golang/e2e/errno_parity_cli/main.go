// errno_parity_cli parses a single flyql query via either the core or columns
// parser and prints its `{errno, error_text}` as JSON. Used by the e2e parity
// harness (e2e/runner.py --errno-parity) to compare Go's errno emission
// against Python and JS for the same input.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/columns"
)

type output struct {
	Errno     int    `json:"errno"`
	ErrorText string `json:"error_text"`
}

func main() {
	var (
		input        string
		category     string
		transformers bool
		renderers    bool
	)
	flag.StringVar(&input, "input", "", "flyql query to parse")
	flag.StringVar(&category, "category", "core", "parser category: core or columns")
	flag.BoolVar(&transformers, "transformers", false, "columns: enable transformers capability")
	flag.BoolVar(&renderers, "renderers", false, "columns: enable renderers capability")
	flag.Parse()

	var out output
	switch category {
	case "core":
		parser := flyql.NewParser()
		if err := parser.Parse(input); err != nil {
			if pe, ok := err.(*flyql.ParseError); ok {
				out = output{Errno: pe.Code, ErrorText: pe.Message}
			} else {
				fmt.Fprintf(os.Stderr, "unexpected error type: %T\n", err)
				os.Exit(2)
			}
		}
	case "columns":
		caps := columns.Capabilities{Transformers: transformers, Renderers: renderers}
		if _, err := columns.Parse(input, caps); err != nil {
			if pe, ok := err.(*columns.ParserError); ok {
				out = output{Errno: pe.Errno, ErrorText: pe.Message}
			} else {
				fmt.Fprintf(os.Stderr, "unexpected error type: %T\n", err)
				os.Exit(2)
			}
		}
	default:
		fmt.Fprintf(os.Stderr, "unknown --category %q (expected core|columns)\n", category)
		os.Exit(2)
	}

	enc := json.NewEncoder(os.Stdout)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(out); err != nil {
		fmt.Fprintf(os.Stderr, "encode error: %v\n", err)
		os.Exit(2)
	}
}
