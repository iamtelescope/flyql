package matcher

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// TestMatcherEvaluatorNeverMentionsRenderer enforces the architectural
// invariant that matcher evaluation never references renderers.
// See tech-spec-column-renderers-api Decision 20.
func TestMatcherEvaluatorNeverMentionsRenderer(t *testing.T) {
	_, file, _, _ := runtime.Caller(0)
	evaluatorPath := filepath.Join(filepath.Dir(file), "evaluator.go")
	data, err := os.ReadFile(evaluatorPath)
	if err != nil {
		t.Fatalf("read evaluator.go: %v", err)
	}
	if strings.Contains(strings.ToLower(string(data)), "renderer") {
		t.Fatal("matcher/evaluator.go contains 'renderer' — renderers must NEVER reach the matcher")
	}
}
