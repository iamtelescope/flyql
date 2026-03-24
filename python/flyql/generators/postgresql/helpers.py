from typing import Any, List

from flyql.core.exceptions import FlyqlError
from flyql.generators.postgresql.constants import (
    NORMALIZED_TYPE_STRING,
    NORMALIZED_TYPE_INT,
    NORMALIZED_TYPE_FLOAT,
    NORMALIZED_TYPE_BOOL,
    NORMALIZED_TYPE_DATE,
)

FORBIDDEN_OPERATIONS = {
    (NORMALIZED_TYPE_STRING, "<", "int"),
    (NORMALIZED_TYPE_STRING, "<", "float"),
    (NORMALIZED_TYPE_STRING, ">", "int"),
    (NORMALIZED_TYPE_STRING, ">", "float"),
    (NORMALIZED_TYPE_STRING, ">=", "int"),
    (NORMALIZED_TYPE_STRING, ">=", "float"),
    (NORMALIZED_TYPE_STRING, "<=", "int"),
    (NORMALIZED_TYPE_STRING, "<=", "float"),
    (NORMALIZED_TYPE_INT, "~", "string"),
    (NORMALIZED_TYPE_FLOAT, "~", "string"),
    (NORMALIZED_TYPE_INT, "!~", "string"),
    (NORMALIZED_TYPE_FLOAT, "!~", "string"),
    (NORMALIZED_TYPE_BOOL, "<", "bool"),
    (NORMALIZED_TYPE_BOOL, ">", "bool"),
    (NORMALIZED_TYPE_BOOL, ">=", "bool"),
    (NORMALIZED_TYPE_BOOL, "<=", "bool"),
}


def get_value_type(value: Any) -> str:
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, int):
        return "int"
    if isinstance(value, float):
        return "float"
    if isinstance(value, str):
        return "string"
    return ""


def validate_operation(value: Any, column_normalized_type: str, operator: str) -> None:
    if not column_normalized_type:
        return
    key = (column_normalized_type, operator, get_value_type(value))
    if key in FORBIDDEN_OPERATIONS:
        raise FlyqlError(
            f"operation not allowed: {column_normalized_type} column with '{operator}' operator"
        )


IN_COMPATIBLE_TYPES = {
    NORMALIZED_TYPE_STRING: {"string"},
    NORMALIZED_TYPE_INT: {"int", "float"},
    NORMALIZED_TYPE_FLOAT: {"int", "float"},
    NORMALIZED_TYPE_BOOL: {"bool", "int"},
    NORMALIZED_TYPE_DATE: {"string"},
}


def validate_in_list_types(values: List[Any], column_normalized_type: str) -> None:
    if not column_normalized_type:
        return
    if not values:
        return
    allowed = IN_COMPATIBLE_TYPES.get(column_normalized_type)
    if allowed is None:
        return
    for value in values:
        vtype = get_value_type(value)
        if vtype and vtype not in allowed:
            raise FlyqlError(
                f"type mismatch in IN list: {column_normalized_type} column cannot contain {vtype} values"
            )
