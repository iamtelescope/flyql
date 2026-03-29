package transformers

import (
	"testing"
)

func TestUpperTransformer(t *testing.T) {
	u := Upper{}

	if u.Name() != "upper" {
		t.Errorf("Name() = %q, want %q", u.Name(), "upper")
	}
	if u.InputType() != TransformerTypeString {
		t.Errorf("InputType() = %q, want %q", u.InputType(), TransformerTypeString)
	}
	if u.OutputType() != TransformerTypeString {
		t.Errorf("OutputType() = %q, want %q", u.OutputType(), TransformerTypeString)
	}

	// SQL per dialect
	dialects := []struct {
		dialect string
		col     string
		want    string
	}{
		{"clickhouse", "col", "upper(col)"},
		{"postgresql", "col", "UPPER(col)"},
		{"starrocks", "col", "UPPER(col)"},
	}
	for _, d := range dialects {
		got := u.SQL(d.dialect, d.col, nil)
		if got != d.want {
			t.Errorf("SQL(%q, %q) = %q, want %q", d.dialect, d.col, got, d.want)
		}
	}

	// Apply
	if got := u.Apply("hello", nil); got != "HELLO" {
		t.Errorf("Apply(%q) = %q, want %q", "hello", got, "HELLO")
	}
}

func TestLowerTransformer(t *testing.T) {
	l := Lower{}

	if l.Name() != "lower" {
		t.Errorf("Name() = %q, want %q", l.Name(), "lower")
	}
	if l.InputType() != TransformerTypeString {
		t.Errorf("InputType() = %q, want %q", l.InputType(), TransformerTypeString)
	}
	if l.OutputType() != TransformerTypeString {
		t.Errorf("OutputType() = %q, want %q", l.OutputType(), TransformerTypeString)
	}

	dialects := []struct {
		dialect string
		col     string
		want    string
	}{
		{"clickhouse", "col", "lower(col)"},
		{"postgresql", "col", "LOWER(col)"},
		{"starrocks", "col", "LOWER(col)"},
	}
	for _, d := range dialects {
		got := l.SQL(d.dialect, d.col, nil)
		if got != d.want {
			t.Errorf("SQL(%q, %q) = %q, want %q", d.dialect, d.col, got, d.want)
		}
	}

	if got := l.Apply("HELLO", nil); got != "hello" {
		t.Errorf("Apply(%q) = %q, want %q", "HELLO", got, "hello")
	}
}

func TestLenTransformer(t *testing.T) {
	l := Len{}

	if l.Name() != "len" {
		t.Errorf("Name() = %q, want %q", l.Name(), "len")
	}
	if l.InputType() != TransformerTypeString {
		t.Errorf("InputType() = %q, want %q", l.InputType(), TransformerTypeString)
	}
	if l.OutputType() != TransformerTypeInt {
		t.Errorf("OutputType() = %q, want %q", l.OutputType(), TransformerTypeInt)
	}

	dialects := []struct {
		dialect string
		col     string
		want    string
	}{
		{"clickhouse", "col", "length(col)"},
		{"postgresql", "col", "LENGTH(col)"},
		{"starrocks", "col", "LENGTH(col)"},
	}
	for _, d := range dialects {
		got := l.SQL(d.dialect, d.col, nil)
		if got != d.want {
			t.Errorf("SQL(%q, %q) = %q, want %q", d.dialect, d.col, got, d.want)
		}
	}

	if got := l.Apply("hello", nil); got != 5 {
		t.Errorf("Apply(%q) = %v, want %d", "hello", got, 5)
	}
}

func TestBuiltinsImplementTransformerInterface(t *testing.T) {
	// Verify all builtins satisfy the Transformer interface at compile time
	var _ Transformer = Upper{}
	var _ Transformer = Lower{}
	var _ Transformer = Len{}
	var _ Transformer = Split{}
}
