package flyqltype

import "testing"

func TestTypePermitsUnknownChildren(t *testing.T) {
	permissive := map[Type]bool{
		JSON:       true,
		JSONString: true,
		Map:        true,
		Unknown:    true,
	}
	allTypes := []Type{
		String, Int, Float, Bool, Date, DateTime, Duration,
		Array, Map, Struct, JSON, JSONString, Unknown, Any,
	}
	for _, ty := range allTypes {
		got := TypePermitsUnknownChildren(ty)
		want := permissive[ty]
		if got != want {
			t.Errorf("TypePermitsUnknownChildren(%q) = %v, want %v", ty, got, want)
		}
	}
}
