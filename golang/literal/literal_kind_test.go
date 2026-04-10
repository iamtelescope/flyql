package literal

import "testing"

func TestLiteralKindConstants(t *testing.T) {
	tests := []struct {
		constant LiteralKind
		expected string
	}{
		{Integer, "integer"},
		{BigInt, "bigint"},
		{Float, "float"},
		{String, "string"},
		{Boolean, "boolean"},
		{Null, "null"},
		{Array, "array"},
		{Column, "column"},
	}

	for _, tt := range tests {
		t.Run(tt.expected, func(t *testing.T) {
			if string(tt.constant) != tt.expected {
				t.Errorf("LiteralKind = %q, want %q", tt.constant, tt.expected)
			}
		})
	}
}

func TestLiteralKindCount(t *testing.T) {
	seen := make(map[LiteralKind]bool)
	constants := []LiteralKind{Integer, BigInt, Float, String, Boolean, Null, Array, Column}
	for _, c := range constants {
		if seen[c] {
			t.Errorf("duplicate LiteralKind constant value: %s", c)
		}
		seen[c] = true
	}
	if len(seen) != 8 {
		t.Errorf("expected 8 unique LiteralKind constants, got %d", len(seen))
	}
}
