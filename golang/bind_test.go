package flyql

import (
	"testing"

	"github.com/iamtelescope/flyql/golang/literal"
)

// firstExpression returns the first Expression found in an AST (depth-first).
func firstExpression(n *Node) *Expression {
	if n == nil {
		return nil
	}
	if n.Expression != nil {
		return n.Expression
	}
	if e := firstExpression(n.Left); e != nil {
		return e
	}
	return firstExpression(n.Right)
}

func TestBindNamedParameter(t *testing.T) {
	res, err := Parse("a=$x")
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if err := BindParams(res.Root, map[string]any{"x": 42}); err != nil {
		t.Fatalf("bind: %v", err)
	}
	expr := firstExpression(res.Root)
	if expr == nil {
		t.Fatalf("expected expression")
	}
	if expr.Value != 42 {
		t.Errorf("value = %v, want 42", expr.Value)
	}
	if expr.ValueType != literal.Integer {
		t.Errorf("type = %v, want Integer", expr.ValueType)
	}
}

func TestBindStringParameter(t *testing.T) {
	res, err := Parse(`who=$name`)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if err := BindParams(res.Root, map[string]any{"name": "Alice"}); err != nil {
		t.Fatalf("bind: %v", err)
	}
	expr := firstExpression(res.Root)
	if expr.Value != "Alice" {
		t.Errorf("value = %v, want Alice", expr.Value)
	}
	if expr.ValueType != literal.String {
		t.Errorf("type = %v, want String", expr.ValueType)
	}
}

func TestBindInList(t *testing.T) {
	res, err := Parse(`a in [$x, $y]`)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if err := BindParams(res.Root, map[string]any{"x": "a", "y": "b"}); err != nil {
		t.Fatalf("bind: %v", err)
	}
	expr := firstExpression(res.Root)
	if len(expr.Values) != 2 {
		t.Fatalf("values len = %d, want 2", len(expr.Values))
	}
	if expr.Values[0] != "a" || expr.Values[1] != "b" {
		t.Errorf("values = %v, want [a b]", expr.Values)
	}
	if len(expr.ValuesTypes) != 2 || expr.ValuesTypes[0] != literal.String || expr.ValuesTypes[1] != literal.String {
		t.Errorf("value types = %v, want [string string]", expr.ValuesTypes)
	}
}

func TestBindAgoFunction(t *testing.T) {
	res, err := Parse(`a=ago($d)`)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if err := BindParams(res.Root, map[string]any{"d": "5m"}); err != nil {
		t.Fatalf("bind: %v", err)
	}
	fc, ok := firstExpression(res.Root).Value.(*FunctionCall)
	if !ok {
		t.Fatalf("value is %T, want *FunctionCall", firstExpression(res.Root).Value)
	}
	if len(fc.DurationArgs) != 1 {
		t.Fatalf("duration args len = %d, want 1", len(fc.DurationArgs))
	}
	if fc.DurationArgs[0].Value != 5 || fc.DurationArgs[0].Unit != "m" {
		t.Errorf("duration = %+v, want {5 m}", fc.DurationArgs[0])
	}
	if len(fc.ParameterArgs) != 0 {
		t.Errorf("parameter args should be cleared, got %v", fc.ParameterArgs)
	}
}

func TestBindMissingParameter(t *testing.T) {
	res, err := Parse("a=$x")
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if err := BindParams(res.Root, map[string]any{}); err == nil {
		t.Errorf("expected error for missing parameter")
	}
}

func TestBindExtraParameter(t *testing.T) {
	res, err := Parse("a=$x")
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if err := BindParams(res.Root, map[string]any{"x": 1, "y": 2}); err == nil {
		t.Errorf("expected error for extra parameter")
	}
}

func TestBindPositional(t *testing.T) {
	res, err := Parse("a=$1")
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if err := BindParams(res.Root, map[string]any{"1": 42}); err != nil {
		t.Fatalf("bind: %v", err)
	}
	if firstExpression(res.Root).Value != 42 {
		t.Errorf("value = %v, want 42", firstExpression(res.Root).Value)
	}
}

func TestBindNilValue(t *testing.T) {
	res, err := Parse("a=$x")
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if err := BindParams(res.Root, map[string]any{"x": nil}); err != nil {
		t.Fatalf("bind: %v", err)
	}
	if firstExpression(res.Root).Value != nil {
		t.Errorf("value = %v, want nil", firstExpression(res.Root).Value)
	}
	if firstExpression(res.Root).ValueType != literal.Null {
		t.Errorf("type = %v, want Null", firstExpression(res.Root).ValueType)
	}
}
