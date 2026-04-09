package flyql

import (
	"strings"

	"github.com/iamtelescope/flyql/golang/transformers"
)

// Column is the core column type used by the validator. Dialect-specific
// generators have their own Column structs; to feed them into Diagnose(),
// create a flyql.Column with the appropriate MatchName.
type Column struct {
	Name           string
	JSONString     bool
	Type           string
	NormalizedType string
	Values         []string
	DisplayName    string
	RawIdentifier  string
	MatchName      string             // raw unescaped name for validator lookups; defaults to Name
	Suggest        bool               // whether this column appears in suggestions; defaults to true
	Children       map[string]*Column // nested child columns; nil means flat (leaf) column
}

// IsNested returns true if this column has children.
func (c *Column) IsNested() bool {
	return c.Children != nil
}

// NewColumn creates a Column with sensible defaults. MatchName is set to name.
// Suggest defaults to true.
func NewColumn(name string, jsonString bool, typ string, normalizedType string) Column {
	return Column{
		Name:           name,
		JSONString:     jsonString,
		Type:           typ,
		NormalizedType: normalizedType,
		MatchName:      name,
		Suggest:        true,
	}
}

// NewNestedColumn creates a Column with children. Suggest defaults to true.
func NewNestedColumn(name string, typ string, normalizedType string, children map[string]*Column) Column {
	return Column{
		Name:           name,
		Type:           typ,
		NormalizedType: normalizedType,
		MatchName:      name,
		Suggest:        true,
		Children:       children,
	}
}

// ColumnSchema wraps a set of columns with case-insensitive lookup and
// nested path resolution.
type ColumnSchema struct {
	columns     map[string]*Column // original-cased
	byLowerName map[string]*Column // lowercased keys for O(1) lookup
}

// NewColumnSchema builds a ColumnSchema from a map of columns (original-cased keys).
func NewColumnSchema(columns map[string]*Column) *ColumnSchema {
	cs := &ColumnSchema{
		columns:     columns,
		byLowerName: make(map[string]*Column, len(columns)),
	}
	for k, v := range columns {
		cs.byLowerName[strings.ToLower(k)] = v
		if v != nil && v.Children != nil {
			lowercaseChildren(v)
		}
	}
	return cs
}

// lowercaseChildren recursively builds lowercased lookup maps for children.
// Children maps on each Column are replaced with lowercased keys.
func lowercaseChildren(col *Column) {
	if col.Children == nil {
		return
	}
	lowered := make(map[string]*Column, len(col.Children))
	for k, child := range col.Children {
		lowered[strings.ToLower(k)] = child
		if child != nil && child.Children != nil {
			lowercaseChildren(child)
		}
	}
	col.Children = lowered
}

// Columns returns the original-cased column map.
func (cs *ColumnSchema) Columns() map[string]*Column {
	return cs.columns
}

// Get performs a case-insensitive single-level lookup.
func (cs *ColumnSchema) Get(name string) *Column {
	return cs.byLowerName[strings.ToLower(name)]
}

// Resolve walks the nested column tree by segments (case-insensitive).
// Returns nil if any segment is unresolvable. Does NOT filter by Suggest.
func (cs *ColumnSchema) Resolve(segments []string) *Column {
	if len(segments) == 0 {
		return nil
	}
	col := cs.byLowerName[strings.ToLower(segments[0])]
	if col == nil {
		return nil
	}
	for i := 1; i < len(segments); i++ {
		if col.Children == nil {
			return nil
		}
		col = col.Children[strings.ToLower(segments[i])]
		if col == nil {
			return nil
		}
	}
	return col
}

// FromColumns builds a ColumnSchema from a flat Column slice, keyed by MatchName.
// On duplicate MatchNames, the first occurrence wins (matches prior validator behavior).
func FromColumns(columns []Column) *ColumnSchema {
	m := make(map[string]*Column, len(columns))
	for i := len(columns) - 1; i >= 0; i-- {
		m[columns[i].MatchName] = &columns[i]
	}
	return NewColumnSchema(m)
}

// FromPlainObject recursively converts a map[string]interface{} (e.g. from JSON)
// into a ColumnSchema. Each value should be a map with optional keys:
// "type", "children", "suggest", "values".
func FromPlainObject(obj map[string]any) *ColumnSchema {
	m := make(map[string]*Column, len(obj))
	for name, raw := range obj {
		col := columnFromPlainObject(name, raw)
		if col != nil {
			m[name] = col
		}
	}
	return NewColumnSchema(m)
}

func columnFromPlainObject(name string, raw any) *Column {
	dict, ok := raw.(map[string]any)
	if !ok {
		return nil
	}
	col := &Column{
		Name:      name,
		MatchName: name,
		Suggest:   true,
	}
	if t, ok := dict["type"].(string); ok {
		col.Type = t
	}
	if nt, ok := dict["normalized_type"].(string); ok {
		col.NormalizedType = nt
	}
	if s, ok := dict["suggest"].(bool); ok {
		col.Suggest = s
	}
	if vals, ok := dict["values"].([]any); ok {
		for _, v := range vals {
			if s, ok := v.(string); ok {
				col.Values = append(col.Values, s)
			}
		}
	}
	if children, ok := dict["children"].(map[string]any); ok {
		col.Children = make(map[string]*Column, len(children))
		for childName, childRaw := range children {
			child := columnFromPlainObject(childName, childRaw)
			if child != nil {
				col.Children[childName] = child
			}
		}
	}
	return col
}

// NormalizedToTransformerType maps a normalized column type string to
// the corresponding TransformerType. Returns false if unmapped.
func NormalizedToTransformerType(s string) (transformers.TransformerType, bool) {
	switch s {
	case "string":
		return transformers.TransformerTypeString, true
	case "int":
		return transformers.TransformerTypeInt, true
	case "float":
		return transformers.TransformerTypeFloat, true
	case "bool":
		return transformers.TransformerTypeBool, true
	case "array":
		return transformers.TransformerTypeArray, true
	default:
		return "", false
	}
}
