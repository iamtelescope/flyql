package postgresql

const (
	NormalizedTypeString  = "string"
	NormalizedTypeInt     = "int"
	NormalizedTypeFloat   = "float"
	NormalizedTypeBool    = "bool"
	NormalizedTypeDate    = "date"
	NormalizedTypeArray   = "array"
	NormalizedTypeJSON    = "json"
	NormalizedTypeHstore  = "hstore"
	NormalizedTypeSpecial = "special"
)

var normalizedTypeToPostgreSQLTypes = map[string]map[string]bool{
	NormalizedTypeString: {
		"text": true, "varchar": true, "char": true,
		"character varying": true, "character": true, "name": true,
		"uuid": true, "citext": true, "inet": true, "cidr": true, "macaddr": true,
	},
	NormalizedTypeInt: {
		"smallint": true, "integer": true, "bigint": true,
		"int2": true, "int4": true, "int8": true,
		"serial": true, "bigserial": true, "smallserial": true,
	},
	NormalizedTypeFloat: {
		"real": true, "double precision": true, "numeric": true,
		"decimal": true, "float4": true, "float8": true, "money": true,
	},
	NormalizedTypeBool: {
		"boolean": true, "bool": true,
	},
	NormalizedTypeDate: {
		"date": true, "timestamp": true, "timestamptz": true,
		"timestamp without time zone": true, "timestamp with time zone": true,
		"time": true, "timetz": true, "interval": true,
	},
	NormalizedTypeJSON: {
		"jsonb": true, "json": true,
	},
	NormalizedTypeHstore: {
		"hstore": true,
	},
}
