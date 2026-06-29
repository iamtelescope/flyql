"""Source-position range type for flyql AST elements.

A ``Range`` is a half-open character offset span ``[start, end)`` into the
raw input string that the parser received. Offsets are indexed per Python's
native string semantics (code points via ``str[i]``). These offsets coincide
with the Go implementation (code points, via rune scanning) and the JavaScript
implementation (code points, via ``Array.from`` scanning) for all input.
Callers converting to display coordinates translate on their end.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Range:
    start: int
    end: int

    def __post_init__(self) -> None:
        if self.start < 0 or self.end < self.start:
            raise ValueError(f"invalid range: start={self.start}, end={self.end}")
