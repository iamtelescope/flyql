package flyql

import "github.com/iamtelescope/flyql/golang/transformers"

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
	MatchName      string // raw unescaped name for validator lookups; defaults to Name
}

// NewColumn creates a Column with sensible defaults. MatchName is set to name.
func NewColumn(name string, jsonString bool, typ string, normalizedType string) Column {
	return Column{
		Name:           name,
		JSONString:     jsonString,
		Type:           typ,
		NormalizedType: normalizedType,
		MatchName:      name,
	}
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
