package columns

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

type errnoCoverageCapabilities struct {
	Transformers *bool `json:"transformers,omitempty"`
	Renderers    *bool `json:"renderers,omitempty"`
}

type errnoCoverageExpected struct {
	Errno           int    `json:"errno,omitempty"`
	ErrnoOptions    []int  `json:"errno_options,omitempty"`
	MessageContains string `json:"message_contains,omitempty"`
}

type errnoCoverageTest struct {
	Name           string                     `json:"name"`
	Input          string                     `json:"input"`
	Capabilities   *errnoCoverageCapabilities `json:"capabilities,omitempty"`
	ExpectedResult string                     `json:"expected_result"`
	ExpectedError  errnoCoverageExpected      `json:"expected_error"`
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

func columnsCoverageFixturePath() string {
	_, file, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(file), "..", "..", "tests-data", "core", "parser", "columns_errno_coverage.json")
}

func columnsCoverageRegistryPath() string {
	_, file, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(file), "..", "..", "errors", "registry.json")
}

func loadColumnsCoverageFile(t *testing.T) errnoCoverageFile {
	t.Helper()
	path := columnsCoverageFixturePath()
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

func loadColumnsCoverageRegistry(t *testing.T) coverageRegistryFile {
	t.Helper()
	path := columnsCoverageRegistryPath()
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

func coverageCapabilities(tc errnoCoverageTest) Capabilities {
	caps := Capabilities{}
	if tc.Capabilities != nil {
		if tc.Capabilities.Transformers != nil {
			caps.Transformers = *tc.Capabilities.Transformers
		}
		if tc.Capabilities.Renderers != nil {
			caps.Renderers = *tc.Capabilities.Renderers
		}
	}
	return caps
}

func TestColumnsErrnoCoverageFixture(t *testing.T) {
	tf := loadColumnsCoverageFile(t)
	for _, tc := range tf.Tests {
		t.Run(tc.Name, func(t *testing.T) {
			caps := coverageCapabilities(tc)
			_, err := Parse(tc.Input, caps)
			if err == nil {
				t.Fatalf("expected error, got nil")
			}
			parseErr, ok := err.(*ParserError)
			if !ok {
				t.Fatalf("expected *ParserError, got %T", err)
			}
			if tc.ExpectedError.Errno != 0 && parseErr.Errno != tc.ExpectedError.Errno {
				t.Errorf("errno: got %d, want %d (msg=%q)",
					parseErr.Errno, tc.ExpectedError.Errno, parseErr.Message)
			}
			if len(tc.ExpectedError.ErrnoOptions) > 0 {
				found := false
				for _, e := range tc.ExpectedError.ErrnoOptions {
					if parseErr.Errno == e {
						found = true
						break
					}
				}
				if !found {
					t.Errorf("errno %d not in options %v (msg=%q)",
						parseErr.Errno, tc.ExpectedError.ErrnoOptions, parseErr.Message)
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

func TestColumnsRegistryNamesAllCovered(t *testing.T) {
	tf := loadColumnsCoverageFile(t)
	fixtureNames := make(map[string]struct{}, len(tf.Tests))
	for _, tc := range tf.Tests {
		fixtureNames[tc.Name] = struct{}{}
	}
	unreachable := make(map[string]struct{}, len(tf.KnownUnreachableCodes))
	for _, n := range tf.KnownUnreachableCodes {
		unreachable[n] = struct{}{}
	}
	reg := loadColumnsCoverageRegistry(t)
	registry := make(map[string]struct{})
	for _, e := range reg.Categories["columns_parser"].Errors {
		registry[e.Name] = struct{}{}
	}
	for name := range registry {
		if _, inFix := fixtureNames[name]; inFix {
			continue
		}
		if _, inUnr := unreachable[name]; inUnr {
			continue
		}
		t.Errorf("columns_parser registry code %q missing from fixture and known_unreachable_codes", name)
	}
	for name := range unreachable {
		if _, inReg := registry[name]; !inReg {
			t.Errorf("known_unreachable_codes entry %q not present in registry", name)
		}
	}
}
