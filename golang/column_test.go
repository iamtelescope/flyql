package flyql

import (
	"strings"
	"testing"

	"github.com/iamtelescope/flyql/golang/flyqltype"
)

func TestParseTypeRejectsAny(t *testing.T) {
	_, err := ParseType("any")
	if err == nil {
		t.Fatal("ParseType(\"any\") returned nil error; want rejection")
	}
	if !strings.Contains(err.Error(), "unknown flyql type") {
		t.Errorf("ParseType(\"any\") error = %q, want substring %q", err.Error(), "unknown flyql type")
	}
}

func TestTypeAnyExposed(t *testing.T) {
	if flyqltype.Any != "any" {
		t.Errorf("flyqltype.Any = %q, want %q", flyqltype.Any, "any")
	}
	if TypeAny != flyqltype.Any {
		t.Errorf("TypeAny = %q, want flyqltype.Any (%q)", TypeAny, flyqltype.Any)
	}
}
