package clickhouse

import (
	"fmt"
	"regexp"
	"strings"
	"unicode"
)

var typeRegexes = map[string]*regexp.Regexp{
	"wrapper":            regexp.MustCompile(`(?i)^(nullable|lowcardinality|simpleaggregatefunction|aggregatefunction)\s*\(\s*(.+)\s*\)`),
	NormalizedTypeString: regexp.MustCompile(`(?i)^(varchar|char|fixedstring)\s*\(\s*\d+\s*\)`),
	NormalizedTypeInt:    regexp.MustCompile(`(?i)^(tinyint|smallint|mediumint|int|integer|bigint)\s*\(\s*\d+\s*\)`),
	NormalizedTypeFloat:  regexp.MustCompile(`(?i)^(decimal|numeric|dec)\d*\s*\(\s*\d+\s*(,\s*\d+)?\s*\)`),
	NormalizedTypeDate:   regexp.MustCompile(`(?i)^datetime64\s*\(\s*\d+\s*(,\s*.+)?\s*\)`),
	NormalizedTypeArray:  regexp.MustCompile(`(?i)^array\s*\(`),
	NormalizedTypeMap:    regexp.MustCompile(`(?i)^map\s*\(`),
	NormalizedTypeTuple:  regexp.MustCompile(`(?i)^tuple\s*\(`),
	NormalizedTypeJSON:   regexp.MustCompile(`(?i)^json\s*\(`),
}

func NormalizeClickHouseType(chType string) string {
	if chType == "" {
		return ""
	}

	normalized := strings.ToLower(strings.TrimSpace(chType))

	if match := typeRegexes["wrapper"].FindStringSubmatch(normalized); match != nil {
		normalized = strings.TrimSpace(match[2])
	}

	if typeRegexes[NormalizedTypeString].MatchString(normalized) {
		return NormalizedTypeString
	}
	if normalizedTypeToClickHouseTypes[NormalizedTypeString][normalized] {
		return NormalizedTypeString
	}

	if typeRegexes[NormalizedTypeInt].MatchString(normalized) {
		return NormalizedTypeInt
	}
	if normalizedTypeToClickHouseTypes[NormalizedTypeInt][normalized] {
		return NormalizedTypeInt
	}

	if typeRegexes[NormalizedTypeFloat].MatchString(normalized) {
		return NormalizedTypeFloat
	}
	if normalizedTypeToClickHouseTypes[NormalizedTypeFloat][normalized] {
		return NormalizedTypeFloat
	}

	if normalizedTypeToClickHouseTypes[NormalizedTypeBool][normalized] {
		return NormalizedTypeBool
	}

	if typeRegexes[NormalizedTypeDate].MatchString(normalized) {
		return NormalizedTypeDate
	}
	if normalizedTypeToClickHouseTypes[NormalizedTypeDate][normalized] {
		return NormalizedTypeDate
	}

	if typeRegexes[NormalizedTypeJSON].MatchString(normalized) {
		return NormalizedTypeJSON
	}
	if normalizedTypeToClickHouseTypes[NormalizedTypeJSON][normalized] {
		return NormalizedTypeJSON
	}

	if typeRegexes[NormalizedTypeArray].MatchString(normalized) {
		return NormalizedTypeArray
	}

	if typeRegexes[NormalizedTypeMap].MatchString(normalized) {
		return NormalizedTypeMap
	}

	if typeRegexes[NormalizedTypeTuple].MatchString(normalized) {
		return NormalizedTypeTuple
	}

	if normalizedTypeToClickHouseTypes[NormalizedTypeGeometry][normalized] {
		return NormalizedTypeGeometry
	}

	if normalizedTypeToClickHouseTypes[NormalizedTypeInterval][normalized] {
		return NormalizedTypeInterval
	}

	if normalizedTypeToClickHouseTypes[NormalizedTypeSpecial][normalized] {
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
	IsJSON         bool
}

func escapeIdentifier(name string) string {
	needsQuoting := false
	for i, c := range name {
		if i == 0 && unicode.IsDigit(c) {
			needsQuoting = true
			break
		}
		if !unicode.IsLetter(c) && !unicode.IsDigit(c) && c != '_' {
			needsQuoting = true
			break
		}
	}
	if !needsQuoting {
		return name
	}
	escaped := strings.ReplaceAll(name, "`", "``")
	return fmt.Sprintf("`%s`", escaped)
}

func NewColumn(name string, jsonString bool, columnType string, values []string) *Column {
	normalizedType := NormalizeClickHouseType(columnType)
	return &Column{
		Name:           escapeIdentifier(name),
		JSONString:     jsonString,
		Type:           columnType,
		Values:         values,
		NormalizedType: normalizedType,
		IsMap:          normalizedType == NormalizedTypeMap,
		IsArray:        normalizedType == NormalizedTypeArray,
		IsJSON:         normalizedType == NormalizedTypeJSON,
	}
}
