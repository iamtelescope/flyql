from enum import Enum


class ValueType(str, Enum):
    INTEGER = "integer"
    BIGINT = "bigint"
    FLOAT = "float"
    STRING = "string"
    BOOLEAN = "boolean"
    NULL = "null"
    ARRAY = "array"
