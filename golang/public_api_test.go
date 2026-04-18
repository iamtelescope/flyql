package flyql_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"testing"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/generators/clickhouse"
	"github.com/iamtelescope/flyql/golang/generators/postgresql"
	"github.com/iamtelescope/flyql/golang/generators/starrocks"
	"github.com/iamtelescope/flyql/golang/matcher"
)

func loadSurface(t *testing.T) map[string][]string {
	t.Helper()
	_, thisFile, _, _ := runtime.Caller(0)
	surfacePath := filepath.Join(filepath.Dir(thisFile), "..", "errors", "public_api_surface.json")
	data, err := os.ReadFile(surfacePath)
	if err != nil {
		t.Fatalf("read surface json: %v", err)
	}
	var wrapper struct {
		Golang map[string][]string `json:"golang"`
	}
	if err := json.Unmarshal(data, &wrapper); err != nil {
		t.Fatalf("parse surface json: %v", err)
	}
	return wrapper.Golang
}

func assertManifest(t *testing.T, name string, actual []string, expected []string) {
	t.Helper()
	sortedA := append([]string(nil), actual...)
	sortedE := append([]string(nil), expected...)
	sort.Strings(sortedA)
	sort.Strings(sortedE)
	if len(sortedA) != len(sortedE) {
		t.Errorf("%s surface size mismatch: got %d, want %d\n  actual=%v\n  expected=%v",
			name, len(sortedA), len(sortedE), sortedA, sortedE)
		return
	}
	for i := range sortedA {
		if sortedA[i] != sortedE[i] {
			t.Errorf("%s surface drift at index %d: got %q, want %q\n  actual=%v\n  expected=%v",
				name, i, sortedA[i], sortedE[i], sortedA, sortedE)
			return
		}
	}
}

func TestPublicAPISurface(t *testing.T) {
	surface := loadSurface(t)

	cases := []struct {
		name     string
		manifest []string
	}{
		{"flyql", flyql.PublicSymbols},
		{"matcher", matcher.PublicSymbols},
		{"generators/clickhouse", clickhouse.PublicSymbols},
		{"generators/postgresql", postgresql.PublicSymbols},
		{"generators/starrocks", starrocks.PublicSymbols},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			expected, ok := surface[c.name]
			if !ok {
				t.Fatalf("surface JSON missing entry for %q", c.name)
			}
			assertManifest(t, c.name, c.manifest, expected)
		})
	}
}
