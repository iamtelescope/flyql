package starrocks

const (
	NormalizedTypeString  = "string"
	NormalizedTypeInt     = "int"
	NormalizedTypeFloat   = "float"
	NormalizedTypeBool    = "bool"
	NormalizedTypeDate    = "date"
	NormalizedTypeArray   = "array"
	NormalizedTypeMap     = "map"
	NormalizedTypeStruct  = "struct"
	NormalizedTypeSpecial = "special"
	NormalizedTypeJSON    = "json"
)

var normalizedTypeToStarRocksTypes = map[string]map[string]bool{
	NormalizedTypeString: {
		"string": true, "varchar": true, "char": true,
		"binary": true, "varbinary": true,
	},
	NormalizedTypeInt: {
		"int": true, "tinyint": true, "smallint": true,
		"largeint": true, "bigint": true,
	},
	NormalizedTypeFloat: {
		"float": true, "double": true, "decimal": true,
	},
	NormalizedTypeBool: {
		"bool": true, "boolean": true,
	},
	NormalizedTypeDate: {
		"date": true, "datetime": true,
	},
	NormalizedTypeSpecial: {
		"bitmap": true, "hll": true,
	},
	NormalizedTypeJSON: {
		"json": true,
	},
}
