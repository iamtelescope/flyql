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
	Name           string
	JSONString     bool
	Type           string
	Values         []string
	NormalizedType string
	IsMap          bool
	IsArray        bool
	IsStruct       bool
	IsJSON         bool
}

func NewColumn(name string, jsonString bool, columnType string, values []string) *Column {
	normalizedType := NormalizeStarRocksType(columnType)
	return &Column{
		Name:           name,
		JSONString:     jsonString,
		Type:           columnType,
		Values:         values,
		NormalizedType: normalizedType,
		IsMap:          normalizedType == NormalizedTypeMap,
		IsArray:        normalizedType == NormalizedTypeArray,
		IsStruct:       normalizedType == NormalizedTypeStruct,
		IsJSON:         normalizedType == NormalizedTypeJSON,
	}
}
