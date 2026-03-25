package starrocks

import (
	"regexp"
	"strings"
)

var typeRegexes = map[string]*regexp.Regexp{
	NormalizedTypeString: regexp.MustCompile(`(?i)^(varchar|char|string)\s*\(\s*\d+\s*\)`),
	NormalizedTypeInt:    regexp.MustCompile(`(?i)^(tinyint|smallint|int|largeint|bigint)\s*\(\s*\d+\s*\)`),
	NormalizedTypeFloat:  regexp.MustCompile(`(?i)^(decimal|float|double)\d*\s*\(\s*\d+\s*(,\s*\d+)?\s*\)`),
	NormalizedTypeDate:   regexp.MustCompile(`(?i)^datetime`),
	NormalizedTypeArray:  regexp.MustCompile(`(?i)^array\s*<`),
	NormalizedTypeMap:    regexp.MustCompile(`(?i)^map\s*<`),
	NormalizedTypeStruct: regexp.MustCompile(`(?i)^struct\s*<`),
	NormalizedTypeJSON:   regexp.MustCompile(`(?i)^json`),
}

func NormalizeStarRocksType(srType string) string {
	if srType == "" {
		return ""
	}

	normalized := strings.ToLower(strings.TrimSpace(srType))

	if typeRegexes[NormalizedTypeString].MatchString(normalized) {
		return NormalizedTypeString
	}
	if normalizedTypeToStarRocksTypes[NormalizedTypeString][normalized] {
		return NormalizedTypeString
	}

	if typeRegexes[NormalizedTypeInt].MatchString(normalized) {
		return NormalizedTypeInt
	}
	if normalizedTypeToStarRocksTypes[NormalizedTypeInt][normalized] {
		return NormalizedTypeInt
	}

	if typeRegexes[NormalizedTypeFloat].MatchString(normalized) {
		return NormalizedTypeFloat
	}
	if normalizedTypeToStarRocksTypes[NormalizedTypeFloat][normalized] {
		return NormalizedTypeFloat
	}

	if normalizedTypeToStarRocksTypes[NormalizedTypeBool][normalized] {
		return NormalizedTypeBool
	}

	if typeRegexes[NormalizedTypeDate].MatchString(normalized) {
		return NormalizedTypeDate
	}
	if normalizedTypeToStarRocksTypes[NormalizedTypeDate][normalized] {
		return NormalizedTypeDate
	}

	if typeRegexes[NormalizedTypeJSON].MatchString(normalized) {
		return NormalizedTypeJSON
	}
	if normalizedTypeToStarRocksTypes[NormalizedTypeJSON][normalized] {
		return NormalizedTypeJSON
	}

	if typeRegexes[NormalizedTypeArray].MatchString(normalized) {
		return NormalizedTypeArray
	}

	if typeRegexes[NormalizedTypeMap].MatchString(normalized) {
		return NormalizedTypeMap
	}

	if typeRegexes[NormalizedTypeStruct].MatchString(normalized) {
		return NormalizedTypeStruct
	}

	if normalizedTypeToStarRocksTypes[NormalizedTypeSpecial][normalized] {
		return NormalizedTypeSpecial
	}

	return ""
}

type Column struct {
	Name           string   `json:"name" yaml:"name"`
	JSONString     bool     `json:"jsonstring" yaml:"jsonstring"`
	Type           string   `json:"type" yaml:"type"`
	Values         []string `json:"values,omitempty" yaml:"values,omitempty"`
	NormalizedType string   `json:"normalized_type" yaml:"normalized_type"`
	IsMap          bool     `json:"is_map" yaml:"is_map"`
	IsArray        bool     `json:"is_array" yaml:"is_array"`
	IsStruct       bool     `json:"is_struct" yaml:"is_struct"`
	IsJSON         bool     `json:"is_json" yaml:"is_json"`
	DisplayName    string   `json:"display_name,omitempty" yaml:"display_name,omitempty"`
}

type ColumnDef struct {
	Name        string   `json:"name" yaml:"name"`
	JSONString  bool     `json:"jsonstring" yaml:"jsonstring"`
	Type        string   `json:"type" yaml:"type"`
	Values      []string `json:"values,omitempty" yaml:"values,omitempty"`
	DisplayName string   `json:"display_name,omitempty" yaml:"display_name,omitempty"`
}

func NewColumn(def ColumnDef) *Column {
	normalizedType := NormalizeStarRocksType(def.Type)
	return &Column{
		Name:           def.Name,
		JSONString:     def.JSONString,
		Type:           def.Type,
		Values:         def.Values,
		NormalizedType: normalizedType,
		IsMap:          normalizedType == NormalizedTypeMap,
		IsArray:        normalizedType == NormalizedTypeArray,
		IsStruct:       normalizedType == NormalizedTypeStruct,
		IsJSON:         normalizedType == NormalizedTypeJSON,
		DisplayName:    def.DisplayName,
	}
}
