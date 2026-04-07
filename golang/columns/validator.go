package columns

import (
	"fmt"
	"strings"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/transformers"
)

// goToTransformerType maps a Go value to its TransformerType.
func goToTransformerType(v any) (transformers.TransformerType, bool) {
	switch v.(type) {
	case bool:
		return transformers.TransformerTypeBool, true
	case int, int64, int32:
		return transformers.TransformerTypeInt, true
	case float64, float32:
		return transformers.TransformerTypeFloat, true
	case string:
		return transformers.TransformerTypeString, true
	default:
		return "", false
	}
}

// Diagnose validates parsed columns against a column schema and transformer
// registry, returning positioned diagnostics.
func Diagnose(parsedColumns []ParsedColumn, columns []flyql.Column, registry *transformers.TransformerRegistry) []flyql.Diagnostic {
	if len(parsedColumns) == 0 {
		return nil
	}
	if registry == nil {
		registry = transformers.DefaultRegistry()
	}

	byName := make(map[string]flyql.Column)
	for i := len(columns) - 1; i >= 0; i-- {
		byName[strings.ToLower(columns[i].MatchName)] = columns[i]
	}

	var diags []flyql.Diagnostic

	for _, col := range parsedColumns {
		baseName := col.Name
		if idx := strings.Index(baseName, "."); idx >= 0 {
			baseName = baseName[:idx]
		}

		matchedCol, found := byName[strings.ToLower(baseName)]

		var prevOutputType transformers.TransformerType
		var hasPrevType bool

		if !found {
			if col.NameRange.End > 0 {
				baseNameRange := flyql.Range{
					Start: col.NameRange.Start,
					End:   col.NameRange.Start + len(baseName),
				}
				diags = append(diags, flyql.Diagnostic{
					Range:    baseNameRange,
					Message:  fmt.Sprintf("column '%s' is not defined", baseName),
					Severity: flyql.SeverityError,
					Code:     flyql.CodeUnknownColumn,
				})
			}
			hasPrevType = false
		} else {
			prevOutputType, hasPrevType = flyql.NormalizedToTransformerType(matchedCol.NormalizedType)
		}

		for ti, transformer := range col.Transformers {
			var nameRange flyql.Range
			var argRanges []flyql.Range
			if ti < len(col.TransformerRanges) {
				nameRange = col.TransformerRanges[ti].NameRange
				argRanges = col.TransformerRanges[ti].ArgumentRanges
			}

			t := registry.Get(transformer.Name)
			if t == nil {
				if nameRange.End > 0 {
					diags = append(diags, flyql.Diagnostic{
						Range:    nameRange,
						Message:  fmt.Sprintf("unknown transformer: '%s'", transformer.Name),
						Severity: flyql.SeverityError,
						Code:     flyql.CodeUnknownTransformer,
					})
				}
				hasPrevType = false
				continue
			}

			// Arity check
			schema := t.ArgSchema()
			requiredCount := 0
			for _, s := range schema {
				if s.Required {
					requiredCount++
				}
			}
			maxCount := len(schema)
			got := len(transformer.Arguments)
			if got < requiredCount || got > maxCount {
				var expectStr string
				if requiredCount == maxCount {
					expectStr = fmt.Sprintf("%d arguments", requiredCount)
				} else {
					expectStr = fmt.Sprintf("%d..%d arguments", requiredCount, maxCount)
				}
				fullRange := nameRange
				if len(argRanges) > 0 {
					fullRange = flyql.Range{Start: nameRange.Start, End: argRanges[len(argRanges)-1].End + 1}
				}
				diags = append(diags, flyql.Diagnostic{
					Range:    fullRange,
					Message:  fmt.Sprintf("%s expects %s, got %d", transformer.Name, expectStr, got),
					Severity: flyql.SeverityError,
					Code:     flyql.CodeArgCount,
				})
			}

			// Per-argument type check
			for j := 0; j < len(transformer.Arguments) && j < len(schema); j++ {
				expected := schema[j].Type
				actual, ok := goToTransformerType(transformer.Arguments[j])
				if !ok {
					continue
				}
				if actual == expected {
					continue
				}
				// int widens to float
				if actual == transformers.TransformerTypeInt && expected == transformers.TransformerTypeFloat {
					continue
				}
				if j < len(argRanges) {
					diags = append(diags, flyql.Diagnostic{
						Range:    argRanges[j],
						Message:  fmt.Sprintf("argument %d of %s: expected %s, got %s", j+1, transformer.Name, expected, actual),
						Severity: flyql.SeverityError,
						Code:     flyql.CodeArgType,
					})
				}
			}

			// Chain type check
			if hasPrevType && prevOutputType != t.InputType() {
				diags = append(diags, flyql.Diagnostic{
					Range:    nameRange,
					Message:  fmt.Sprintf("%s expects %s input, got %s", transformer.Name, t.InputType(), prevOutputType),
					Severity: flyql.SeverityError,
					Code:     flyql.CodeChainType,
				})
			}

			prevOutputType = t.OutputType()
			hasPrevType = true
		}
	}

	return diags
}
