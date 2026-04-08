package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"os"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/generators/clickhouse"
	"github.com/iamtelescope/flyql/golang/matcher"
)

func main() {
	query := flag.String("query", "", "FlyQL query string (e.g., 'status=200 and active')")
	fields := flag.String("fields", "{}", "JSON object with field definitions")
	generate := flag.String("generate", "", "Generate code for target (supported: clickhouse)")
	evaluate := flag.Bool("evaluate", false, "Evaluate query against JSON lines from stdin")
	parse := flag.Bool("parse", false, "Parse query and output AST as JSON")

	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "FlyQL CLI - Query language for filtering and generating SQL\n\n")
		fmt.Fprintf(os.Stderr, "Usage:\n")
		fmt.Fprintf(os.Stderr, "  flyqlcli [options]\n\n")
		fmt.Fprintf(os.Stderr, "Options:\n")
		flag.PrintDefaults()
		fmt.Fprintf(os.Stderr, "\nExamples:\n")
		fmt.Fprintf(os.Stderr, "  # Generate ClickHouse SQL\n")
		fmt.Fprintf(os.Stderr, "  flyqlcli --query 'status=200' --fields '{\"status\": {\"type\": \"Int32\"}}' --generate clickhouse\n\n")
		fmt.Fprintf(os.Stderr, "  # Evaluate query against JSON lines\n")
		fmt.Fprintf(os.Stderr, "  echo '{\"status\": 200}' | flyqlcli --query 'status=200' --evaluate\n\n")
		fmt.Fprintf(os.Stderr, "  # Parse and show AST\n")
		fmt.Fprintf(os.Stderr, "  flyqlcli --query 'status=200 or error' --parse\n")
	}

	flag.Parse()

	if *query == "" {
		fmt.Fprintln(os.Stderr, "Error: --query is required")
		flag.Usage()
		os.Exit(1)
	}

	// Count actions
	actions := 0
	if *generate != "" {
		actions++
	}
	if *evaluate {
		actions++
	}
	if *parse {
		actions++
	}

	if actions == 0 {
		fmt.Fprintln(os.Stderr, "Error: Specify one of --generate, --evaluate, or --parse")
		os.Exit(1)
	}
	if actions > 1 {
		fmt.Fprintln(os.Stderr, "Error: --generate, --evaluate, and --parse are mutually exclusive")
		os.Exit(1)
	}

	if *parse {
		cmdParse(*query)
	} else if *generate != "" {
		cmdGenerate(*query, *fields, *generate)
	} else if *evaluate {
		cmdEvaluate(*query)
	}
}

func cmdParse(query string) {
	parser := flyql.NewParser()
	if err := parser.Parse(query); err != nil {
		fmt.Fprintf(os.Stderr, "Parse error: %v\n", err)
		os.Exit(1)
	}

	ast := nodeToMap(parser.Root)
	output, err := json.MarshalIndent(ast, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "JSON encoding error: %v\n", err)
		os.Exit(1)
	}
	fmt.Println(string(output))
}

func nodeToMap(node *flyql.Node) map[string]any {
	if node == nil {
		return nil
	}

	result := make(map[string]any)

	if node.Expression != nil {
		expr := node.Expression
		exprMap := map[string]any{
			"key":      expr.Key.Raw,
			"operator": expr.Operator,
		}

		if expr.Operator == flyql.OpIn || expr.Operator == flyql.OpNotIn {
			exprMap["values"] = expr.Values
			if expr.ValuesType != nil {
				exprMap["values_type"] = *expr.ValuesType
			}
		} else if expr.Operator != flyql.OpTruthy {
			exprMap["value"] = expr.Value
			exprMap["value_type"] = string(expr.ValueType)
		}
		result["expression"] = exprMap
	}

	if node.BoolOperator != "" {
		result["bool_operator"] = node.BoolOperator
	}

	if node.Negated {
		result["negated"] = true
	}

	if node.Left != nil {
		result["left"] = nodeToMap(node.Left)
	}

	if node.Right != nil {
		result["right"] = nodeToMap(node.Right)
	}

	return result
}

func cmdGenerate(query, fieldsJSON, generator string) {
	if generator != "clickhouse" {
		fmt.Fprintf(os.Stderr, "Error: Unknown generator '%s'. Supported: clickhouse\n", generator)
		os.Exit(1)
	}

	parser := flyql.NewParser()
	if err := parser.Parse(query); err != nil {
		fmt.Fprintf(os.Stderr, "Parse error: %v\n", err)
		os.Exit(1)
	}

	fields, err := parseFields(fieldsJSON)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error parsing fields: %v\n", err)
		os.Exit(1)
	}

	sql, err := clickhouse.ToSQLWhere(parser.Root, fields)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Generator error: %v\n", err)
		os.Exit(1)
	}

	fmt.Println(sql)
}

func parseFields(fieldsJSON string) (map[string]*clickhouse.Column, error) {
	var fieldsData map[string]struct {
		Type       string   `json:"type"`
		JSONString bool     `json:"jsonstring"`
		Values     []string `json:"values"`
	}

	if err := json.Unmarshal([]byte(fieldsJSON), &fieldsData); err != nil {
		return nil, fmt.Errorf("invalid fields JSON: %w", err)
	}

	fields := make(map[string]*clickhouse.Column)
	for name, config := range fieldsData {
		fieldType := config.Type
		if fieldType == "" {
			fieldType = "String"
		}
		fields[name] = clickhouse.NewColumn(clickhouse.ColumnDef{
			Name:       name,
			JSONString: config.JSONString,
			Type:       fieldType,
			Values:     config.Values,
		})
	}

	return fields, nil
}

func cmdEvaluate(query string) {
	parser := flyql.NewParser()
	if err := parser.Parse(query); err != nil {
		fmt.Fprintf(os.Stderr, "Parse error: %v\n", err)
		os.Exit(1)
	}

	evaluator := matcher.NewEvaluator()
	scanner := bufio.NewScanner(os.Stdin)

	lineNum := 0
	for scanner.Scan() {
		lineNum++
		line := scanner.Text()
		if line == "" {
			continue
		}

		var data map[string]any
		if err := json.Unmarshal([]byte(line), &data); err != nil {
			fmt.Fprintf(os.Stderr, "Warning: Invalid JSON on line %d: %v\n", lineNum, err)
			continue
		}

		record := matcher.NewRecord(data)
		if evaluator.Evaluate(parser.Root, record) {
			fmt.Println(line)
		}
	}

	if err := scanner.Err(); err != nil {
		fmt.Fprintf(os.Stderr, "Error reading stdin: %v\n", err)
		os.Exit(1)
	}
}
