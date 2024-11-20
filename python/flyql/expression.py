from flyql.exceptions import FlyqlError
from flyql.constants import VALID_KEY_VALUE_OPERATORS


class Expression:
    def __init__(
        self,
        key: str,
        operator: str,
        value: str,
    ):
        if operator not in VALID_KEY_VALUE_OPERATORS:
            raise FlyqlError(f"invalid operator: {operator}")

        if not key:
            raise FlyqlError("emtpy key")

        if not value:
            raise FlyqlError("emtpy value")

        self.key = key
        self.operator = operator
        self.value = value

    def __str__(self):
        return f"{self.key}{self.operator}{self.value}"
