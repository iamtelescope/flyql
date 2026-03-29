package types

import "testing"

func TestValueTypeConstants(t *testing.T) {
	tests := []struct {
		constant ValueType
		expected string
	}{
		{Integer, "integer"},
		{BigInt, "bigint"},
		{Float, "float"},
		{String, "string"},
		{Boolean, "boolean"},
		{Null, "null"},
		{Array, "array"},
	}

	for _, tt := range tests {
		t.Run(tt.expected, func(t *testing.T) {
			if string(tt.constant) != tt.expected {
				t.Errorf("ValueType = %q, want %q", tt.constant, tt.expected)
			}
		})
	}
}

func TestValueTypeCount(t *testing.T) {
	seen := make(map[ValueType]bool)
	constants := []ValueType{Integer, BigInt, Float, String, Boolean, Null, Array}
	for _, c := range constants {
		if seen[c] {
			t.Errorf("duplicate ValueType constant value: %s", c)
		}
		seen[c] = true
	}
	if len(seen) != 7 {
		t.Errorf("expected 7 unique ValueType constants, got %d", len(seen))
	}
}
