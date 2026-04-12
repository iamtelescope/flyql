package clickhouse

import (
	"fmt"
	"regexp"
	"strings"
	"unicode"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/flyqltype"
)

var typeRegexes = map[flyqltype.Type]*regexp.Regexp{}

var wrapperRegex = regexp.MustCompile(`(?i)^(nullable|lowcardinality|simpleaggregatefunction|aggregatefunction)\s*\(\s*(.+)\)`)

func init() {
	typeRegexes[flyqltype.String] = regexp.MustCompile(`(?i)^(varchar|char|fixedstring)\s*\(\s*\d+\s*\)`)
	typeRegexes[flyqltype.Int] = regexp.MustCompile(`(?i)^(tinyint|smallint|mediumint|int|integer|bigint)\s*\(\s*\d+\s*\)`)
	typeRegexes[flyqltype.Float] = regexp.MustCompile(`(?i)^(decimal|numeric|dec)\d*\s*\(\s*\d+\s*(,\s*\d+)?\s*\)`)
	typeRegexes[flyqltype.Date] = regexp.MustCompile(`(?i)^datetime64\s*\(\s*\d+\s*(,\s*.+)?\s*\)`)
	typeRegexes[flyqltype.Array] = regexp.MustCompile(`(?i)^array\s*\(`)
	typeRegexes[flyqltype.Map] = regexp.MustCompile(`(?i)^map\s*\(`)
	typeRegexes[flyqltype.Struct] = regexp.MustCompile(`(?i)^tuple\s*\(`)
	typeRegexes[flyqltype.JSON] = regexp.MustCompile(`(?i)^json\s*\(`)
}

// flyqlTypeToClickHouseTypes is the lookup table for raw ClickHouse DB
// type names that don't require regex matching. The fly type "tuple"
// becomes flyqltype.Struct; "interval*" becomes flyqltype.Duration;
// geometry/special types collapse into flyqltype.Unknown.
var flyqlTypeToClickHouseTypes = map[flyqltype.Type]map[string]bool{
	flyqltype.String: {
		"string": true, "fixedstring": true, "longtext": true, "mediumtext": true,
		"tinytext": true, "text": true, "longblob": true, "mediumblob": true,
		"tinyblob": true, "blob": true, "varchar": true, "char": true,
		"char large object": true, "char varying": true, "character": true,
		"character large object": true, "character varying": true,
		"nchar large object": true, "nchar varying": true,
		"national character large object": true, "national character varying": true,
		"national char varying": true, "national character": true, "national char": true,
		"binary large object": true, "binary varying": true, "clob": true,
		"nchar": true, "nvarchar": true, "varchar2": true, "binary": true,
		"varbinary": true, "bytea": true, "uuid": true, "ipv4": true, "ipv6": true,
		"enum8": true, "enum16": true,
	},
	flyqltype.Int: {
		"int8": true, "int16": true, "int32": true, "int64": true, "int128": true, "int256": true,
		"uint8": true, "uint16": true, "uint32": true, "uint64": true, "uint128": true, "uint256": true,
		"tinyint": true, "smallint": true, "mediumint": true, "int": true, "integer": true, "bigint": true,
		"tinyint signed": true, "tinyint unsigned": true, "smallint signed": true, "smallint unsigned": true,
		"mediumint signed": true, "mediumint unsigned": true, "int signed": true, "int unsigned": true,
		"integer signed": true, "integer unsigned": true, "bigint signed": true, "bigint unsigned": true,
		"int1": true, "int1 signed": true, "int1 unsigned": true, "byte": true,
		"signed": true, "unsigned": true, "bit": true, "set": true, "time": true,
	},
	flyqltype.Float: {
		"float32": true, "float64": true, "float": true, "double": true,
		"double precision": true, "real": true, "decimal": true,
		"decimal32": true, "decimal64": true, "decimal128": true, "decimal256": true,
		"dec": true, "numeric": true, "fixed": true, "single": true,
	},
	flyqltype.Bool: {
		"bool": true, "boolean": true,
	},
	flyqltype.Date: {
		"date": true, "date32": true, "datetime": true, "datetime32": true,
		"datetime64": true, "timestamp": true, "year": true,
	},
	flyqltype.Duration: {
		"intervalday": true, "intervalhour": true, "intervalmicrosecond": true,
		"intervalmillisecond": true, "intervalminute": true, "intervalmonth": true,
		"intervalnanosecond": true, "intervalquarter": true, "intervalsecond": true,
		"intervalweek": true, "intervalyear": true,
	},
	flyqltype.Unknown: {
		// geometry types — no generator branches on them; classification only.
		"geometry": true, "point": true, "polygon": true,
		"multipolygon": true, "linestring": true, "ring": true,
		// special / catch-all types — never directly produced SQL.
		"nothing": true, "nested": true, "object": true, "dynamic": true, "variant": true,
	},
	flyqltype.JSON: {
		"json": true,
	},
}

