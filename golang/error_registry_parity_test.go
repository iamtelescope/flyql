package flyql

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"testing"
)

// Parity test: generated Go constants in package flyql match errors/registry.json.
// Covers core_parser (int errnos) plus the 8 non-renderer validator codes.
// The generated sibling file errors_generated_test.go exposes name->value
// maps so this test can loop over them without Go reflection on consts.

type registryEntry struct {
	Name           string `json:"name"`
	Message        string `json:"message"`
	Description    string `json:"description"`
	DynamicMessage bool   `json:"dynamic_message"`
}

type registryCategory struct {
	CodeType string                     `json:"code_type"`
	Errors   map[string]json.RawMessage `json:"errors"`
}

type registryFile struct {
	Version    int                         `json:"version"`
	Categories map[string]registryCategory `json:"categories"`
}

func loadRegistryFile(t *testing.T) registryFile {
	t.Helper()
	_, thisFile, _, _ := runtime.Caller(0)
	repoRoot := filepath.Dir(filepath.Dir(thisFile))
	path := filepath.Join(repoRoot, "errors", "registry.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("reading %s: %v", path, err)
	}
	var reg registryFile
	if err := json.Unmarshal(raw, &reg); err != nil {
		t.Fatalf("parsing %s: %v", path, err)
	}
	return reg
}

func rendererKey(key string) bool {
	switch key {
	case "unknown_renderer", "renderer_arg_count", "renderer_arg_type":
		return true
	}
	return false
}

func TestErrorRegistryParity_CoreParser(t *testing.T) {
	reg := loadRegistryFile(t)
	cat, ok := reg.Categories["core_parser"]
	if !ok {
		t.Fatal("registry missing core_parser category")
	}
	if cat.CodeType != "int" {
		t.Fatalf("core_parser code_type = %q; want int", cat.CodeType)
	}
	for key, raw := range cat.Errors {
		var entry registryEntry
		if err := json.Unmarshal(raw, &entry); err != nil {
			t.Fatalf("decoding core_parser entry %s: %v", key, err)
		}
		expected, err := strconv.Atoi(key)
		if err != nil {
			t.Fatalf("core_parser key %q: %v", key, err)
		}
		got, present := generatedCoreParserConstants[entry.Name]
		if !present {
			t.Errorf("core_parser: generated constant %s missing", entry.Name)
			continue
		}
		if got != expected {
			t.Errorf("core_parser: %s = %d; want %d", entry.Name, got, expected)
		}
		mapMsg, ok := generatedCoreParserMessages[entry.Name]
		if !ok {
			t.Errorf("core_parser: message map missing %s", entry.Name)
			continue
		}
		if entry.DynamicMessage {
			if mapMsg == "" {
				t.Errorf("core_parser: dynamic entry %s has empty message", entry.Name)
			}
		} else if mapMsg != entry.Message {
			t.Errorf("core_parser: %s message = %q; want %q", entry.Name, mapMsg, entry.Message)
		}
	}
}

func TestErrorRegistryParity_Validator(t *testing.T) {
	reg := loadRegistryFile(t)
	cat, ok := reg.Categories["validator"]
	if !ok {
		t.Fatal("registry missing validator category")
	}
	if cat.CodeType != "string" {
		t.Fatalf("validator code_type = %q; want string", cat.CodeType)
	}
	for key, raw := range cat.Errors {
		if rendererKey(key) {
			continue
		}
		var entry registryEntry
		if err := json.Unmarshal(raw, &entry); err != nil {
			t.Fatalf("decoding validator entry %s: %v", key, err)
		}
		got, present := generatedValidatorConstants[entry.Name]
		if !present {
			t.Errorf("validator: generated constant %s missing", entry.Name)
			continue
		}
		if got != key {
			t.Errorf("validator: %s = %q; want %q", entry.Name, got, key)
		}
		mapMsg, ok := generatedValidatorMessages[entry.Name]
		if !ok {
			t.Errorf("validator: message map missing %s", entry.Name)
			continue
		}
		if entry.DynamicMessage {
			if mapMsg == "" {
				t.Errorf("validator: dynamic entry %s has empty message", entry.Name)
			}
		} else if mapMsg != entry.Message {
			t.Errorf("validator: %s message = %q; want %q", entry.Name, mapMsg, entry.Message)
		}
	}
}
