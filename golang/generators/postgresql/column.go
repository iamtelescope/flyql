package postgresql

import (
	"regexp"
	"strings"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/flyqltype"
)

var typeRegexes = map[flyqltype.Type]*regexp.Regexp{
	flyqltype.String: regexp.MustCompile(`(?i)^(varchar|char|character varying|character)\s*\(\s*\d+\s*\)`),
	flyqltype.Float:  regexp.MustCompile(`(?i)^(numeric|decimal)\s*\(\s*\d+\s*(,\s*\d+)?\s*\)`),
	flyqltype.Date:   regexp.MustCompile(`(?i)^timestamp\s*\(\s*\d+\s*\)`),
	flyqltype.Array:  regexp.MustCompile(`(?i)(\[\]$|^_)`),
}

// flyqlTypeToPostgreSQLTypes is the lookup table for raw PostgreSQL DB
// type names. PG renames: jsonb→json, hstore→map, interval→duration.
var flyqlTypeToPostgreSQLTypes = map[flyqltype.Type]map[string]bool{
	flyqltype.String: {
		"text": true, "varchar": true, "char": true,
		"character varying": true, "character": true, "name": true,
		"uuid": true, "citext": true, "inet": true, "cidr": true, "macaddr": true,
	},
	flyqltype.Int: {
		"smallint": true, "integer": true, "bigint": true,
		"int2": true, "int4": true, "int8": true,
		"serial": true, "bigserial": true, "smallserial": true,
	},
	flyqltype.Float: {
		"real": true, "double precision": true, "numeric": true,
		"decimal": true, "float4": true, "float8": true, "money": true,
	},
	flyqltype.Bool: {
		"boolean": true, "bool": true,
	},
	flyqltype.Date: {
		"date": true, "timestamp": true, "timestamptz": true,
		"timestamp without time zone": true, "timestamp with time zone": true,
		"time": true, "timetz": true,
	},
	flyqltype.Duration: {
		"interval": true,
	},
	flyqltype.JSON: {
		"jsonb": true, "json": true,
	},
	flyqltype.Map: {
		"hstore": true,
	},
}

// NormalizePostgreSQLType maps a raw PostgreSQL DB type string to its
// canonical flyql.Type. Unknown raw types map to flyqltype.Unknown.
func NormalizePostgreSQLType(pgType string) flyqltype.Type {
	if pgType == "" {
		return flyqltype.Unknown
	}

	normalized := strings.ToLower(strings.TrimSpace(pgType))

	if normalized == "jsonstring" {
		return flyqltype.JSONString
	}

	if typeRegexes[flyqltype.Array].MatchString(normalized) {
		return flyqltype.Array
	}

	if typeRegexes[flyqltype.String].MatchString(normalized) {
		return flyqltype.String
	}
	if flyqlTypeToPostgreSQLTypes[flyqltype.String][normalized] {
		return flyqltype.String
	}

	if flyqlTypeToPostgreSQLTypes[flyqltype.Int][normalized] {
		return flyqltype.Int
	}

	if typeRegexes[flyqltype.Float].MatchString(normalized) {
		return flyqltype.Float
	}
	if flyqlTypeToPostgreSQLTypes[flyqltype.Float][normalized] {
		return flyqltype.Float
	}

	if flyqlTypeToPostgreSQLTypes[flyqltype.Bool][normalized] {
		return flyqltype.Bool
	}

	if typeRegexes[flyqltype.Date].MatchString(normalized) {
		return flyqltype.Date
	}
	if flyqlTypeToPostgreSQLTypes[flyqltype.Date][normalized] {
		return flyqltype.Date
	}

	if flyqlTypeToPostgreSQLTypes[flyqltype.Duration][normalized] {
		return flyqltype.Duration
	}

	if flyqlTypeToPostgreSQLTypes[flyqltype.JSON][normalized] {
		return flyqltype.JSON
	}

	if flyqlTypeToPostgreSQLTypes[flyqltype.Map][normalized] {
		return flyqltype.Map
	}

	return flyqltype.Unknown
}

// Column is the opaque PostgreSQL-dialect column. Construct via
// NewColumn(ColumnDef). Public surface is Name/RawIdentifier/
// Values/DisplayName plus the RawType() and FlyQLType() accessors.
type Column struct {
	Name        string   `json:"name" yaml:"name"`
	Values      []string `json:"values,omitempty" yaml:"values,omitempty"`
	DisplayName string   `json:"display_name,omitempty" yaml:"display_name,omitempty"`
	// RawIdentifier, if set, is used as-is in generated SQL instead of
	// EscapeIdentifier(Name). Use this for table-qualified references.
	RawIdentifier string `json:"raw_identifier,omitempty" yaml:"raw_identifier,omitempty"`

	rawType   string
	flyqlType flyqltype.Type
}

// RawType returns the raw PostgreSQL DB type string the column was
// constructed with. The primary dispatch input is FlyQLType.
func (c *Column) RawType() string { return c.rawType }

// FlyQLType returns the canonical flyql.Type for this column.
func (c *Column) FlyQLType() flyqltype.Type { return c.flyqlType }

// ColumnDef is the public input contract for constructing a Column.
type ColumnDef struct {
	Name          string   `json:"name" yaml:"name"`
	Type          string   `json:"type" yaml:"type"`
	Values        []string `json:"values,omitempty" yaml:"values,omitempty"`
	DisplayName   string   `json:"display_name,omitempty" yaml:"display_name,omitempty"`
	RawIdentifier string   `json:"raw_identifier,omitempty" yaml:"raw_identifier,omitempty"`
}

// NewColumn constructs a PostgreSQL Column from a ColumnDef.
func NewColumn(def ColumnDef) *Column {
	return &Column{
		Name:          def.Name,
		Values:        def.Values,
		DisplayName:   def.DisplayName,
		RawIdentifier: def.RawIdentifier,
		rawType:       def.Type,
		flyqlType:     NormalizePostgreSQLType(def.Type),
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
