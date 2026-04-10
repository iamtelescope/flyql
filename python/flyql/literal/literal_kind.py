"""Parser AST literal-kind enum (renamed from ``flyql.types.ValueType``)."""

from enum import Enum


class LiteralKind(str, Enum):
    """Kind of literal recorded on a parsed Expression."""

    INTEGER = "integer"
    BIGINT = "bigint"
    FLOAT = "float"
    STRING = "string"
    BOOLEAN = "boolean"
    NULL = "null"
    ARRAY = "array"
    COLUMN = "column"
    FUNCTION = "function"
    PARAMETER = "parameter"
