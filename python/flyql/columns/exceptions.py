from typing import Optional

from flyql.errors_generated import ErrorEntry


class ParserError(Exception):
    def __init__(
        self,
        message: str,
        errno: int,
        error: Optional[ErrorEntry] = None,
    ):
        self.message = message
        self.errno = errno
        self.error = error
        super().__init__(self.message)

    def __str__(self) -> str:
        return self.message

    def __repr__(self) -> str:
        return str(self)
