from typing import Any, List, Optional, Tuple
from flyql.core.exceptions import FlyqlError
from flyql.core.constants import VALID_KEY_VALUE_OPERATORS, Operator
from flyql.core.key import Key
from flyql.types import ValueType

INT64_MIN = -(2**63)
INT64_MAX = 2**63 - 1


def try_convert_to_number(
    value: str | int | float,
) -> Tuple[str | int | float, ValueType]:
    try:
        int_val = int(str(value))
        if INT64_MIN <= int_val <= INT64_MAX:
            return int_val, ValueType.INTEGER
        return int_val, ValueType.BIGINT
    except ValueError:
        pass
    try:
        return float(value), ValueType.FLOAT
    except ValueError:
        return value, ValueType.STRING


class Expression:
    def __init__(
        self,
        key: Key,
        operator: str,
        value: str | int | float,
        value_is_string: bool | None,
        values: Optional[List[Any]] = None,
        values_type: Optional[str] = None,
        value_type: Optional[ValueType] = None,
        values_types: Optional[List[ValueType]] = None,
    ) -> None:
        if operator not in VALID_KEY_VALUE_OPERATORS:
            raise FlyqlError(f"invalid operator: {operator}")

        if not key.segments:
            raise FlyqlError("emtpy key")

        self.key = key
        self.operator = operator
        self.values: Optional[List[Any]] = values
        self.values_type: Optional[str] = values_type
        self.values_types: Optional[List[ValueType]] = values_types

        if operator in (Operator.IN.value, Operator.NOT_IN.value):
            self.value: Any = None
            self.value_type: Optional[ValueType] = None
        elif not value_is_string:
            self.value, self.value_type = try_convert_to_number(value)
        else:
            self.value = value
            self.value_type = ValueType.STRING

        if value_type is not None:
            self.value_type = value_type

    def __str__(self) -> str:
        if self.operator in (Operator.IN.value, Operator.NOT_IN.value):
            return f"{self.key.raw} {self.operator} [{', '.join(str(v) for v in (self.values or []))}]"
        return f"{self.key.raw}{self.operator}{self.value}"
