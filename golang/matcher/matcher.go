package matcher

import (
	flyql "github.com/iamtelescope/flyql/golang"
)

func Match(query string, data map[string]any) (bool, error) {
	result, err := flyql.Parse(query)
	if err != nil {
		return false, err
	}

	evaluator := NewEvaluator()
	record := NewRecord(data)

	return evaluator.Evaluate(result.Root, record), nil
}
