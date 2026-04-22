package matcher

import (
	"testing"
	"time"

	flyql "github.com/iamtelescope/flyql/golang"
)

func newDateTimeSchema(t *testing.T, raw map[string]any) *flyql.ColumnSchema {
	t.Helper()
	schema, err := flyql.FromPlainObject(raw)
	if err != nil {
		t.Fatalf("schema build: %v", err)
	}
	return schema
}

// TestNativeTimeValueDateTime covers Go's native time.Time flowing through
// the DateTime-typed schema path.
func TestNativeTimeValueDateTime(t *testing.T) {
	schema := newDateTimeSchema(t, map[string]any{
		"ts": map[string]any{"type": "datetime"},
	})
	result, err := flyql.Parse("ts > '2026-04-06T20:00:00Z'")
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	record := NewRecord(map[string]any{
		"ts": time.Date(2026, 4, 6, 21, 0, 0, 0, time.UTC),
	})
	evaluator := NewEvaluatorWithSchema(nil, "UTC", schema)
	got, err := evaluator.Evaluate(result.Root, record)
	if err != nil {
		t.Fatalf("evaluate: %v", err)
	}
	if !got {
		t.Errorf("native time.Time > '2026-04-06T20:00:00Z' should be true")
	}
}

func TestNativeTimeValueDateColumn(t *testing.T) {
	schema := newDateTimeSchema(t, map[string]any{
		"event_day": map[string]any{"type": "date"},
	})
	result, err := flyql.Parse("event_day > '2026-04-05'")
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	record := NewRecord(map[string]any{
		"event_day": time.Date(2026, 4, 6, 3, 0, 0, 0, time.UTC),
	})
	evaluator := NewEvaluatorWithSchema(nil, "UTC", schema)
	got, err := evaluator.Evaluate(result.Root, record)
	if err != nil {
		t.Fatalf("evaluate: %v", err)
	}
	if !got {
		t.Errorf("Date column truncates time.Time to day; 2026-04-06 > 2026-04-05 should be true")
	}
}

func TestEpochSecondsWithUnit(t *testing.T) {
	schema := newDateTimeSchema(t, map[string]any{
		"ts": map[string]any{"type": "datetime", "unit": "s"},
	})
	result, err := flyql.Parse("ts > '2020-01-01T00:00:00Z'")
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	// 1712434800 epoch seconds = 2024-04-06 21:00:00 UTC
	record := NewRecord(map[string]any{"ts": int64(1712434800)})
	evaluator := NewEvaluatorWithSchema(nil, "UTC", schema)
	got, err := evaluator.Evaluate(result.Root, record)
	if err != nil {
		t.Fatalf("evaluate: %v", err)
	}
	if !got {
		t.Errorf("epoch-seconds int with unit='s' > 2020-01-01 should be true")
	}
}

func TestTzCachePopulatesOnlyDistinctNames(t *testing.T) {
	schema := newDateTimeSchema(t, map[string]any{
		"ts": map[string]any{"type": "datetime", "tz": "Europe/Moscow"},
	})
	result, err := flyql.Parse("ts > '2026-01-01T00:00:00'")
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	evaluator := NewEvaluatorWithSchema(nil, "UTC", schema)
	for i := 0; i < 1000; i++ {
		record := NewRecord(map[string]any{"ts": "2026-04-06 12:00:00"})
		_, _ = evaluator.Evaluate(result.Root, record)
	}
	// Only Europe/Moscow should be resolved (the Evaluator default "UTC"
	// is never touched because the naive string goes via column.tz).
	if len(evaluator.tzCache) != 1 {
		t.Errorf("tzCache len=%d, want 1 (Europe/Moscow only)", len(evaluator.tzCache))
	}
}

func TestDSTFallBackExactMs(t *testing.T) {
	// AC 26: naive fall-back resolves to fold=0 (earlier, EDT).
	// Exact-ms parity with Python/JS — 2026-11-01 01:30 EDT = 1793511000000ms.
	schema := newDateTimeSchema(t, map[string]any{
		"ts": map[string]any{"type": "datetime", "tz": "America/New_York"},
	})
	evaluator := NewEvaluatorWithSchema(nil, "UTC", schema)
	col := schema.Get("ts")
	got, ok := evaluator.coerceToMillis("2026-11-01 01:30:00", col)
	if !ok {
		t.Fatalf("coerceToMillis returned !ok for fall-back naive string")
	}
	const want = int64(1793511000000)
	gotInt, _ := got.(int64)
	if gotInt != want {
		t.Errorf("DST fall-back ms mismatch: got %d, want %d", gotInt, want)
	}
}

func TestInvalidTimezoneDegradesToUTC(t *testing.T) {
	schema := newDateTimeSchema(t, map[string]any{
		"ts": map[string]any{"type": "datetime", "tz": "Not/A/Zone"},
	})
	result, err := flyql.Parse("ts > '2020-01-01T00:00:00'")
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	evaluator := NewEvaluatorWithSchema(nil, "UTC", schema)
	record := NewRecord(map[string]any{"ts": "2026-04-06 12:00:00"})
	got, err := evaluator.Evaluate(result.Root, record)
	if err != nil {
		t.Fatalf("evaluate: %v", err)
	}
	// Bad tz → fall back to UTC. Comparison should still work.
	if !got {
		t.Errorf("invalid tz should degrade to UTC, comparison 2026 > 2020 is true")
	}
}
