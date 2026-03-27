package matcher

import (
	"fmt"
	"regexp"
	"strings"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/transformers"
)

type Evaluator struct {
	regexCache map[string]*regexp.Regexp
}

func NewEvaluator() *Evaluator {
	return &Evaluator{
		regexCache: make(map[string]*regexp.Regexp),
	}
}

func (e *Evaluator) getRegex(pattern string) (*regexp.Regexp, error) {
	if cached, ok := e.regexCache[pattern]; ok {
		return cached, nil
	}

	regex, err := regexp.Compile(pattern)
	if err != nil {
		return nil, fmt.Errorf("invalid regex: %s -> %w", pattern, err)
	}

	e.regexCache[pattern] = regex
	return regex, nil
}

func isFalsy(value any) bool {
	if value == nil {
		return true
	}
	switch v := value.(type) {
	case bool:
		return !v
	case int:
		return v == 0
	case int64:
		return v == 0
	case uint64:
		return v == 0
	case float64:
		return v == 0
	case string:
		return v == ""
	case []any:
		return len(v) == 0
	case map[string]any:
		return len(v) == 0
	}
	return false
}

func isTruthy(value any) bool {
	return !isFalsy(value)
}

func (e *Evaluator) Evaluate(node *flyql.Node, record *Record) bool {
	if node == nil {
		return false
	}

	var result bool

	if node.Expression != nil {
		result = e.evalExpression(node.Expression, record)
	} else {
		var left, right *bool

		if node.Left != nil {
			r := e.Evaluate(node.Left, record)
			left = &r
		}

		if node.Right != nil {
			r := e.Evaluate(node.Right, record)
			right = &r
		}

		if left != nil && right != nil {
			switch node.BoolOperator {
			case flyql.BoolOpAnd:
				result = *left && *right
			case flyql.BoolOpOr:
				result = *left || *right
			default:
				result = false
			}
		} else if left != nil {
			result = *left
		} else if right != nil {
			result = *right
		} else {
			result = false
		}
	}

	if node.Negated {
		result = !result
	}

	return result
}

func (e *Evaluator) evalExpression(expr *flyql.Expression, record *Record) bool {
	key := NewKey(expr.Key.Raw)
	value := record.GetValue(key)

	if len(expr.Key.Transformers) > 0 {
		registry := transformers.DefaultRegistry()
		for _, t := range expr.Key.Transformers {
			transformer := registry.Get(t.Name)
			if transformer == nil {
				return false
			}
			value = transformer.Apply(value)
		}
	}

	switch expr.Operator {
	case flyql.OpTruthy:
		return isTruthy(value)
	case flyql.OpEquals:
		return compareEqual(value, expr.Value)
	case flyql.OpNotEquals:
		return !compareEqual(value, expr.Value)
	case flyql.OpRegex:
		regex, err := e.getRegex(toString(expr.Value))
		if err != nil {
			return false
		}
		return regex.MatchString(toString(value))
	case flyql.OpNotRegex:
		regex, err := e.getRegex(toString(expr.Value))
		if err != nil {
			return true
		}
		return !regex.MatchString(toString(value))
	case flyql.OpGreater:
		return compareGreater(value, expr.Value)
	case flyql.OpLess:
		return compareLess(value, expr.Value)
	case flyql.OpGreaterOrEquals:
		return compareGreaterOrEqual(value, expr.Value)
	case flyql.OpLessOrEquals:
		return compareLessOrEqual(value, expr.Value)
	case flyql.OpIn:
		if len(expr.Values) == 0 {
			return false
		}
		return valueInList(value, expr.Values)
	case flyql.OpNotIn:
		if len(expr.Values) == 0 {
			return true
		}
		return !valueInList(value, expr.Values)
	case flyql.OpHas:
		return evalHas(value, expr.Value)
	case flyql.OpNotHas:
		if value == nil {
			return true
		}
		return !evalHas(value, expr.Value)
	default:
		return false
	}
}

