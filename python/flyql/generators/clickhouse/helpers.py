"""Validation helpers — column-type-keyed forbidden-op and IN-list checks."""

from typing import Any, List, Optional

from flyql.core.constants import Operator
from flyql.core.exceptions import FlyqlError
from flyql.flyql_type import Type


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


FORBIDDEN_OPERATIONS = {
    (Type.String, Operator.LOWER_THAN.value, "int"),
    (Type.String, Operator.LOWER_THAN.value, "float"),
    (Type.String, Operator.GREATER_THAN.value, "int"),
    (Type.String, Operator.GREATER_THAN.value, "float"),
    (Type.String, Operator.GREATER_OR_EQUALS_THAN.value, "int"),
    (Type.String, Operator.GREATER_OR_EQUALS_THAN.value, "float"),
    (Type.String, Operator.LOWER_OR_EQUALS_THAN.value, "int"),
    (Type.String, Operator.LOWER_OR_EQUALS_THAN.value, "float"),
    (Type.Int, Operator.REGEX.value, "string"),
    (Type.Float, Operator.REGEX.value, "string"),
    (Type.Int, Operator.NOT_REGEX.value, "string"),
    (Type.Float, Operator.NOT_REGEX.value, "string"),
    (Type.Bool, Operator.LOWER_THAN.value, "bool"),
    (Type.Bool, Operator.GREATER_THAN.value, "bool"),
    (Type.Bool, Operator.GREATER_OR_EQUALS_THAN.value, "bool"),
    (Type.Bool, Operator.LOWER_OR_EQUALS_THAN.value, "bool"),
}


IN_COMPATIBLE_TYPES = {
    Type.String: {"string"},
    Type.Int: {"int", "float"},
    Type.Float: {"int", "float"},
    Type.Bool: {"bool", "int"},
    Type.Date: {"string"},
}


def validate_operation(value: Any, column_type: Optional[Type], operator: str) -> None:
    if column_type is None or column_type == Type.Unknown:
        return

    if (column_type, operator, get_value_type(value)) in FORBIDDEN_OPERATIONS:
        raise FlyqlError(
            f"operation not allowed: {column_type} column with '{operator}' operator"
        )


def validate_in_list_types(values: List[Any], column_type: Optional[Type]) -> None:
    if column_type is None or column_type == Type.Unknown:
        return

    if not values:
        return

    allowed_types = IN_COMPATIBLE_TYPES.get(column_type)
    if allowed_types is None:
        return

    for value in values:
        value_type = get_value_type(value)
        if value_type and value_type not in allowed_types:
            raise FlyqlError(
                f"type mismatch in IN list: {column_type} column cannot contain {value_type} values"
            )
