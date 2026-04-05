from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from flyql.core.range import Range


class FlyqlError(Exception):
    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class KeyParseError(FlyqlError):
    def __init__(self, message: str, range: "Range") -> None:
        super().__init__(message)
        self.range = range
