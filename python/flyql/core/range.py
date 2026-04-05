"""Source-position range type for flyql AST elements.

A ``Range`` is a half-open character offset span ``[start, end)`` into the
raw input string that the parser received. Offsets are indexed per Python's
native string semantics (code points via ``str[i]``). For pure-ASCII input
these offsets coincide byte-for-byte with the Go implementation (byte
offsets) and the JavaScript implementation (UTF-16 code units). For
non-ASCII input each language's offsets reflect its own native indexing;
callers converting to display coordinates translate on their end.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Range:
    start: int
    end: int

    def __post_init__(self) -> None:
        if self.start < 0 or self.end < self.start:
            raise ValueError(f"invalid range: start={self.start}, end={self.end}")
