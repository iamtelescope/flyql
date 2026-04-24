package columns

import (
	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/transformers"
)

// RendererDef defines the interface for post-alias renderer descriptors.
// Renderers describe display metadata; they are parsed and validated but
// never affect SQL or matcher output.
//
// Description returns a human-readable one-line description of the
// renderer. Implementations may return an empty string when no
// description is available.
type RendererDef interface {
	Name() string
	Description() string
	ArgSchema() []transformers.ArgSpec
	Metadata() map[string]any
	Diagnose(args []any, col ParsedColumn) []flyql.Diagnostic
}

// BaseRenderer is a convenience embedding base that provides default
// no-op Metadata and Diagnose methods. Embedders override Name() and
// ArgSchema() (and optionally Metadata/Diagnose).
type BaseRenderer struct{}

// Metadata returns an empty metadata map by default.
func (BaseRenderer) Metadata() map[string]any { return map[string]any{} }

// Description returns an empty description by default.
func (BaseRenderer) Description() string { return "" }

// Diagnose returns no diagnostics by default.
func (BaseRenderer) Diagnose(_ []any, _ ParsedColumn) []flyql.Diagnostic { return nil }
