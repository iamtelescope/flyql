package flyql

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

type keyTestFile struct {
	Version     string        `json:"version"`
	Description string        `json:"description"`
	TestSuite   string        `json:"test_suite"`
	Tests       []keyTestCase `json:"tests"`
}

type keyTestCase struct {
	Name           string       `json:"name"`
	Input          string       `json:"input"`
	ExpectedResult string       `json:"expected_result"`
	ExpectedKey    *expectedKey `json:"expected_key,omitempty"`
	ExpectedError  string       `json:"expected_error_message,omitempty"`
}

type expectedKey struct {
	Segments       []string `json:"segments"`
	QuotedSegments []bool   `json:"quoted_segments"`
	IsSegmented    bool     `json:"is_segmented"`
	Raw            string   `json:"raw"`
}

func TestKey(t *testing.T) {
	data, err := os.ReadFile(filepath.Join(getTestDataDir(), "key.json"))
	if err != nil {
		t.Fatalf("failed to read test data: %v", err)
	}

	var testFile keyTestFile
	if err := json.Unmarshal(data, &testFile); err != nil {
		t.Fatalf("failed to parse test data: %v", err)
	}

	for _, tc := range testFile.Tests {
		t.Run(tc.Name, func(t *testing.T) {
			key, err := ParseKey(tc.Input, 0)

			if tc.ExpectedResult == "error" {
				if err == nil {
					t.Errorf("expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("unexpected error: %v", err)
				return
			}

			if tc.ExpectedKey == nil {
				return
			}

			if len(key.Segments) != len(tc.ExpectedKey.Segments) {
				t.Errorf("segments length mismatch: got %d, want %d", len(key.Segments), len(tc.ExpectedKey.Segments))
				return
			}

			for i, seg := range key.Segments {
				if seg != tc.ExpectedKey.Segments[i] {
					t.Errorf("segment %d mismatch: got %q, want %q", i, seg, tc.ExpectedKey.Segments[i])
				}
			}

			if len(tc.ExpectedKey.QuotedSegments) > 0 {
				if len(key.QuotedSegments) != len(tc.ExpectedKey.QuotedSegments) {
					t.Errorf("quoted_segments length mismatch: got %d, want %d", len(key.QuotedSegments), len(tc.ExpectedKey.QuotedSegments))
				} else {
					for i, q := range key.QuotedSegments {
						if q != tc.ExpectedKey.QuotedSegments[i] {
							t.Errorf("quoted_segment %d mismatch: got %v, want %v", i, q, tc.ExpectedKey.QuotedSegments[i])
						}
					}
				}
			}

			if key.IsSegmented() != tc.ExpectedKey.IsSegmented {
				t.Errorf("IsSegmented mismatch: got %v, want %v", key.IsSegmented(), tc.ExpectedKey.IsSegmented)
			}

			if key.Raw != tc.ExpectedKey.Raw {
				t.Errorf("Raw mismatch: got %q, want %q", key.Raw, tc.ExpectedKey.Raw)
			}
		})
	}
}
