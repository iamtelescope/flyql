package flyql

import (
	"fmt"
	"strings"

	"github.com/iamtelescope/flyql/golang/transformers"
)

// DiagnosticSeverity is the severity level of a diagnostic.
type DiagnosticSeverity string

const (
	SeverityError   DiagnosticSeverity = "error"
	SeverityWarning DiagnosticSeverity = "warning"
)

// Diagnostic codes.
const (
	CodeUnknownColumn      = "unknown_column"
	CodeUnknownTransformer = "unknown_transformer"
	CodeArgCount           = "arg_count"
	CodeArgType            = "arg_type"
	CodeChainType          = "chain_type"
	CodeInvalidAST         = "invalid_ast"
)

// Diagnostic is a positioned diagnostic produced by Diagnose.
//
// Range semantics per code (highlight the smallest span the user must edit):
//
//	unknown_column       -> key.SegmentRanges[0]
//	unknown_transformer  -> transformer.NameRange
//	arg_count            -> transformer.Range (full name(args...) span)
//	arg_type             -> transformer.ArgumentRanges[j]
//	chain_type           -> transformer.NameRange
//	invalid_ast          -> Range{0, 0}
type Diagnostic struct {
	Range    Range
	Message  string
	Severity DiagnosticSeverity
	Code     string
}

// Diagnose walks a parser-produced AST and returns positioned diagnostics
// based on the supplied column definitions and transformer registry. If
// registry is nil, the default registry is used.
func Diagnose(ast *Node, columns []Column, registry *transformers.TransformerRegistry) []Diagnostic {
	if ast == nil {
		return nil
	}
	if registry == nil {
		registry = transformers.DefaultRegistry()
	}
	byName := make(map[string]Column)
	// reversed iteration for first-wins on duplicates
	for i := len(columns) - 1; i >= 0; i-- {
		byName[strings.ToLower(columns[i].MatchName)] = columns[i]
	}
	return walk(ast, byName, registry)
}

func walk(node *Node, byName map[string]Column, registry *transformers.TransformerRegistry) []Diagnostic {
	if node.Expression != nil {
		return diagnoseExpression(node.Expression, byName, registry)
	}
	var diags []Diagnostic
	if node.Left != nil {
		diags = append(diags, walk(node.Left, byName, registry)...)
	}
	if node.Right != nil {
		diags = append(diags, walk(node.Right, byName, registry)...)
	}
	return diags
}

func diagnoseExpression(expr *Expression, byName map[string]Column, registry *transformers.TransformerRegistry) []Diagnostic {
	var diags []Diagnostic

	// F15 guard: missing source ranges
	if len(expr.Key.Segments) == 0 || len(expr.Key.SegmentRanges) == 0 {
		diags = append(diags, Diagnostic{
			Range:    Range{Start: 0, End: 0},
			Code:     CodeInvalidAST,
			Severity: SeverityError,
			Message:  "AST missing source ranges — diagnose() requires a parser-produced AST",
		})
		return diags
	}

	baseName := expr.Key.Segments[0]
	col, found := byName[strings.ToLower(baseName)]

	var prevOutputType transformers.TransformerType
	var hasPrevType bool

	if !found {
		diags = append(diags, Diagnostic{
			Range:    expr.Key.SegmentRanges[0],
			Code:     CodeUnknownColumn,
			Severity: SeverityError,
			Message:  fmt.Sprintf("column '%s' is not defined", baseName),
		})
		hasPrevType = false
	} else {
		prevOutputType, hasPrevType = NormalizedToTransformerType(col.NormalizedType)
	}

	for _, tr := range expr.Key.Transformers {
		t := registry.Get(tr.Name)
		if t == nil {
			diags = append(diags, Diagnostic{
				Range:    tr.NameRange,
				Code:     CodeUnknownTransformer,
				Severity: SeverityError,
				Message:  fmt.Sprintf("unknown transformer: '%s'", tr.Name),
			})
			hasPrevType = false
			continue
		}

		schema := t.ArgSchema()
		requiredCount := 0
		for _, s := range schema {
			if s.Required {
				requiredCount++
			}
		}
		maxCount := len(schema)
		got := len(tr.Arguments)
		if got < requiredCount || got > maxCount {
			var expectStr string
			if requiredCount == maxCount {
				expectStr = fmt.Sprintf("%d arguments", requiredCount)
			} else {
				expectStr = fmt.Sprintf("%d..%d arguments", requiredCount, maxCount)
			}
			diags = append(diags, Diagnostic{
				Range:    tr.Range,
				Code:     CodeArgCount,
				Severity: SeverityError,
				Message:  fmt.Sprintf("%s expects %s, got %d", tr.Name, expectStr, got),
			})
		}

		// Per-argument type check
		for j := 0; j < len(tr.Arguments) && j < len(schema); j++ {
			expected := schema[j].Type
			actual, ok := goToTransformerType(tr.Arguments[j])
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
			if j < len(tr.ArgumentRanges) {
				diags = append(diags, Diagnostic{
					Range:    tr.ArgumentRanges[j],
					Code:     CodeArgType,
					Severity: SeverityError,
					Message:  fmt.Sprintf("argument %d of %s: expected %s, got %s", j+1, tr.Name, expected, actual),
				})
			}
		}

		// Chain type check
		if hasPrevType && prevOutputType != t.InputType() {
			diags = append(diags, Diagnostic{
				Range:    tr.NameRange,
				Code:     CodeChainType,
				Severity: SeverityError,
				Message:  fmt.Sprintf("%s expects %s input, got %s", tr.Name, t.InputType(), prevOutputType),
			})
		}

		// Cascade: always use this transformer's output_type
		prevOutputType = t.OutputType()
		hasPrevType = true
	}

	return diags
}

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
