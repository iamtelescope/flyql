package columns

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"testing"
)

// Parity test: generated Go constants in package columns match errors/registry.json.
// Covers columns_parser (int errnos) plus the 3 renderer validator codes.

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
	// golang/columns/error_registry_parity_test.go -> go up twice to repo root.
	repoRoot := filepath.Dir(filepath.Dir(filepath.Dir(thisFile)))
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

func isRendererKey(key string) bool {
	switch key {
	case "unknown_renderer", "renderer_arg_count", "renderer_arg_type":
		return true
	}
	return false
}

func TestErrorRegistryParity_ColumnsParser(t *testing.T) {
	reg := loadRegistryFile(t)
	cat, ok := reg.Categories["columns_parser"]
	if !ok {
		t.Fatal("registry missing columns_parser category")
	}
	if cat.CodeType != "int" {
		t.Fatalf("columns_parser code_type = %q; want int", cat.CodeType)
	}
	for key, raw := range cat.Errors {
		var entry registryEntry
		if err := json.Unmarshal(raw, &entry); err != nil {
			t.Fatalf("decoding columns_parser entry %s: %v", key, err)
		}
		expected, err := strconv.Atoi(key)
		if err != nil {
			t.Fatalf("columns_parser key %q: %v", key, err)
		}
		got, present := generatedColumnsParserConstants[entry.Name]
		if !present {
			t.Errorf("columns_parser: generated constant %s missing", entry.Name)
			continue
		}
		if got != expected {
			t.Errorf("columns_parser: %s = %d; want %d", entry.Name, got, expected)
		}
		mapMsg, ok := generatedColumnsParserMessages[entry.Name]
		if !ok {
			t.Errorf("columns_parser: message map missing %s", entry.Name)
			continue
		}
		if entry.DynamicMessage {
			if mapMsg == "" {
				t.Errorf("columns_parser: dynamic entry %s has empty message", entry.Name)
			}
		} else if mapMsg != entry.Message {
			t.Errorf("columns_parser: %s message = %q; want %q", entry.Name, mapMsg, entry.Message)
		}
	}
}

func TestErrorRegistryParity_RendererValidator(t *testing.T) {
	reg := loadRegistryFile(t)
	cat, ok := reg.Categories["validator"]
	if !ok {
		t.Fatal("registry missing validator category")
	}
	if cat.CodeType != "string" {
		t.Fatalf("validator code_type = %q; want string", cat.CodeType)
	}
	for key, raw := range cat.Errors {
		if !isRendererKey(key) {
			continue
		}
		var entry registryEntry
		if err := json.Unmarshal(raw, &entry); err != nil {
			t.Fatalf("decoding validator entry %s: %v", key, err)
		}
		got, present := generatedRendererValidatorConstants[entry.Name]
		if !present {
			t.Errorf("renderer validator: generated constant %s missing", entry.Name)
			continue
		}
		if got != key {
			t.Errorf("renderer validator: %s = %q; want %q", entry.Name, got, key)
		}
		mapMsg, ok := generatedRendererValidatorMessages[entry.Name]
		if !ok {
			t.Errorf("renderer validator: message map missing %s", entry.Name)
			continue
		}
		if entry.DynamicMessage {
			if mapMsg == "" {
				t.Errorf("renderer validator: dynamic entry %s has empty message", entry.Name)
			}
		} else if mapMsg != entry.Message {
			t.Errorf("renderer validator: %s message = %q; want %q", entry.Name, mapMsg, entry.Message)
		}
	}
}
