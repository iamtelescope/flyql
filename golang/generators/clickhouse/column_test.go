package clickhouse

import (
	"github.com/iamtelescope/flyql/golang/flyqltype"
	"strings"
	"testing"
)

func TestNewColumnDisplayName(t *testing.T) {
	tests := []struct {
		name string
		def  ColumnDef
		want string
	}{
		{
			name: "empty display name by default",
			def:  ColumnDef{Name: "message", Type: "String"},
			want: "",
		},
		{
			name: "with display name",
			def:  ColumnDef{Name: "message", Type: "String", DisplayName: "Message"},
			want: "Message",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			col := NewColumn(tt.def)
			if col.DisplayName != tt.want {
				t.Errorf("DisplayName = %q, want %q", col.DisplayName, tt.want)
			}
		})
	}
}

func TestNormalizeClickHouseTypeWrapperWithSpaces(t *testing.T) {
	// Regression: wrapper regex with ambiguous \s*(.+)\s*\) caused ReDoS
	spaces := strings.Repeat(" ", 10000)
	input := "Nullable(" + spaces + "String" + spaces + ")"
	result := NormalizeClickHouseType(input)
	if result != flyqltype.String {
		t.Errorf("NormalizeClickHouseType(%q...) = %q, want %q", input[:30], result, flyqltype.String)
	}
}

func TestNormalizeClickHouseTypeNestedWrapper(t *testing.T) {
	result := NormalizeClickHouseType("Nullable(DateTime64(3))")
	if result != flyqltype.Date {
		t.Errorf("NormalizeClickHouseType(Nullable(DateTime64(3))) = %q, want %q", result, flyqltype.Date)
	}
}
