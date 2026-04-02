NORMALIZED_TYPE_STRING = "string"
NORMALIZED_TYPE_INT = "int"
NORMALIZED_TYPE_FLOAT = "float"
NORMALIZED_TYPE_BOOL = "bool"
NORMALIZED_TYPE_DATE = "date"
NORMALIZED_TYPE_ARRAY = "array"
NORMALIZED_TYPE_JSON = "json"
NORMALIZED_TYPE_HSTORE = "hstore"

NORMALIZED_TYPE_TO_POSTGRESQL_TYPES = {
    NORMALIZED_TYPE_STRING: {
        "text",
        "varchar",
        "char",
        "character varying",
        "character",
        "name",
        "uuid",
        "citext",
        "inet",
        "cidr",
        "macaddr",
    },
    NORMALIZED_TYPE_INT: {
        "smallint",
        "integer",
        "bigint",
        "int2",
        "int4",
        "int8",
        "serial",
        "bigserial",
        "smallserial",
    },
    NORMALIZED_TYPE_FLOAT: {
        "real",
        "double precision",
        "numeric",
        "decimal",
        "float4",
        "float8",
        "money",
    },
    NORMALIZED_TYPE_BOOL: {
        "boolean",
        "bool",
    },
    NORMALIZED_TYPE_DATE: {
        "date",
        "timestamp",
        "timestamptz",
        "timestamp without time zone",
        "timestamp with time zone",
        "time",
        "timetz",
        "interval",
    },
    NORMALIZED_TYPE_JSON: {
        "jsonb",
        "json",
    },
    NORMALIZED_TYPE_HSTORE: {
        "hstore",
    },
}
