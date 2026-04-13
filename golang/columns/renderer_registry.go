package columns

import (
	"fmt"
	"sort"

	flyql "github.com/iamtelescope/flyql/golang"
)

// RendererDiagnoseHook is a registry-level chain diagnose hook.
type RendererDiagnoseHook func(col ParsedColumn, chain []Renderer) []flyql.Diagnostic

// RendererRegistry holds a collection of named renderers plus an optional
// chain-level diagnose hook for custom validation.
type RendererRegistry struct {
	renderers map[string]RendererDef
	diagnose  RendererDiagnoseHook
}

// Get returns the renderer with the given name, or nil if not found.
func (r *RendererRegistry) Get(name string) RendererDef {
	if r == nil || r.renderers == nil {
		return nil
	}
	return r.renderers[name]
}

// Register adds a renderer to the registry. Returns an error if a
// renderer with the same name is already registered.
func (r *RendererRegistry) Register(rend RendererDef) error {
	if r.renderers == nil {
		r.renderers = make(map[string]RendererDef)
	}
	if _, exists := r.renderers[rend.Name()]; exists {
		return fmt.Errorf("renderer '%s' is already registered", rend.Name())
	}
	r.renderers[rend.Name()] = rend
	return nil
}

// Names returns a sorted list of all registered renderer names.
func (r *RendererRegistry) Names() []string {
	if r == nil || r.renderers == nil {
		return []string{}
	}
	names := make([]string, 0, len(r.renderers))
	for name := range r.renderers {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

// SetDiagnose installs a chain-level diagnose hook. The hook is invoked
// after per-renderer built-in checks with (col, col.Renderers).
func (r *RendererRegistry) SetDiagnose(fn RendererDiagnoseHook) {
	r.diagnose = fn
}

// GetDiagnose returns the chain-level diagnose hook, or nil if none set.
func (r *RendererRegistry) GetDiagnose() RendererDiagnoseHook {
	if r == nil {
		return nil
	}
	return r.diagnose
}

// DefaultRendererRegistry returns an empty RendererRegistry. Unlike
// transformers, flyql ships no built-in renderers.
func DefaultRendererRegistry() *RendererRegistry {
	return &RendererRegistry{
		renderers: make(map[string]RendererDef),
	}
}
