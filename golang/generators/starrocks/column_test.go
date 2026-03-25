package starrocks

import "testing"

func TestNewColumnDisplayName(t *testing.T) {
	tests := []struct {
		name string
		def  ColumnDef
		want string
	}{
		{
			name: "empty display name by default",
			def:  ColumnDef{Name: "message", Type: "VARCHAR"},
			want: "",
		},
		{
			name: "with display name",
			def:  ColumnDef{Name: "message", Type: "VARCHAR", DisplayName: "Message"},
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
