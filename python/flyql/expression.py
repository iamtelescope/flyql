from flyql.exceptions import FlyqlError
from flyql.constants import VALID_KEY_VALUE_OPERATORS


def try_convert_to_number(value: str) -> float | int:
    try:
        return float(value)
    except ValueError:
        try:
            return int(value)
        except ValueError:
            return value


class Expression:
    def __init__(
        self,
        key: str,
        operator: str,
        value: str,
        value_is_string: bool | None,
    ):
        if operator not in VALID_KEY_VALUE_OPERATORS:
            raise FlyqlError(f"invalid operator: {operator}")

        if not key:
            raise FlyqlError("emtpy key")

        self.key = key
        self.operator = operator
        if not value_is_string:
            self.value = try_convert_to_number(value)
        else:
            self.value = value

    def __str__(self):
        return f"{self.key}{self.operator}{self.value}"
