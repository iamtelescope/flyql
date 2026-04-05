package flyql

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"testing"
)

var fixtureIndexRE = regexp.MustCompile(`^([^\[\]]+)(?:\[(\d+)\])?$`)

// getByPath traverses a Node by dot-notation path, handling [i] index suffixes.
// Field-name translation mirrors the shared JSON fixture convention:
//   - snake_case paths are converted to CamelCase (e.g. "bool_operator_range" → "BoolOperatorRange")
func getByPath(root *Node, path string) (any, error) {
	parts := strings.Split(path, ".")
	if len(parts) > 0 && parts[0] == "root" {
		parts = parts[1:]
	}
	var current any = root
	for _, part := range parts {
		m := fixtureIndexRE.FindStringSubmatch(part)
		if m == nil {
			return nil, fmt.Errorf("invalid path segment: %q", part)
		}
		name := snakeToCamel(m[1])
		idxStr := m[2]
		v := reflect.ValueOf(current)
		for v.Kind() == reflect.Ptr {
			if v.IsNil() {
				return nil, fmt.Errorf("nil pointer at segment %q", part)
			}
			v = v.Elem()
		}
		if v.Kind() != reflect.Struct {
			return nil, fmt.Errorf("cannot take field %q from %v (kind=%s)", name, current, v.Kind())
		}
		f := v.FieldByName(name)
		if !f.IsValid() {
			return nil, fmt.Errorf("field %q not found (path=%q)", name, part)
		}
		current = f.Interface()
		if idxStr != "" {
			idx, _ := strconv.Atoi(idxStr)
			cv := reflect.ValueOf(current)
			if cv.Kind() != reflect.Slice && cv.Kind() != reflect.Array {
				return nil, fmt.Errorf("not a slice at %q", part)
			}
			current = cv.Index(idx).Interface()
		}
	}
	return current, nil
}

func snakeToCamel(s string) string {
	parts := strings.Split(s, "_")
	out := ""
	for _, p := range parts {
		if p == "" {
			continue
		}
		out += strings.ToUpper(p[:1]) + p[1:]
	}
	return out
}

type fixtureCase struct {
	Name           string                 `json:"name"`
	Input          string                 `json:"input"`
	ExpectedResult string                 `json:"expected_result"`
	ExpectedRanges map[string][]int       `json:"expected_ranges"`
	ExpectedError  map[string]interface{} `json:"expected_error"`
}

type fixtureFile struct {
	TestSuite string        `json:"test_suite"`
	Tests     []fixtureCase `json:"tests"`
}

func findFixturesDir(t *testing.T) string {
	// Walk up from cwd looking for tests-data/core/parser/positions
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	for i := 0; i < 5; i++ {
		candidate := filepath.Join(wd, "tests-data", "core", "parser", "positions")
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
		wd = filepath.Dir(wd)
	}
	t.Fatalf("could not locate tests-data/core/parser/positions")
	return ""
}

func TestPositions(t *testing.T) {
	dir := findFixturesDir(t)
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("readdir: %v", err)
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			t.Fatalf("read %s: %v", e.Name(), err)
		}
		var ff fixtureFile
		if err := json.Unmarshal(data, &ff); err != nil {
			t.Fatalf("unmarshal %s: %v", e.Name(), err)
		}
		for _, tc := range ff.Tests {
			tc := tc
			t.Run(fmt.Sprintf("%s::%s", e.Name(), tc.Name), func(t *testing.T) {
				p := NewParser()
				err := p.Parse(tc.Input)
				if tc.ExpectedResult == "error" {
					if err == nil {
						t.Fatalf("expected error, got none")
					}
					pe, ok := err.(*ParseError)
					if !ok {
						t.Fatalf("expected *ParseError, got %T: %v", err, err)
					}
					wantErrno := int(tc.ExpectedError["errno"].(float64))
					if pe.Code != wantErrno {
						t.Fatalf("errno: got %d, expected %d", pe.Code, wantErrno)
					}
					rangeArr := tc.ExpectedError["range"].([]interface{})
					want := Range{Start: int(rangeArr[0].(float64)), End: int(rangeArr[1].(float64))}
					if pe.Range != want {
						t.Fatalf("error range: got %+v, expected %+v", pe.Range, want)
					}
					return
				}
				if err != nil {
					t.Fatalf("parse error: %v", err)
				}
				for path, expected := range tc.ExpectedRanges {
					got, perr := getByPath(p.Root, path)
					if perr != nil {
						t.Fatalf("%s: %v", path, perr)
					}
					want := Range{Start: expected[0], End: expected[1]}
					// unwrap *Range
					if gptr, ok := got.(*Range); ok {
						if gptr == nil {
							t.Fatalf("%s: got nil *Range, expected %+v", path, want)
						}
						got = *gptr
					}
					if !reflect.DeepEqual(got, want) {
						t.Fatalf("%s: got %+v, expected %+v", path, got, want)
					}
				}
			})
		}
	}
}
