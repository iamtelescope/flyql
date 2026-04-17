package flyql

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/iamtelescope/flyql/golang/flyqltype"
	"github.com/iamtelescope/flyql/golang/literal"
	"github.com/iamtelescope/flyql/golang/transformers"
)

var validColumnNameRE = regexp.MustCompile(`^[a-zA-Z0-9_.:/@|\-]+$`)

// DiagnosticSeverity is the severity level of a diagnostic.
type DiagnosticSeverity string

const (
	SeverityError   DiagnosticSeverity = "error"
	SeverityWarning DiagnosticSeverity = "warning"
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
// based on the supplied column schema and transformer registry. If
// registry is nil, the default registry is used.
func Diagnose(ast *Node, schema *ColumnSchema, registry *transformers.TransformerRegistry) []Diagnostic {
	if ast == nil {
		return nil
	}
	if registry == nil {
		registry = transformers.DefaultRegistry()
	}
	return walk(ast, schema, registry)
}

func walk(node *Node, schema *ColumnSchema, registry *transformers.TransformerRegistry) []Diagnostic {
	if node.Expression != nil {
		return diagnoseExpression(node.Expression, schema, registry)
	}
	var diags []Diagnostic
	if node.Left != nil {
		diags = append(diags, walk(node.Left, schema, registry)...)
	}
	if node.Right != nil {
		diags = append(diags, walk(node.Right, schema, registry)...)
	}
	return diags
}

func diagnoseExpression(expr *Expression, schema *ColumnSchema, registry *transformers.TransformerRegistry) []Diagnostic {
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

	var prevOutputType Type
	var hasPrevType bool

	// Nested traversal: walk all segments through schema
	col := schema.Get(expr.Key.Segments[0])
	if col == nil {
		diags = append(diags, Diagnostic{
			Range:    expr.Key.SegmentRanges[0],
			Code:     CodeUnknownColumn,
			Severity: SeverityError,
			Message:  fmt.Sprintf("column '%s' is not defined", expr.Key.Segments[0]),
		})
		hasPrevType = false
	} else {
		// Traverse remaining segments through children
		for i := 1; i < len(expr.Key.Segments); i++ {
			if expr.Key.Segments[i] == "" {
				break // trailing dot — user still typing
			}
			if col.Children == nil {
				diags = append(diags, Diagnostic{
					Range:    expr.Key.SegmentRanges[i],
					Code:     CodeUnknownColumn,
					Severity: SeverityError,
					Message:  fmt.Sprintf("column '%s' is not defined", expr.Key.Segments[i]),
				})
				col = nil
				break
			}
			child := col.Children[strings.ToLower(expr.Key.Segments[i])]
			if child == nil {
				diags = append(diags, Diagnostic{
					Range:    expr.Key.SegmentRanges[i],
					Code:     CodeUnknownColumn,
					Severity: SeverityError,
					Message:  fmt.Sprintf("column '%s' is not defined", expr.Key.Segments[i]),
				})
				col = nil
				break
			}
			col = child
		}
		if col != nil {
			prevOutputType = col.Type
			hasPrevType = col.Type != "" && col.Type != TypeUnknown
		}
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
			actual, ok := goToFlyQLType(tr.Arguments[j])
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

	// COLUMN value validation
	if expr.ValueType == literal.Column {
		if v, ok := expr.Value.(string); ok && v != "" {
			if !validColumnNameRE.MatchString(v) {
				if expr.ValueRange != nil {
					diags = append(diags, Diagnostic{
						Range:    *expr.ValueRange,
						Code:     CodeInvalidColumnValue,
						Severity: SeverityError,
						Message:  fmt.Sprintf("invalid character in column name '%s'", v),
					})
				}
			} else {
				colValSegments := strings.Split(v, ".")
				if schema.Resolve(colValSegments) == nil {
					if expr.ValueRange != nil {
						diags = append(diags, Diagnostic{
							Range:    *expr.ValueRange,
							Code:     CodeUnknownColumnValue,
							Severity: SeverityError,
							Message:  fmt.Sprintf("column '%s' is not defined", v),
						})
					}
				}
			}
		}
	}

	// IN-list COLUMN value validation
	for i, vt := range expr.ValuesTypes {
		if vt == literal.Column {
			if v, ok := expr.Values[i].(string); ok {
				if !validColumnNameRE.MatchString(v) {
					if i < len(expr.ValueRanges) {
						diags = append(diags, Diagnostic{
							Range:    expr.ValueRanges[i],
							Code:     CodeInvalidColumnValue,
							Severity: SeverityError,
							Message:  fmt.Sprintf("invalid character in column name '%s'", v),
						})
					}
				} else {
					colValSegments := strings.Split(v, ".")
					if schema.Resolve(colValSegments) == nil {
						if i < len(expr.ValueRanges) {
							diags = append(diags, Diagnostic{
								Range:    expr.ValueRanges[i],
								Code:     CodeUnknownColumnValue,
								Severity: SeverityError,
								Message:  fmt.Sprintf("column '%s' is not defined", v),
							})
						}
					}
				}
			}
		}
	}

	return diags
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
