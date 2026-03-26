package postgresql

import (
	"regexp"
	"strings"
)

var typeRegexes = map[string]*regexp.Regexp{
	NormalizedTypeString: regexp.MustCompile(`(?i)^(varchar|char|character varying|character)\s*\(\s*\d+\s*\)`),
	NormalizedTypeFloat:  regexp.MustCompile(`(?i)^(numeric|decimal)\s*\(\s*\d+\s*(,\s*\d+)?\s*\)`),
	NormalizedTypeDate:   regexp.MustCompile(`(?i)^timestamp\s*\(\s*\d+\s*\)`),
	NormalizedTypeArray:  regexp.MustCompile(`(?i)(\[\]$|^_)`),
}

func NormalizePostgreSQLType(pgType string) string {
	if pgType == "" {
		return ""
	}

	normalized := strings.ToLower(strings.TrimSpace(pgType))

	if typeRegexes[NormalizedTypeArray].MatchString(normalized) {
		return NormalizedTypeArray
	}

	if typeRegexes[NormalizedTypeString].MatchString(normalized) {
		return NormalizedTypeString
	}
	if normalizedTypeToPostgreSQLTypes[NormalizedTypeString][normalized] {
		return NormalizedTypeString
	}

	if normalizedTypeToPostgreSQLTypes[NormalizedTypeInt][normalized] {
		return NormalizedTypeInt
	}

	if typeRegexes[NormalizedTypeFloat].MatchString(normalized) {
		return NormalizedTypeFloat
	}
	if normalizedTypeToPostgreSQLTypes[NormalizedTypeFloat][normalized] {
		return NormalizedTypeFloat
	}

	if normalizedTypeToPostgreSQLTypes[NormalizedTypeBool][normalized] {
		return NormalizedTypeBool
	}

	if typeRegexes[NormalizedTypeDate].MatchString(normalized) {
		return NormalizedTypeDate
	}
	if normalizedTypeToPostgreSQLTypes[NormalizedTypeDate][normalized] {
		return NormalizedTypeDate
	}

	if normalizedTypeToPostgreSQLTypes[NormalizedTypeJSON][normalized] {
		return NormalizedTypeJSON
	}

	if normalizedTypeToPostgreSQLTypes[NormalizedTypeHstore][normalized] {
		return NormalizedTypeHstore
	}

	return ""
}

type Column struct {
	Name           string   `json:"name" yaml:"name"`
	JSONString     bool     `json:"jsonstring" yaml:"jsonstring"`
	Type           string   `json:"type" yaml:"type"`
	Values         []string `json:"values,omitempty" yaml:"values,omitempty"`
	NormalizedType string   `json:"normalized_type" yaml:"normalized_type"`
	IsArray        bool     `json:"is_array" yaml:"is_array"`
	IsJSONB        bool     `json:"is_jsonb" yaml:"is_jsonb"`
	IsHstore       bool     `json:"is_hstore" yaml:"is_hstore"`
	// RawIdentifier, if set, is used as-is in generated SQL instead of
	// EscapeIdentifier(Name). Use this for table-qualified references
	// (e.g. "r.environment") when the column name would otherwise be
	// ambiguous across joined tables.
	RawIdentifier string `json:"raw_identifier,omitempty" yaml:"raw_identifier,omitempty"`
	DisplayName   string `json:"display_name,omitempty" yaml:"display_name,omitempty"`
}

type ColumnDef struct {
	Name          string   `json:"name" yaml:"name"`
	JSONString    bool     `json:"jsonstring" yaml:"jsonstring"`
	Type          string   `json:"type" yaml:"type"`
	Values        []string `json:"values,omitempty" yaml:"values,omitempty"`
	DisplayName   string   `json:"display_name,omitempty" yaml:"display_name,omitempty"`
	RawIdentifier string   `json:"raw_identifier,omitempty" yaml:"raw_identifier,omitempty"`
}

func NewColumn(def ColumnDef) *Column {
	normalizedType := NormalizePostgreSQLType(def.Type)
	return &Column{
		Name:           def.Name,
		JSONString:     def.JSONString,
		Type:           def.Type,
		Values:         def.Values,
		NormalizedType: normalizedType,
		IsArray:        normalizedType == NormalizedTypeArray,
		IsJSONB:        normalizedType == NormalizedTypeJSON,
		IsHstore:       normalizedType == NormalizedTypeHstore,
		RawIdentifier:  def.RawIdentifier,
		DisplayName:    def.DisplayName,
	}
}
