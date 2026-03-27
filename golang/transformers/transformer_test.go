package transformers

import (
	"testing"
)

func TestTransformerTypeConstants(t *testing.T) {
	tests := []struct {
		constant TransformerType
		value    string
	}{
		{TransformerTypeString, "string"},
		{TransformerTypeInt, "int"},
		{TransformerTypeFloat, "float"},
		{TransformerTypeBool, "bool"},
		{TransformerTypeArray, "array"},
	}
	for _, tc := range tests {
		if string(tc.constant) != tc.value {
			t.Errorf("TransformerType constant = %q, want %q", tc.constant, tc.value)
		}
	}
}
