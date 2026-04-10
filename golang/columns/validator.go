package columns

import (
	"fmt"
	"strings"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/flyqltype"
	"github.com/iamtelescope/flyql/golang/transformers"
)

// goToFlyQLType maps a Go runtime value to its flyql.Type.
func goToFlyQLType(v any) (flyqltype.Type, bool) {
	switch v.(type) {
	case bool:
		return flyqltype.Bool, true
	case int, int64, int32:
		return flyqltype.Int, true
	case float64, float32:
		return flyqltype.Float, true
	case string:
		return flyqltype.String, true
	default:
		return "", false
	}
}

// Diagnose validates parsed columns against a column schema and transformer
// registry, returning positioned diagnostics.
func Diagnose(parsedColumns []ParsedColumn, schema *flyql.ColumnSchema, registry *transformers.TransformerRegistry) []flyql.Diagnostic {
	if len(parsedColumns) == 0 {
		return nil
	}
	if registry == nil {
		registry = transformers.DefaultRegistry()
	}

	var diags []flyql.Diagnostic

	for _, col := range parsedColumns {
		// Strip empty trailing segment from trailing dot (user still typing)
		segments := col.Segments
		if len(segments) > 0 && segments[len(segments)-1] == "" {
			segments = segments[:len(segments)-1]
		}
		if len(segments) == 0 {
			continue
		}
		resolved := schema.Resolve(segments)

		var prevOutputType flyqltype.Type
		var hasPrevType bool

		if resolved == nil {
			// Find the first unresolvable segment for precise error reporting
			if col.NameRange.End > 0 {
				failSegment, failRange := findFailingSegment(col, schema, segments)
				diags = append(diags, flyql.Diagnostic{
					Range:    failRange,
					Message:  fmt.Sprintf("column '%s' is not defined", failSegment),
					Severity: flyql.SeverityError,
					Code:     flyql.CodeUnknownColumn,
				})
			}
			hasPrevType = false
		} else {
			prevOutputType = resolved.Type
			hasPrevType = resolved.Type != "" && resolved.Type != flyql.TypeUnknown
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
				actual, ok := goToFlyQLType(transformer.Arguments[j])
				if !ok {
					continue
				}
				if actual == expected {
					continue
				}
				// int widens to float
				if actual == flyqltype.Int && expected == flyqltype.Float {
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

// findFailingSegment identifies the first unresolvable segment in a parsed column
// and returns the segment name and its source range.
func findFailingSegment(col ParsedColumn, schema *flyql.ColumnSchema, segments []string) (string, flyql.Range) {
	var current *flyql.Column
	for i, seg := range segments {
		if i == 0 {
			current = schema.Get(seg)
		} else if current != nil && current.Children != nil {
			current = current.Children[strings.ToLower(seg)]
		} else {
			current = nil
		}
		if current == nil {
			offset := col.NameRange.Start
			for j := 0; j < i; j++ {
				offset += len(segments[j]) + 1 // +1 for dot separator
			}
			return seg, flyql.Range{
				Start: offset,
				End:   offset + len(seg),
			}
		}
	}
	return segments[0], flyql.Range{
		Start: col.NameRange.Start,
		End:   col.NameRange.Start + len(segments[0]),
	}
}
