package clickhouse

const (
	NormalizedTypeString   = "string"
	NormalizedTypeInt      = "int"
	NormalizedTypeFloat    = "float"
	NormalizedTypeBool     = "bool"
	NormalizedTypeDate     = "date"
	NormalizedTypeArray    = "array"
	NormalizedTypeMap      = "map"
	NormalizedTypeTuple    = "tuple"
	NormalizedTypeGeometry = "geometry"
	NormalizedTypeInterval = "interval"
	NormalizedTypeSpecial  = "special"
	NormalizedTypeJSON     = "json"
)

var normalizedTypeToClickHouseTypes = map[string]map[string]bool{
	NormalizedTypeString: {
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
	NormalizedTypeInt: {
		"int8": true, "int16": true, "int32": true, "int64": true, "int128": true, "int256": true,
		"uint8": true, "uint16": true, "uint32": true, "uint64": true, "uint128": true, "uint256": true,
		"tinyint": true, "smallint": true, "mediumint": true, "int": true, "integer": true, "bigint": true,
		"tinyint signed": true, "tinyint unsigned": true, "smallint signed": true, "smallint unsigned": true,
		"mediumint signed": true, "mediumint unsigned": true, "int signed": true, "int unsigned": true,
		"integer signed": true, "integer unsigned": true, "bigint signed": true, "bigint unsigned": true,
		"int1": true, "int1 signed": true, "int1 unsigned": true, "byte": true,
		"signed": true, "unsigned": true, "bit": true, "set": true, "time": true,
	},
	NormalizedTypeFloat: {
		"float32": true, "float64": true, "float": true, "double": true,
		"double precision": true, "real": true, "decimal": true,
		"decimal32": true, "decimal64": true, "decimal128": true, "decimal256": true,
		"dec": true, "numeric": true, "fixed": true, "single": true,
	},
	NormalizedTypeBool: {
		"bool": true, "boolean": true,
	},
	NormalizedTypeDate: {
		"date": true, "date32": true, "datetime": true, "datetime32": true,
		"datetime64": true, "timestamp": true, "year": true,
	},
	NormalizedTypeInterval: {
		"intervalday": true, "intervalhour": true, "intervalmicrosecond": true,
		"intervalmillisecond": true, "intervalminute": true, "intervalmonth": true,
		"intervalnanosecond": true, "intervalquarter": true, "intervalsecond": true,
		"intervalweek": true, "intervalyear": true,
	},
	NormalizedTypeGeometry: {
		"geometry": true, "point": true, "polygon": true,
		"multipolygon": true, "linestring": true, "ring": true,
	},
	NormalizedTypeSpecial: {
		"nothing": true, "nested": true, "object": true, "dynamic": true, "variant": true,
	},
	NormalizedTypeJSON: {
		"json": true,
	},
}
