package e2e_test

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/iamtelescope/flyql/golang/matcher"
)

type rowsFile struct {
	Rows []map[string]any `json:"rows"`
}

func loadMatcherRows(t *testing.T) []map[string]any {
	t.Helper()
	data, err := os.ReadFile(testDataPath("rows.json"))
	if err != nil {
		t.Fatalf("read rows.json: %v", err)
	}
	var f rowsFile
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatalf("parse rows.json: %v", err)
	}
	return f.Rows
}

func shouldSkipForMatcher(flyql string) bool {
	// Skip tests that reference columns not in matcher rows, plus wildcard/date comparison (Go matcher doesn't support)
	for _, skip := range []string{"tags.", "metadata.", "meta_json.", "meta.'dc.region'", "meta.'0'", "meta.tags.", "json_meta", "hello*'", "'*@", "created_at<=", "ago(", "now()", "today()", "startOf("} {
		if strings.Contains(flyql, skip) {
			return true
		}
	}
	return false
}

func TestMatcherE2E(t *testing.T) {
	rows := loadMatcherRows(t)
	testCases := loadTestCases(t)

	for _, tc := range testCases {
		tc := tc
		if shouldSkipForMatcher(tc.FlyQL) {
			continue
		}

		t.Run(tc.Name, func(t *testing.T) {
			r := testResult{
				Kind:        "where",
				Database:    "matcher",
				Name:        tc.Name,
				FlyQL:       tc.FlyQL,
				SQL:         "(in-memory)",
				ExpectedIDs: tc.ExpectedIDs,
			}

			var matchedIDs []int
			for _, row := range rows {
				matched, err := matcher.Match(tc.FlyQL, row)
				if err != nil {
					r.Error = err.Error()
					addResult(r)
					t.Fatalf("matcher error: %v", err)
				}
				if matched {
					// JSON unmarshals numbers as float64
					if id, ok := row["id"].(float64); ok {
						matchedIDs = append(matchedIDs, int(id))
					}
				}
			}

			r.ReturnedIDs = matchedIDs
			r.Passed = idsMatch(tc.ExpectedIDs, matchedIDs)
			addResult(r)

			if !r.Passed {
				t.Errorf("expected %v, got %v", tc.ExpectedIDs, matchedIDs)
			}
		})
	}
}
