package matcher

import (
	"fmt"
	"strconv"
	"strings"
	"testing"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/transformers"
)

type firstOctet struct{}

func (f firstOctet) Name() string { return "firstoctet" }
func (f firstOctet) InputType() transformers.TransformerType {
	return transformers.TransformerTypeString
}
func (f firstOctet) OutputType() transformers.TransformerType { return transformers.TransformerTypeInt }
func (f firstOctet) ArgSchema() []transformers.ArgSpec        { return []transformers.ArgSpec{} }
func (f firstOctet) SQL(dialect, colRef string, args []any) string {
	if dialect == "clickhouse" {
		return fmt.Sprintf("toUInt8(splitByChar('.', %s)[1])", colRef)
	}
	return fmt.Sprintf("CAST(SPLIT_PART(%s, '.', 1) AS INTEGER)", colRef)
}
func (f firstOctet) Apply(value interface{}, args []any) interface{} {
	parts := strings.SplitN(fmt.Sprint(value), ".", 2)
	n, _ := strconv.Atoi(parts[0])
	return n
}

func customRegistry() *transformers.TransformerRegistry {
	registry := transformers.DefaultRegistry()
	_ = registry.Register(firstOctet{})
	return registry
}

func TestMatchWithCustomTransformer(t *testing.T) {
	registry := customRegistry()

	result, err := Match("src_ip|firstoctet > 192", map[string]any{"src_ip": "193.0.0.1"}, registry)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result {
		t.Error("expected match for 193.0.0.1 > 192")
	}

	result, err = Match("src_ip|firstoctet > 192", map[string]any{"src_ip": "10.0.0.1"}, registry)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result {
		t.Error("expected no match for 10.0.0.1 > 192")
	}
}

func TestEvaluatorWithCustomRegistry(t *testing.T) {
	registry := customRegistry()
	evaluator := NewEvaluatorWithRegistry(registry)

	parsed, err := flyql.Parse("src_ip|firstoctet > 192")
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}

	record := NewRecord(map[string]any{"src_ip": "193.0.0.1"})
	result, evalErr := evaluator.Evaluate(parsed.Root, record)
	if evalErr != nil {
		t.Fatalf("evaluate error: %v", evalErr)
	}
	if !result {
		t.Error("expected match for 193.0.0.1 > 192")
	}
}

func TestDefaultRegistryRejectsUnknownTransformer(t *testing.T) {
	evaluator := NewEvaluator()
	parsed, err := flyql.Parse("src_ip|firstoctet > 192")
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}

	record := NewRecord(map[string]any{"src_ip": "10.0.0.1"})
	// With default registry, firstoctet is unknown — evalExpression returns error
	_, evalErr := evaluator.Evaluate(parsed.Root, record)
	if evalErr == nil {
		t.Error("expected error for unknown transformer with default registry")
	}
}