// NormalizeClickHouseType maps a raw ClickHouse DB type string (as seen
// in DDL) to its canonical flyql.Type. Unknown raw types map to
// flyqltype.Unknown.
func NormalizeClickHouseType(chType string) flyqltype.Type {
	if chType == "" {
		return flyqltype.Unknown
	}

	normalized := strings.ToLower(strings.TrimSpace(chType))

	if normalized == "jsonstring" {
		return flyqltype.JSONString
	}

	if match := wrapperRegex.FindStringSubmatch(normalized); match != nil {
		normalized = strings.TrimSpace(match[2])
	}

	if typeRegexes[flyqltype.String].MatchString(normalized) {
		return flyqltype.String
	}
	if flyqlTypeToClickHouseTypes[flyqltype.String][normalized] {
		return flyqltype.String
	}

	if typeRegexes[flyqltype.Int].MatchString(normalized) {
		return flyqltype.Int
	}
	if flyqlTypeToClickHouseTypes[flyqltype.Int][normalized] {
		return flyqltype.Int
	}

	if typeRegexes[flyqltype.Float].MatchString(normalized) {
		return flyqltype.Float
	}
	if flyqlTypeToClickHouseTypes[flyqltype.Float][normalized] {
		return flyqltype.Float
	}

	if flyqlTypeToClickHouseTypes[flyqltype.Bool][normalized] {
		return flyqltype.Bool
	}

	if typeRegexes[flyqltype.Date].MatchString(normalized) {
		return flyqltype.Date
	}
	if flyqlTypeToClickHouseTypes[flyqltype.Date][normalized] {
		return flyqltype.Date
	}

	if typeRegexes[flyqltype.JSON].MatchString(normalized) {
		return flyqltype.JSON
	}
	if flyqlTypeToClickHouseTypes[flyqltype.JSON][normalized] {
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

	if flyqlTypeToClickHouseTypes[flyqltype.Unknown][normalized] {
		return flyqltype.Unknown
	}

	if flyqlTypeToClickHouseTypes[flyqltype.Duration][normalized] {
		return flyqltype.Duration
	}

	return flyqltype.Unknown
}

// Column is the opaque ClickHouse-dialect column. Construct via
// NewColumn(ColumnDef). Public surface is Name/RawIdentifier/Values/
// DisplayName plus the RawType() and FlyQLType() accessors.
type Column struct {
	Name string `json:"name" yaml:"name"`
	// RawIdentifier is the raw, unescaped column name as written by the
	// user (used for matcher/validator lookups). Defaults to Name.
	RawIdentifier string   `json:"raw_identifier,omitempty" yaml:"raw_identifier,omitempty"`
	Values        []string `json:"values,omitempty" yaml:"values,omitempty"`
	DisplayName   string   `json:"display_name,omitempty" yaml:"display_name,omitempty"`

	rawType   string
	flyqlType flyqltype.Type
}

// RawType returns the raw ClickHouse DB type string the column was
// constructed with (e.g. "Nullable(String)"). Generators may use it for
// finer-grained DDL inspection; the primary dispatch input is FlyQLType.
func (c *Column) RawType() string { return c.rawType }

// FlyQLType returns the canonical flyql.Type for this column. This is
// the primary dispatch input for generator code.
func (c *Column) FlyQLType() flyqltype.Type { return c.flyqlType }

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

// ColumnDef is the public input contract for constructing a Column.
type ColumnDef struct {
	Name          string   `json:"name" yaml:"name"`
	RawIdentifier string   `json:"raw_identifier,omitempty" yaml:"raw_identifier,omitempty"`
	Type          string   `json:"type" yaml:"type"`
	Values        []string `json:"values,omitempty" yaml:"values,omitempty"`
	DisplayName   string   `json:"display_name,omitempty" yaml:"display_name,omitempty"`
}

// NewColumn constructs a ClickHouse Column from a ColumnDef. The raw
// type is preserved verbatim and the flyql semantic type is computed
// via NormalizeClickHouseType.
func NewColumn(def ColumnDef) *Column {
	return &Column{
		Name:          escapeIdentifier(def.Name),
		RawIdentifier: def.RawIdentifier,
		Values:        def.Values,
		DisplayName:   def.DisplayName,
		rawType:       def.Type,
		flyqlType:     NormalizeClickHouseType(def.Type),
	}
}

// ToFlyQLSchema bridges a slice of dialect Columns to a canonical
// flyql.ColumnSchema for use with the validator. This replaces the
// hand-rolled flyql.NewColumn(...) pattern in test code and downstream
// callers.
func ToFlyQLSchema(cols []*Column) *flyql.ColumnSchema {
	m := make(map[string]*flyql.Column, len(cols))
	for _, c := range cols {
		fc := flyql.NewColumn(c.RawIdentifier, c.FlyQLType())
		if fc.MatchName == "" {
			fc.MatchName = c.Name
		}
		m[c.Name] = &fc
	}
	return flyql.NewColumnSchema(m)
}
