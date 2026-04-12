package starrocks

import (
	"regexp"
	"strings"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/flyqltype"
)

var typeRegexes = map[flyqltype.Type]*regexp.Regexp{
	flyqltype.String: regexp.MustCompile(`(?i)^(varchar|char|string)\s*\(\s*\d+\s*\)`),
	flyqltype.Int:    regexp.MustCompile(`(?i)^(tinyint|smallint|int|largeint|bigint)\s*\(\s*\d+\s*\)`),
	flyqltype.Float:  regexp.MustCompile(`(?i)^(decimal|float|double)\d*\s*\(\s*\d+\s*(,\s*\d+)?\s*\)`),
	flyqltype.Date:   regexp.MustCompile(`(?i)^datetime`),
	flyqltype.Array:  regexp.MustCompile(`(?i)^array\s*<`),
	flyqltype.Map:    regexp.MustCompile(`(?i)^map\s*<`),
	flyqltype.Struct: regexp.MustCompile(`(?i)^struct\s*<`),
	flyqltype.JSON:   regexp.MustCompile(`(?i)^json`),
}

// flyqlTypeToStarRocksTypes is the lookup table for raw StarRocks DB type
// names. SR renames: special→unknown.
var flyqlTypeToStarRocksTypes = map[flyqltype.Type]map[string]bool{
	flyqltype.String: {
		"string": true, "varchar": true, "char": true,
		"binary": true, "varbinary": true,
	},
	flyqltype.Int: {
		"int": true, "tinyint": true, "smallint": true,
		"largeint": true, "bigint": true,
	},
	flyqltype.Float: {
		"float": true, "double": true, "decimal": true,
	},
	flyqltype.Bool: {
		"bool": true, "boolean": true,
	},
	flyqltype.Date: {
		"date": true, "datetime": true,
	},
	flyqltype.Unknown: {
		// SR catch-all "special" types — bitmap, hll — collapse into Unknown.
		"bitmap": true, "hll": true,
	},
	flyqltype.JSON: {
		"json": true,
	},
}

// NormalizeStarRocksType maps a raw StarRocks DB type string to its
// canonical flyql.Type. Unknown raw types map to flyqltype.Unknown.
func NormalizeStarRocksType(srType string) flyqltype.Type {
	if srType == "" {
		return flyqltype.Unknown
	}

	normalized := strings.ToLower(strings.TrimSpace(srType))

	if normalized == "jsonstring" {
		return flyqltype.JSONString
	}

	if typeRegexes[flyqltype.String].MatchString(normalized) {
		return flyqltype.String
	}
	if flyqlTypeToStarRocksTypes[flyqltype.String][normalized] {
		return flyqltype.String
	}

	if typeRegexes[flyqltype.Int].MatchString(normalized) {
		return flyqltype.Int
	}
	if flyqlTypeToStarRocksTypes[flyqltype.Int][normalized] {
		return flyqltype.Int
	}

	if typeRegexes[flyqltype.Float].MatchString(normalized) {
		return flyqltype.Float
	}
	if flyqlTypeToStarRocksTypes[flyqltype.Float][normalized] {
		return flyqltype.Float
	}

	if flyqlTypeToStarRocksTypes[flyqltype.Bool][normalized] {
		return flyqltype.Bool
	}

	if typeRegexes[flyqltype.Date].MatchString(normalized) {
		return flyqltype.Date
	}
	if flyqlTypeToStarRocksTypes[flyqltype.Date][normalized] {
		return flyqltype.Date
	}

	if typeRegexes[flyqltype.JSON].MatchString(normalized) {
		return flyqltype.JSON
	}
	if flyqlTypeToStarRocksTypes[flyqltype.JSON][normalized] {
		return flyqltype.JSON
	}

	if typeRegexes[flyqltype.Array].MatchString(normalized) {
		return flyqltype.Array
	}

	if typeRegexes[flyqltype.Map].MatchString(normalized) {
		return flyqltype.Map
	}

	if typeRegexes[flyqltype.Struct].MatchString(normalized) {
		return flyqltype.Struct
	}

	if flyqlTypeToStarRocksTypes[flyqltype.Unknown][normalized] {
		return flyqltype.Unknown
	}

	return flyqltype.Unknown
}

// Column is the opaque StarRocks-dialect column.
type Column struct {
	Name          string   `json:"name" yaml:"name"`
	RawIdentifier string   `json:"raw_identifier,omitempty" yaml:"raw_identifier,omitempty"`
	Values        []string `json:"values,omitempty" yaml:"values,omitempty"`
	DisplayName   string   `json:"display_name,omitempty" yaml:"display_name,omitempty"`

	rawType   string
	flyqlType flyqltype.Type
}

// RawType returns the raw StarRocks DB type string the column was
// constructed with. The primary dispatch input is FlyQLType.
func (c *Column) RawType() string { return c.rawType }

// FlyQLType returns the canonical flyql.Type for this column.
func (c *Column) FlyQLType() flyqltype.Type { return c.flyqlType }

// ColumnDef is the public input contract for constructing a Column.
type ColumnDef struct {
	Name          string   `json:"name" yaml:"name"`
	RawIdentifier string   `json:"raw_identifier,omitempty" yaml:"raw_identifier,omitempty"`
	Type          string   `json:"type" yaml:"type"`
	Values        []string `json:"values,omitempty" yaml:"values,omitempty"`
	DisplayName   string   `json:"display_name,omitempty" yaml:"display_name,omitempty"`
}

// NewColumn constructs a StarRocks Column from a ColumnDef.
func NewColumn(def ColumnDef) *Column {
	return &Column{
		Name:          def.Name,
		RawIdentifier: def.RawIdentifier,
		Values:        def.Values,
		DisplayName:   def.DisplayName,
		rawType:       def.Type,
		flyqlType:     NormalizeStarRocksType(def.Type),
	}
}

// ToFlyQLSchema bridges a slice of dialect Columns to a canonical
// flyql.ColumnSchema for use with the validator.
func ToFlyQLSchema(cols []*Column) *flyql.ColumnSchema {
	m := make(map[string]*flyql.Column, len(cols))
	for _, c := range cols {
		fc := flyql.NewColumn(c.Name, c.FlyQLType())
		m[c.Name] = &fc
	}
	return flyql.NewColumnSchema(m)
}
