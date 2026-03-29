package transformers

import (
	"fmt"
	"strconv"
	"strings"
	"testing"
)

type FirstOctet struct{}

func (f FirstOctet) Name() string                { return "firstoctet" }
func (f FirstOctet) InputType() TransformerType  { return TransformerTypeString }
func (f FirstOctet) OutputType() TransformerType { return TransformerTypeInt }
func (f FirstOctet) SQL(dialect, colRef string, args []any) string {
	if dialect == "clickhouse" {
		return fmt.Sprintf("toUInt8(splitByChar('.', %s)[1])", colRef)
	}
	return fmt.Sprintf("CAST(SPLIT_PART(%s, '.', 1) AS INTEGER)", colRef)
}
func (f FirstOctet) Apply(value interface{}, args []any) interface{} {
	parts := strings.SplitN(fmt.Sprint(value), ".", 2)
	n, _ := strconv.Atoi(parts[0])
	return n
}

func TestCustomRegistration(t *testing.T) {
	registry := DefaultRegistry()
	if err := registry.Register(FirstOctet{}); err != nil {
		t.Fatalf("register failed: %v", err)
	}

	tr := registry.Get("firstoctet")
	if tr == nil {
		t.Fatal("expected firstoctet transformer")
	}
	if tr.Name() != "firstoctet" {
		t.Errorf("expected name firstoctet, got %s", tr.Name())
	}
	if tr.InputType() != TransformerTypeString {
		t.Errorf("expected input string, got %s", tr.InputType())
	}
	if tr.OutputType() != TransformerTypeInt {
		t.Errorf("expected output int, got %s", tr.OutputType())
	}
}

func TestCustomRegistrationBuiltinsStillAvailable(t *testing.T) {
	registry := DefaultRegistry()
	_ = registry.Register(FirstOctet{})

	for _, name := range []string{"upper", "lower", "len", "firstoctet"} {
		if registry.Get(name) == nil {
			t.Errorf("expected %s to be available", name)
		}
	}
}

func TestCustomTransformerApply(t *testing.T) {
	tr := FirstOctet{}
	result := tr.Apply("192.168.1.1", nil)
	if result != 192 {
		t.Errorf("expected 192, got %v", result)
	}
	result = tr.Apply("10.0.0.1", nil)
	if result != 10 {
		t.Errorf("expected 10, got %v", result)
	}
}

func TestCustomTransformerSQL(t *testing.T) {
	tr := FirstOctet{}
	sql := tr.SQL("clickhouse", "src_ip", nil)
	if !strings.Contains(sql, "toUInt8(splitByChar") {
		t.Errorf("unexpected clickhouse SQL: %s", sql)
	}
	sql = tr.SQL("postgresql", "src_ip", nil)
	if !strings.Contains(sql, "CAST(SPLIT_PART") {
		t.Errorf("unexpected postgresql SQL: %s", sql)
	}
}
