from dataclasses import dataclass, field
from typing import Any, List, Optional, Tuple
from flyql.core.exceptions import FlyqlError
from flyql.core.constants import VALID_KEY_VALUE_OPERATORS, Operator
from flyql.core.key import Key
from flyql.core.range import Range
from flyql.literal import LiteralKind


@dataclass
class Duration:
    value: int
    unit: str


@dataclass
class FunctionCall:
    name: str
    duration_args: list["Duration"] = field(default_factory=list)
    unit: str = ""
    timezone: str = ""
    parameter_args: list["Parameter"] = field(default_factory=list)


@dataclass
class Parameter:
    name: str
    positional: bool


INT64_MIN = -(2**63)
INT64_MAX = 2**63 - 1


def convert_unquoted_value(
    value: str | int | float,
) -> Tuple[str | int | float, LiteralKind]:
    try:
        int_val = int(str(value))
        if INT64_MIN <= int_val <= INT64_MAX:
            return int_val, LiteralKind.INTEGER
        return int_val, LiteralKind.BIGINT
    except ValueError:
        pass
    try:
        return float(value), LiteralKind.FLOAT
    except ValueError:
        return value, LiteralKind.COLUMN


class Expression:
    def __init__(
        self,
        key: Key,
        operator: str,
        value: "str | int | float | bool | None | FunctionCall | Parameter",
        value_is_string: bool | None,
        range: Optional[Range] = None,
        operator_range: Optional[Range] = None,
        value_range: Optional[Range] = None,
        value_ranges: Optional[List[Range]] = None,
        values: Optional[List[Any]] = None,
        values_type: Optional[str] = None,
        value_type: Optional[LiteralKind] = None,
        values_types: Optional[List[LiteralKind]] = None,
    ) -> None:
        if operator not in VALID_KEY_VALUE_OPERATORS:
            raise FlyqlError(f"invalid operator: {operator}")

        if not key.segments:
            raise FlyqlError("empty key")

        self.key = key
        self.operator = operator
        self.values: Optional[List[Any]] = values
        self.values_type: Optional[str] = values_type
        self.values_types: Optional[List[LiteralKind]] = values_types
        self.range = range if range is not None else Range(0, 0)
        self.operator_range = operator_range
        self.value_range = value_range
        self.value_ranges = value_ranges

        if value_type is not None:
            self.value: Any = value
            self.value_type: Optional[LiteralKind] = value_type
        elif operator in (Operator.IN.value, Operator.NOT_IN.value):
            self.value = None
            self.value_type = None
        elif (
            not value_is_string
            and value is not None
            and not isinstance(value, (FunctionCall, Parameter))
        ):
            self.value, self.value_type = convert_unquoted_value(value)
        else:
            self.value = value
            self.value_type = LiteralKind.STRING

    def __str__(self) -> str:
        if self.operator in (Operator.IN.value, Operator.NOT_IN.value):
            return f"{self.key.raw} {self.operator} [{', '.join(str(v) for v in (self.values or []))}]"
        display_value = "null" if self.value is None else self.value
        return f"{self.key.raw}{self.operator}{display_value}"
