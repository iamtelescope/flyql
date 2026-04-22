package e2e_test

import (
	"encoding/json"
	"log"
	"os"
	"testing"
	"time"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/matcher"
)

type dtMatcherFixture struct {
	Columns map[string]any   `json:"columns"`
	Rows    []map[string]any `json:"rows"`
	Tests   []dtMatcherCase  `json:"tests"`
}

type dtMatcherCase struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Query       string `json:"query"`
	ExpectedIDs []int  `json:"expected_ids"`
}

func loadDatetimeFixture(t *testing.T) dtMatcherFixture {
	t.Helper()
	data, err := os.ReadFile(testDataPath("datetime_matcher_cases.json"))
	if err != nil {
		t.Fatalf("read datetime_matcher_cases.json: %v", err)
	}
	var f dtMatcherFixture
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatalf("parse datetime_matcher_cases.json: %v", err)
	}
	return f
}

// TestDatetimeMatcherE2E is the cross-language parity contract for
// schema-driven Date/DateTime coercion. Python/Go/JS load the same
// fixture and must produce identical matched-id lists.
func TestDatetimeMatcherE2E(t *testing.T) {
	// The migration-warning log output is expected for rows that carry
	// time-bearing values on a Date column; suppress during the test to
	// keep e2e output clean.
	prev := log.Writer()
	log.SetOutput(silentWriter{})
	defer log.SetOutput(prev)

	fixture := loadDatetimeFixture(t)
	schema, err := flyql.FromPlainObject(fixture.Columns)
	if err != nil {
		t.Fatalf("schema build: %v", err)
	}

	for _, tc := range fixture.Tests {
		tc := tc
		t.Run(tc.Name, func(t *testing.T) {
			r := testResult{
				Kind:        "where",
				Database:    "matcher",
				Name:        "datetime/" + tc.Name,
				FlyQL:       tc.Query,
				SQL:         "(in-memory)",
				ExpectedIDs: tc.ExpectedIDs,
			}

			parsed, err := flyql.Parse(tc.Query)
			if err != nil {
				r.Error = err.Error()
				addResult(r)
				t.Fatalf("parse: %v", err)
			}

			evaluator := matcher.NewEvaluatorWithSchema(nil, "UTC", schema)
			var matchedIDs []int
			for _, row := range fixture.Rows {
				rec := matcher.NewRecord(row)
				ok, evalErr := evaluator.Evaluate(parsed.Root, rec)
				if evalErr != nil {
					r.Error = evalErr.Error()
					addResult(r)
					t.Fatalf("evaluate: %v", evalErr)
				}
				if ok {
					if id, ok := row["id"].(float64); ok {
						matchedIDs = append(matchedIDs, int(id))
					}
				}
			}

			r.ReturnedIDs = matchedIDs
			r.Passed = idsMatch(tc.ExpectedIDs, matchedIDs)
			addResult(r)

			if !r.Passed {
				t.Errorf("query %q: expected %s, got %s", tc.Query, formatIDs(tc.ExpectedIDs), formatIDs(matchedIDs))
			}
		})
	}
}

type silentWriter struct{}

func (silentWriter) Write(p []byte) (int, error) { return len(p), nil }

// TestDatetimeNativeTypesE2E exercises the matcher with Go-native
// `time.Time` values (and day-precision `time.Time` for Date columns)
// rather than ISO strings. The Python and JS counterparts build the
// same semantic rows with their native types (`datetime`/`date` and
// `Date` respectively); the orchestrator's cross-language dedup pins
// parity.
//
// Every datetime is UTC so the instant is unambiguous across
// languages. DST fold semantics are out of scope here — they're
// covered via the ISO-string cases in the shared fixture.
func TestDatetimeNativeTypesE2E(t *testing.T) {
	prev := log.Writer()
	log.SetOutput(silentWriter{})
	defer log.SetOutput(prev)

	schema, err := flyql.FromPlainObject(map[string]any{
		"id":        map[string]any{"type": "int"},
		"ts_utc":    map[string]any{"type": "datetime"},
		"event_day": map[string]any{"type": "date"},
	})
	if err != nil {
		t.Fatalf("schema build: %v", err)
	}

	// Row 3's ts_utc has sub-ms precision (500µs) — collapses to ms per Decision 23.
	rows := []map[string]any{
		{
			"id":        float64(1),
			"ts_utc":    time.Date(2026, 4, 6, 10, 0, 0, 0, time.UTC),
			"event_day": time.Date(2026, 4, 6, 0, 0, 0, 0, time.UTC),
		},
		{
			"id":        float64(2),
			"ts_utc":    time.Date(2026, 4, 6, 12, 0, 0, 0, time.UTC),
			"event_day": time.Date(2026, 4, 7, 0, 0, 0, 0, time.UTC),
		},
		{
			"id":        float64(3),
			"ts_utc":    time.Date(2026, 4, 6, 21, 0, 0, 500_000, time.UTC),
			"event_day": time.Date(2026, 4, 5, 0, 0, 0, 0, time.UTC),
		},
	}

	cases := []dtMatcherCase{
		{Name: "native_datetime_gt", Query: "ts_utc > '2026-04-06T11:00:00Z'", ExpectedIDs: []int{2, 3}},
		{Name: "native_datetime_lt", Query: "ts_utc < '2026-04-06T11:00:00Z'", ExpectedIDs: []int{1}},
		{Name: "native_datetime_ms_truncation", Query: "ts_utc = '2026-04-06T21:00:00Z'", ExpectedIDs: []int{3}},
		{Name: "native_datetime_ne", Query: "ts_utc != '2026-04-06T10:00:00Z'", ExpectedIDs: []int{2, 3}},
		{Name: "native_date_equals", Query: "event_day = '2026-04-06'", ExpectedIDs: []int{1}},
		{Name: "native_date_range", Query: "event_day > '2026-04-05' and event_day <= '2026-04-07'", ExpectedIDs: []int{1, 2}},
		{Name: "native_date_in_list", Query: "event_day in ['2026-04-05', '2026-04-07']", ExpectedIDs: []int{2, 3}},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.Name, func(t *testing.T) {
			r := testResult{
				Kind:        "where",
				Database:    "matcher",
				Name:        "datetime/" + tc.Name,
				FlyQL:       tc.Query,
				SQL:         "(in-memory, native types)",
				ExpectedIDs: tc.ExpectedIDs,
			}

			parsed, err := flyql.Parse(tc.Query)
			if err != nil {
				r.Error = err.Error()
				addResult(r)
				t.Fatalf("parse: %v", err)
			}
			evaluator := matcher.NewEvaluatorWithSchema(nil, "UTC", schema)
			var matchedIDs []int
			for _, row := range rows {
				ok, evalErr := evaluator.Evaluate(parsed.Root, matcher.NewRecord(row))
				if evalErr != nil {
					r.Error = evalErr.Error()
					addResult(r)
					t.Fatalf("evaluate: %v", evalErr)
				}
				if ok {
					if id, ok := row["id"].(float64); ok {
						matchedIDs = append(matchedIDs, int(id))
					}
				}
			}

			r.ReturnedIDs = matchedIDs
			r.Passed = idsMatch(tc.ExpectedIDs, matchedIDs)
			addResult(r)
			if !r.Passed {
				t.Errorf("query %q: expected %s, got %s", tc.Query, formatIDs(tc.ExpectedIDs), formatIDs(matchedIDs))
			}
		})
	}
}
