package columns

import (
	"fmt"
	"strings"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/flyqltype"
	"github.com/iamtelescope/flyql/golang/transformers"
)

// makeDiagRenderer constructs a flyql.Diagnostic for a renderer-category
// code. Looks up the local rendererValidatorRegistry (renderer codes live
// in package columns, not in package flyql.validatorRegistry), converts
// the package-local columns.ErrorEntry to flyql.ErrorEntry by field copy,
// and returns the Diagnostic. On miss returns Diagnostic with zero-value
// Entry — no panic.
func makeDiagRenderer(rng flyql.Range, code string, severity flyql.DiagnosticSeverity, message string) flyql.Diagnostic {
	src := rendererValidatorRegistry[code] // zero-value if not present
	return flyql.Diagnostic{
		Range:    rng,
		Code:     code,
		Severity: severity,
		Message:  message,
		Entry: flyql.ErrorEntry{
			Code:           src.Code,
			Name:           src.Name,
			Message:        src.Message,
			Description:    src.Description,
			DynamicMessage: src.DynamicMessage,
		},
	}
}

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

// DiagnoseOptions groups registries for DiagnoseWithOptions. Both fields
// are optional; nil values are resolved to their respective default
// registries (transformers ships built-ins, renderers is empty by design).
type DiagnoseOptions struct {
	TransformerRegistry *transformers.TransformerRegistry
	RendererRegistry    *RendererRegistry
}

// Diagnose validates parsed columns against a column schema and transformer
// registry, returning positioned diagnostics. This is a thin wrapper over
// DiagnoseWithOptions preserved for backward compatibility.
func Diagnose(parsedColumns []ParsedColumn, schema *flyql.ColumnSchema, registry *transformers.TransformerRegistry) []flyql.Diagnostic {
	return DiagnoseWithOptions(parsedColumns, schema, DiagnoseOptions{TransformerRegistry: registry})
}

// DiagnoseWithOptions validates parsed columns against schema + registries
// and returns positioned diagnostics. It is the primary validator entry
// point for callers that need to pass both transformer and renderer
// registries.
func DiagnoseWithOptions(parsedColumns []ParsedColumn, schema *flyql.ColumnSchema, opts DiagnoseOptions) []flyql.Diagnostic {
	if len(parsedColumns) == 0 {
		return nil
	}
	registry := opts.TransformerRegistry
	if registry == nil {
		registry = transformers.DefaultRegistry()
	}
	rendererRegistry := opts.RendererRegistry
	if rendererRegistry == nil {
		rendererRegistry = DefaultRendererRegistry()
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
				diags = append(diags, flyql.MakeDiag(failRange, flyql.CodeUnknownColumn, flyql.SeverityError, fmt.Sprintf("column '%s' is not defined", failSegment)))
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
					diags = append(diags, flyql.MakeDiag(nameRange, flyql.CodeUnknownTransformer, flyql.SeverityError, fmt.Sprintf("unknown transformer: '%s'", transformer.Name)))
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
				diags = append(diags, flyql.MakeDiag(fullRange, flyql.CodeArgCount, flyql.SeverityError, fmt.Sprintf("%s expects %s, got %d", transformer.Name, expectStr, got)))
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
					diags = append(diags, flyql.MakeDiag(argRanges[j], flyql.CodeArgType, flyql.SeverityError, fmt.Sprintf("argument %d of %s: expected %s, got %s", j+1, transformer.Name, expected, actual)))
				}
			}

			// Chain type check
			if hasPrevType && prevOutputType != t.InputType() {
				diags = append(diags, flyql.MakeDiag(nameRange, flyql.CodeChainType, flyql.SeverityError, fmt.Sprintf("%s expects %s input, got %s", transformer.Name, t.InputType(), prevOutputType)))
			}

			prevOutputType = t.OutputType()
			hasPrevType = true
		}

		for ri, renderer := range col.Renderers {
			var nameRange flyql.Range
			var argRanges []flyql.Range
			if ri < len(col.RendererRanges) {
				nameRange = col.RendererRanges[ri].NameRange
				argRanges = col.RendererRanges[ri].ArgumentRanges
			}

			r := rendererRegistry.Get(renderer.Name)
			if r == nil {
				if nameRange.End > 0 {
					diags = append(diags, makeDiagRenderer(nameRange, CodeUnknownRenderer, flyql.SeverityError, fmt.Sprintf("unknown renderer: '%s'", renderer.Name)))
				}
				continue
			}

			rSchema := r.ArgSchema()
			requiredCount := 0
			for _, s := range rSchema {
				if s.Required {
					requiredCount++
				}
			}
			maxCount := len(rSchema)
			got := len(renderer.Arguments)
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
				diags = append(diags, makeDiagRenderer(fullRange, CodeRendererArgCount, flyql.SeverityError, fmt.Sprintf("%s expects %s, got %d", renderer.Name, expectStr, got)))
			}

			for j := 0; j < len(renderer.Arguments) && j < len(rSchema); j++ {
				expected := rSchema[j].Type
				actual, ok := goToFlyQLType(renderer.Arguments[j])
				if !ok {
					continue
				}
				if actual == expected {
					continue
				}
				if actual == flyqltype.Int && expected == flyqltype.Float {
					continue
				}
				if j < len(argRanges) {
					diags = append(diags, makeDiagRenderer(argRanges[j], CodeRendererArgType, flyql.SeverityError, fmt.Sprintf("argument %d of %s: expected %s, got %s", j+1, renderer.Name, expected, actual)))
				}
			}

			if hookDiags := r.Diagnose(renderer.Arguments, col); len(hookDiags) > 0 {
				diags = append(diags, hookDiags...)
			}
		}

		if hook := rendererRegistry.GetDiagnose(); hook != nil && len(col.Renderers) > 0 {
			if chainDiags := hook(col, col.Renderers); len(chainDiags) > 0 {
				diags = append(diags, chainDiags...)
			}
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
