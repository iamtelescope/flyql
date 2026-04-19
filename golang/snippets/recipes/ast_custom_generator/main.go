// Walk the FlyQL AST and emit an Elasticsearch Query DSL object.
//
// FlyQL query: status = 200 and env in ['prod', 'staging']
//
// Demonstrates a non-SQL custom generator: same AST, different target.
// See advanced/ast for the full custom-generator walkthrough.
package main

import (
	"encoding/json"
	"fmt"

	flyql "github.com/iamtelescope/flyql/golang"
)

func generateES(node *flyql.Node) map[string]any {
	if node == nil {
		return map[string]any{"match_all": map[string]any{}}
	}

	var result map[string]any
	if node.Expression != nil {
		result = expressionToES(node.Expression)
	} else {
		left := generateES(node.Left)
		right := generateES(node.Right)
		if node.BoolOperator == flyql.BoolOpAnd {
			result = map[string]any{"bool": map[string]any{"must": []any{left, right}}}
		} else {
			result = map[string]any{
				"bool": map[string]any{"should": []any{left, right}, "minimum_should_match": 1},
			}
		}
	}

	if node.Negated {
		result = map[string]any{"bool": map[string]any{"must_not": []any{result}}}
	}
	return result
}

func expressionToES(expr *flyql.Expression) map[string]any {
	field := expr.Key.Raw
	switch expr.Operator {
	case flyql.OpEquals:
		return map[string]any{"term": map[string]any{field: expr.Value}}
	case flyql.OpIn:
		return map[string]any{"terms": map[string]any{field: expr.Values}}
	case flyql.OpGreater:
		return map[string]any{"range": map[string]any{field: map[string]any{"gt": expr.Value}}}
	case flyql.OpTruthy:
		return map[string]any{"exists": map[string]any{"field": field}}
	default:
		panic(fmt.Sprintf("unsupported operator: %s", expr.Operator))
	}
}

func main() {
	result, err := flyql.Parse("status = 200 and env in ['prod', 'staging']")
	if err != nil {
		panic(err)
	}
	esQuery := generateES(result.Root)
	data, _ := json.MarshalIndent(esQuery, "", "  ")
	fmt.Println(string(data))
}
