package matcher

import (
	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/transformers"
)

func Match(query string, data map[string]any, registry ...*transformers.TransformerRegistry) (bool, error) {
	result, err := flyql.Parse(query)
	if err != nil {
		return false, err
	}

	var reg *transformers.TransformerRegistry
	if len(registry) > 0 && registry[0] != nil {
		reg = registry[0]
	}
	evaluator := NewEvaluatorWithRegistry(reg)
	record := NewRecord(data)

	return evaluator.Evaluate(result.Root, record), nil
}
