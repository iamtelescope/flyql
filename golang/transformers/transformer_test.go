package transformers

import (
	"testing"

	"github.com/iamtelescope/flyql/golang/flyqltype"
)

func TestFlyQLTypeConstants(t *testing.T) {
	tests := []struct {
		constant flyqltype.Type
		value    string
	}{
		{flyqltype.String, "string"},
		{flyqltype.Int, "int"},
		{flyqltype.Float, "float"},
		{flyqltype.Bool, "bool"},
		{flyqltype.Array, "array"},
	}
	for _, tc := range tests {
		if string(tc.constant) != tc.value {
			t.Errorf("flyqltype constant = %q, want %q", tc.constant, tc.value)
		}
	}
}
