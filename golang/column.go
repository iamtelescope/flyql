package flyql

import (
	"fmt"
	"strings"
)

// Column is the canonical, schema-aware column type used by the validator
// and other consumers that need to reason about column type information
// independently of any specific dialect. Dialect-specific generators have
// their own opaque Column structs (clickhouse.Column, postgresql.Column,
// starrocks.Column); use the dialect's ToFlyQLSchema helper to bridge
// from a dialect column slice to a flyql.ColumnSchema.
type Column struct {
	Name          string
	Type          Type
	Values        []string
	DisplayName   string
	RawIdentifier string
	MatchName     string             // raw unescaped name for validator lookups; defaults to Name
	Suggest       bool               // whether this column appears in suggestions; defaults to true
	Children      map[string]*Column // nested child columns; nil means flat (leaf) column
	TZ            string             // IANA timezone name used when coercing naive datetime strings on this column (Date/DateTime only); empty = inherit Evaluator default
	Unit          string             // numeric-value unit for DateTime columns: "ms" (default), "s", or "ns"; ignored for non-numeric values
}

// IsNested returns true if this column has children.
func (c *Column) IsNested() bool {
	return c.Children != nil
}

// NewColumn creates a Column with sensible defaults. MatchName is set to
// name. Suggest defaults to true.
func NewColumn(name string, t Type) Column {
	return Column{
		Name:      name,
		Type:      t,
		MatchName: name,
		Suggest:   true,
	}
}

// NewNestedColumn creates a Column with children. Suggest defaults to true.
func NewNestedColumn(name string, t Type, children map[string]*Column) Column {
	return Column{
		Name:      name,
		Type:      t,
		MatchName: name,
		Suggest:   true,
		Children:  children,
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

// validFlyQLTypes is the set of accepted lowercase tokens for ParseType.
// Keep in sync with flyqltype.Type.
var validFlyQLTypes = map[string]Type{
	"string":     TypeString,
	"int":        TypeInt,
	"float":      TypeFloat,
	"bool":       TypeBool,
	"date":       TypeDate,
	"datetime":   TypeDateTime,
	"duration":   TypeDuration,
	"array":      TypeArray,
	"map":        TypeMap,
	"struct":     TypeStruct,
	"json":       TypeJSON,
	"jsonstring": TypeJSONString,
	"unknown":    TypeUnknown,
}

// ParseType strictly parses a string into a flyql.Type. It returns an
// error for any value that is not one of the 11 valid lowercase tokens.
// Strict-mode parsing is mandatory: a lenient fallback to TypeUnknown
// would silently corrupt downstream consumers (validator, generators).
// See the unify-column-type-system spec, Tech Decision #21.
func ParseType(s string) (Type, error) {
	if t, ok := validFlyQLTypes[s]; ok {
		return t, nil
	}
	return TypeUnknown, fmt.Errorf("unknown flyql type: %q", s)
}

// FromPlainObject recursively converts a map[string]interface{} (e.g.
// from JSON) into a ColumnSchema. Each value should be a map with
// optional keys: "type", "children", "suggest", "values", "jsonstring".
//
// Strict mode: an unknown value for "type" returns an error. The legacy
// key "normalized_type" is detected and returns a targeted migration
// error pointing at docs.flyql.dev/advanced/column-types.
func FromPlainObject(obj map[string]any) (*ColumnSchema, error) {
	m := make(map[string]*Column, len(obj))
	for name, raw := range obj {
		col, err := columnFromPlainObject(name, raw)
		if err != nil {
			return nil, err
		}
		if col != nil {
			m[name] = col
		}
	}
	return NewColumnSchema(m), nil
}

func columnFromPlainObject(name string, raw any) (*Column, error) {
	dict, ok := raw.(map[string]any)
	if !ok {
		return nil, nil
	}
	if _, hasLegacy := dict["normalized_type"]; hasLegacy {
		return nil, fmt.Errorf(
			"column %q: %q field has been renamed to %q in canonical column JSON; see migration guide at docs.flyql.dev/advanced/column-types",
			name, "normalized_type", "type",
		)
	}
	if _, hasJSONString := dict["jsonstring"]; hasJSONString {
		return nil, fmt.Errorf(
			"column %q: the 'jsonstring' boolean field has been removed; declare the column with \"type\": \"jsonstring\" instead; see migration guide at docs.flyql.dev/advanced/column-types",
			name,
		)
	}
	col := &Column{
		Name:      name,
		MatchName: name,
		Suggest:   true,
		Type:      TypeUnknown,
	}
	if t, ok := dict["type"].(string); ok {
		parsed, err := ParseType(t)
		if err != nil {
			return nil, fmt.Errorf("column %q: %w", name, err)
		}
		col.Type = parsed
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
			child, err := columnFromPlainObject(childName, childRaw)
			if err != nil {
				return nil, err
			}
			if child != nil {
				col.Children[childName] = child
			}
		}
	}
	if tz, ok := dict["tz"].(string); ok {
		col.TZ = tz
	}
	if unit, ok := dict["unit"].(string); ok {
		col.Unit = unit
	}
	return col, nil
}

// AsPlainObject serializes a Column to a map shape that round-trips through
// columnFromPlainObject. Empty-valued optional fields (TZ, Unit, empty
// Values, nil Children, etc.) are omitted so the output stays minimal.
func (c *Column) AsPlainObject() map[string]any {
	result := map[string]any{"type": string(c.Type)}
	if len(c.Values) > 0 {
		vals := make([]any, len(c.Values))
		for i, v := range c.Values {
			vals[i] = v
		}
		result["values"] = vals
	}
	if c.DisplayName != "" {
		result["display_name"] = c.DisplayName
	}
	if c.RawIdentifier != "" {
		result["raw_identifier"] = c.RawIdentifier
	}
	if c.MatchName != "" && c.MatchName != c.Name {
		result["match_name"] = c.MatchName
	}
	if !c.Suggest {
		result["suggest"] = c.Suggest
	}
	if c.Children != nil {
		children := make(map[string]any, len(c.Children))
		for k, child := range c.Children {
			if child != nil {
				children[k] = child.AsPlainObject()
			}
		}
		result["children"] = children
	}
	if c.TZ != "" {
		result["tz"] = c.TZ
	}
	if c.Unit != "" {
		result["unit"] = c.Unit
	}
	return result
}