func toString(v any) string {
	if v == nil {
		return ""
	}
	switch val := v.(type) {
	case string:
		return val
	case float64:
		return fmt.Sprintf("%v", val)
	case int:
		return fmt.Sprintf("%d", val)
	default:
		return fmt.Sprintf("%v", val)
	}
}

func toFloat(v any) (float64, bool) {
	switch val := v.(type) {
	case float64:
		return val, true
	case int:
		return float64(val), true
	case int64:
		return float64(val), true
	case uint64:
		return float64(val), true
	default:
		return 0, false
	}
}

type intVal struct {
	i64    int64
	u64    uint64
	isUint bool
}

func toIntVal(v any) (intVal, bool) {
	switch val := v.(type) {
	case int:
		return intVal{i64: int64(val)}, true
	case int64:
		return intVal{i64: val}, true
	case uint64:
		return intVal{u64: val, isUint: true}, true
	}
	return intVal{}, false
}

func compareIntVals(a, b intVal) int {
	if !a.isUint && !b.isUint {
		if a.i64 < b.i64 {
			return -1
		}
		if a.i64 > b.i64 {
			return 1
		}
		return 0
	}
	if a.isUint && b.isUint {
		if a.u64 < b.u64 {
			return -1
		}
		if a.u64 > b.u64 {
			return 1
		}
		return 0
	}
	if a.isUint {
		if b.i64 < 0 {
			return 1
		}
		if a.u64 < uint64(b.i64) {
			return -1
		}
		if a.u64 > uint64(b.i64) {
			return 1
		}
		return 0
	}
	if a.i64 < 0 {
		return -1
	}
	if uint64(a.i64) < b.u64 {
		return -1
	}
	if uint64(a.i64) > b.u64 {
		return 1
	}
	return 0
}

func tryCompareInts(a, b any) (int, bool) {
	ai, aOk := toIntVal(a)
	bi, bOk := toIntVal(b)
	if !aOk || !bOk {
		return 0, false
	}
	return compareIntVals(ai, bi), true
}

func compareEqual(a, b any) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}

	if cmp, ok := tryCompareInts(a, b); ok {
		return cmp == 0
	}

	aFloat, aIsNum := toFloat(a)
	bFloat, bIsNum := toFloat(b)

	if aIsNum && bIsNum {
		return aFloat == bFloat
	}

	return a == b
}

func compareGreater(a, b any) bool {
	if cmp, ok := tryCompareInts(a, b); ok {
		return cmp > 0
	}
	aFloat, aOk := toFloat(a)
	bFloat, bOk := toFloat(b)
	if aOk && bOk {
		return aFloat > bFloat
	}
	return false
}

func compareLess(a, b any) bool {
	if cmp, ok := tryCompareInts(a, b); ok {
		return cmp < 0
	}
	aFloat, aOk := toFloat(a)
	bFloat, bOk := toFloat(b)
	if aOk && bOk {
		return aFloat < bFloat
	}
	return false
}

func compareGreaterOrEqual(a, b any) bool {
	if cmp, ok := tryCompareInts(a, b); ok {
		return cmp >= 0
	}
	aFloat, aOk := toFloat(a)
	bFloat, bOk := toFloat(b)
	if aOk && bOk {
		return aFloat >= bFloat
	}
	return false
}

func compareLessOrEqual(a, b any) bool {
	if cmp, ok := tryCompareInts(a, b); ok {
		return cmp <= 0
	}
	aFloat, aOk := toFloat(a)
	bFloat, bOk := toFloat(b)
	if aOk && bOk {
		return aFloat <= bFloat
	}
	return false
}

func evalHas(value any, exprValue any) bool {
	if value == nil {
		return false
	}
	switch v := value.(type) {
	case string:
		return strings.Contains(v, toString(exprValue))
	case map[string]any:
		_, exists := v[toString(exprValue)]
		return exists
	case []any:
		for _, item := range v {
			if compareEqual(item, exprValue) {
				return true
			}
		}
		return false
	default:
		return false
	}
}

func valueInList(value any, list []any) bool {
	for _, item := range list {
		if compareEqual(value, item) {
			return true
		}
	}
	return false
}
