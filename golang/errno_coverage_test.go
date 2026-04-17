package flyql

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type errnoCoverageExpected struct {
	Errno           int    `json:"errno,omitempty"`
	ErrnoOptions    []int  `json:"errno_options,omitempty"`
	MessageContains string `json:"message_contains,omitempty"`
}

type errnoCoverageInputConstruction struct {
	Type  string `json:"type"`
	Depth int    `json:"depth,omitempty"`
}

type errnoCoverageTest struct {
	Name              string                          `json:"name"`
	Input             string                          `json:"input,omitempty"`
	InputConstruction *errnoCoverageInputConstruction `json:"input_construction,omitempty"`
	ExpectedResult    string                          `json:"expected_result"`
	ExpectedError     errnoCoverageExpected           `json:"expected_error"`
}

type errnoCoverageFile struct {
	Version               string              `json:"version"`
	Description           string              `json:"description"`
	TestSuite             string              `json:"test_suite"`
	KnownUnreachableCodes []string            `json:"known_unreachable_codes,omitempty"`
	Tests                 []errnoCoverageTest `json:"tests"`
}

type coverageRegistryEntry struct {
	Name string `json:"name"`
}

type coverageRegistryCategory struct {
	Errors map[string]coverageRegistryEntry `json:"errors"`
}

type coverageRegistryFile struct {
	Categories map[string]coverageRegistryCategory `json:"categories"`
}

func resolveCoverageInput(t *testing.T, entry errnoCoverageTest) string {
	t.Helper()
	if entry.Input != "" || entry.InputConstruction == nil {
		return entry.Input
	}
	c := entry.InputConstruction
	switch c.Type {
	case "nested_parens":
		return strings.Repeat("(", c.Depth) + "a=1" + strings.Repeat(")", c.Depth)
	default:
		t.Fatalf("unknown input_construction type %q for %q", c.Type, entry.Name)
		return ""
	}
}

func loadErrnoCoverageFile(t *testing.T, path string) errnoCoverageFile {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	var f errnoCoverageFile
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatalf("parse %s: %v", path, err)
	}
	return f
}

func loadCoverageRegistry(t *testing.T) coverageRegistryFile {
	t.Helper()
	path := filepath.Join(getTestDataDir(), "..", "..", "errors", "registry.json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	var r coverageRegistryFile
	if err := json.Unmarshal(data, &r); err != nil {
		t.Fatalf("parse %s: %v", path, err)
	}
	return r
}

func TestCoreErrnoCoverageFixture(t *testing.T) {
	path := filepath.Join(getTestDataDir(), "parser", "errno_coverage.json")
	tf := loadErrnoCoverageFile(t, path)
	for _, tc := range tf.Tests {
		t.Run(tc.Name, func(t *testing.T) {
			input := resolveCoverageInput(t, tc)
			parser := NewParser()
			err := parser.Parse(input)
			if err == nil {
				t.Fatalf("expected error, got nil")
			}
			parseErr, ok := err.(*ParseError)
			if !ok {
				t.Fatalf("expected *ParseError, got %T", err)
			}
			if tc.ExpectedError.Errno != 0 && parseErr.Code != tc.ExpectedError.Errno {
				t.Errorf("errno: got %d, want %d (msg=%q)",
					parseErr.Code, tc.ExpectedError.Errno, parseErr.Message)
			}
			if len(tc.ExpectedError.ErrnoOptions) > 0 {
				ok := false
				for _, e := range tc.ExpectedError.ErrnoOptions {
					if parseErr.Code == e {
						ok = true
						break
					}
				}
				if !ok {
					t.Errorf("errno %d not in options %v (msg=%q)",
						parseErr.Code, tc.ExpectedError.ErrnoOptions, parseErr.Message)
				}
			}
			if tc.ExpectedError.MessageContains != "" &&
				!strings.Contains(parseErr.Message, tc.ExpectedError.MessageContains) {
				t.Errorf("message %q missing substring %q",
					parseErr.Message, tc.ExpectedError.MessageContains)
			}
		})
	}
}

func TestCoreRegistryNamesAllCovered(t *testing.T) {
	path := filepath.Join(getTestDataDir(), "parser", "errno_coverage.json")
	tf := loadErrnoCoverageFile(t, path)
	fixtureNames := make(map[string]struct{}, len(tf.Tests))
	for _, tc := range tf.Tests {
		fixtureNames[tc.Name] = struct{}{}
	}
	unreachable := make(map[string]struct{}, len(tf.KnownUnreachableCodes))
	for _, n := range tf.KnownUnreachableCodes {
		unreachable[n] = struct{}{}
	}
	reg := loadCoverageRegistry(t)
	registry := make(map[string]struct{})
	for _, e := range reg.Categories["core_parser"].Errors {
		registry[e.Name] = struct{}{}
	}
	for name := range registry {
		if _, inFixture := fixtureNames[name]; inFixture {
			continue
		}
		if _, inUnreach := unreachable[name]; inUnreach {
			continue
		}
		t.Errorf("core_parser registry code %q missing from fixture and known_unreachable_codes", name)
	}
	for name := range unreachable {
		if _, inRegistry := registry[name]; !inRegistry {
			t.Errorf("known_unreachable_codes entry %q not present in registry", name)
		}
	}
}
