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
	Name           string
	Type           string
	Values         []string
	NormalizedType string
	IsArray        bool
	IsJSONB        bool
	IsHstore       bool
	// RawIdentifier, if set, is used as-is in generated SQL instead of
	// EscapeIdentifier(Name). Use this for table-qualified references
	// (e.g. "r.environment") when the column name would otherwise be
	// ambiguous across joined tables.
	RawIdentifier string
}

func NewColumn(name string, columnType string, values []string) *Column {
	normalizedType := NormalizePostgreSQLType(columnType)
	return &Column{
		Name:           name,
		Type:           columnType,
		Values:         values,
		NormalizedType: normalizedType,
		IsArray:        normalizedType == NormalizedTypeArray,
		IsJSONB:        normalizedType == NormalizedTypeJSON,
		IsHstore:       normalizedType == NormalizedTypeHstore,
	}
}

// WithRawIdentifier sets a table-qualified SQL expression used in place of
// the escaped column name. Returns the column for chaining.
func (c *Column) WithRawIdentifier(identifier string) *Column {
	c.RawIdentifier = identifier
	return c
}
