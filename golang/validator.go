package flyql

import (
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/iamtelescope/flyql/golang/flyqltype"
	"github.com/iamtelescope/flyql/golang/literal"
	"github.com/iamtelescope/flyql/golang/transformers"
)

var validColumnNameRE = regexp.MustCompile(`^[a-zA-Z0-9_.:/@|\-]+$`)

// iso8601DateRE matches pure YYYY-MM-DD.
var iso8601DateRE = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// iso8601FullRE matches the lenient iso8601 family accepted by the matcher.
var iso8601FullRE = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$`)

// isValidISO8601 performs a shape AND calendar-validity check. A value
// that matches the shape regex but represents an impossible calendar
// date (e.g. "2026-13-45") is rejected — the matcher will reject it at
// coerce time, so the validator warns now.
func isValidISO8601(s string) bool {
	if s == "" {
		return false
	}
	if iso8601DateRE.MatchString(s) {
		_, err := time.Parse("2006-01-02", s)
		return err == nil
	}
	if iso8601FullRE.MatchString(s) {
		for _, layout := range []string{
			"2006-01-02T15:04:05.999999999Z07:00",
			"2006-01-02T15:04:05Z07:00",
			"2006-01-02T15:04:05.999999999",
			"2006-01-02T15:04:05",
			"2006-01-02 15:04:05.999999999Z07:00",
			"2006-01-02 15:04:05Z07:00",
			"2006-01-02 15:04:05.999999999",
			"2006-01-02 15:04:05",
		} {
			if _, err := time.Parse(layout, s); err == nil {
				return true
			}
		}
		return false
	}
	return false
}

type rangeKey struct {
	start int
	end   int
}

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
	// Entry is the registry entry corresponding to Code (zero-value
	// ErrorEntry{} when Code is not present in validatorRegistry — e.g.
	// user-supplied codes from renderer extension hooks).
	// Field is named Entry rather than Error to avoid conventional clash
	// with the Error() string method on Go error types.
	Entry ErrorEntry
}

// MakeDiag constructs a Diagnostic and populates Entry by looking up
// the validator registry. On miss, returns Diagnostic with zero-value
// Entry — no panic. Drift is caught at build-time by the parity test.
func MakeDiag(rng Range, code string, severity DiagnosticSeverity, message string) Diagnostic {
	entry := validatorRegistry[code] // zero-value if not present
	return Diagnostic{Range: rng, Code: code, Severity: severity, Message: message, Entry: entry}
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
		diags = append(diags, MakeDiag(Range{Start: 0, End: 0}, CodeInvalidAST, SeverityError, "AST missing source ranges — diagnose() requires a parser-produced AST"))
		return diags
	}

	var prevOutputType Type
	var hasPrevType bool

	// Nested traversal: walk all segments through schema
	col := schema.Get(expr.Key.Segments[0])
	if col == nil {
		diags = append(diags, MakeDiag(expr.Key.SegmentRanges[0], CodeUnknownColumn, SeverityError, fmt.Sprintf("column '%s' is not defined", expr.Key.Segments[0])))
		hasPrevType = false
	} else {
		// Traverse remaining segments through children
		for i := 1; i < len(expr.Key.Segments); i++ {
			if expr.Key.Segments[i] == "" {
				break // trailing dot — user still typing
			}
			if col.Children == nil {
				if flyqltype.TypePermitsUnknownChildren(col.Type) {
					col = nil
					break
				}
				diags = append(diags, MakeDiag(expr.Key.SegmentRanges[i], CodeUnknownColumn, SeverityError, fmt.Sprintf("column '%s' is not defined", expr.Key.Segments[i])))
				col = nil
				break
			}
			child := col.Children[strings.ToLower(expr.Key.Segments[i])]
			if child == nil {
				if flyqltype.TypePermitsUnknownChildren(col.Type) {
					col = nil
					break
				}
				diags = append(diags, MakeDiag(expr.Key.SegmentRanges[i], CodeUnknownColumn, SeverityError, fmt.Sprintf("column '%s' is not defined", expr.Key.Segments[i])))
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
			diags = append(diags, MakeDiag(tr.NameRange, CodeUnknownTransformer, SeverityError, fmt.Sprintf("unknown transformer: '%s'", tr.Name)))
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
			diags = append(diags, MakeDiag(tr.Range, CodeArgCount, SeverityError, fmt.Sprintf("%s expects %s, got %d", tr.Name, expectStr, got)))
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
				diags = append(diags, MakeDiag(tr.ArgumentRanges[j], CodeArgType, SeverityError, fmt.Sprintf("argument %d of %s: expected %s, got %s", j+1, tr.Name, expected, actual)))
			}
		}

		// Chain type check
		if hasPrevType && t.InputType() != flyqltype.Any && prevOutputType != t.InputType() {
			diags = append(diags, MakeDiag(tr.NameRange, CodeChainType, SeverityError, fmt.Sprintf("%s expects %s input, got %s", tr.Name, t.InputType(), prevOutputType)))
		}

		// Cascade: always use this transformer's output_type
		prevOutputType = t.OutputType()
		hasPrevType = true
	}

	// COLUMN value validation
	emittedRanges := make(map[rangeKey]struct{})
	if expr.ValueType == literal.Column {
		if v, ok := expr.Value.(string); ok && v != "" {
			if !validColumnNameRE.MatchString(v) {
				if expr.ValueRange != nil {
					diags = append(diags, MakeDiag(*expr.ValueRange, CodeInvalidColumnValue, SeverityError, fmt.Sprintf("invalid character in column name '%s'", v)))
					emittedRanges[rangeKey{expr.ValueRange.Start, expr.ValueRange.End}] = struct{}{}
				}
			} else {
				colValSegments := strings.Split(v, ".")
				resolved, parentPermissive := walkAndCheckPermissive(schema, colValSegments)
				if !resolved && !parentPermissive && expr.ValueRange != nil {
					diags = append(diags, MakeDiag(*expr.ValueRange, CodeUnknownColumnValue, SeverityError, fmt.Sprintf("column '%s' is not defined", v)))
					emittedRanges[rangeKey{expr.ValueRange.Start, expr.ValueRange.End}] = struct{}{}
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
						diags = append(diags, MakeDiag(expr.ValueRanges[i], CodeInvalidColumnValue, SeverityError, fmt.Sprintf("invalid character in column name '%s'", v)))
						emittedRanges[rangeKey{expr.ValueRanges[i].Start, expr.ValueRanges[i].End}] = struct{}{}
					}
				} else {
					colValSegments := strings.Split(v, ".")
					resolved, parentPermissive := walkAndCheckPermissive(schema, colValSegments)
					if !resolved && !parentPermissive && i < len(expr.ValueRanges) {
						diags = append(diags, MakeDiag(expr.ValueRanges[i], CodeUnknownColumnValue, SeverityError, fmt.Sprintf("column '%s' is not defined", v)))
						emittedRanges[rangeKey{expr.ValueRanges[i].Start, expr.ValueRanges[i].End}] = struct{}{}
					}
				}
			}
		}
	}

	// Decision 16: invalid_datetime_literal for Date/DateTime columns.
	// Precedence: suppress when another diagnostic already fired for the range.
	if col != nil && (col.Type == flyqltype.Date || col.Type == flyqltype.DateTime) {
		if expr.ValueType == literal.String {
			if v, ok := expr.Value.(string); ok && expr.ValueRange != nil {
				key := rangeKey{expr.ValueRange.Start, expr.ValueRange.End}
				if _, seen := emittedRanges[key]; !seen && !isValidISO8601(v) {
					diags = append(diags, MakeDiag(*expr.ValueRange, CodeInvalidDatetimeLiteral, SeverityWarning, fmt.Sprintf("invalid iso8601 datetime literal '%s' for %s column '%s'", v, col.Type, col.Name)))
					emittedRanges[key] = struct{}{}
				}
			}
		}
		for i, vt := range expr.ValuesTypes {
			if vt != literal.String {
				continue
			}
			if i >= len(expr.Values) || i >= len(expr.ValueRanges) {
				continue
			}
			v, ok := expr.Values[i].(string)
			if !ok {
				continue
			}
			r := expr.ValueRanges[i]
			key := rangeKey{r.Start, r.End}
			if _, seen := emittedRanges[key]; seen {
				continue
			}
			if !isValidISO8601(v) {
				diags = append(diags, MakeDiag(r, CodeInvalidDatetimeLiteral, SeverityWarning, fmt.Sprintf("invalid iso8601 datetime literal '%s' for %s column '%s'", v, col.Type, col.Name)))
				emittedRanges[key] = struct{}{}
			}
		}
	}

	return diags
}

// walkAndCheckPermissive walks a dotted path against the schema and
// reports (resolved, parentPermissive). On failure mid-walk,
// parentPermissive is true iff the deepest resolved parent is a
// JSON-family type — callers use this to suppress unknown-column-value
// diagnostics for paths under semantically dynamic parents.
func walkAndCheckPermissive(schema *ColumnSchema, segments []string) (bool, bool) {
	if len(segments) == 0 {
		return false, false
	}
	col := schema.Get(segments[0])
	if col == nil {
		return false, false
	}
	for i := 1; i < len(segments); i++ {
		if col.Children == nil {
			return false, flyqltype.TypePermitsUnknownChildren(col.Type)
		}
		child := col.Children[strings.ToLower(segments[i])]
		if child == nil {
			return false, flyqltype.TypePermitsUnknownChildren(col.Type)
		}
		col = child
	}
	return true, false
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
