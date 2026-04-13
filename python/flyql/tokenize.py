"""Pure tokenizer primitive: groups parser typed_chars into tokens.

Matches the JavaScript `flyql/tokenize` semantics for query mode, producing
tokens with shape (text, type, start, end) plus a trailing ERROR token when
the parser halts before consuming the full input. Columns mode is not
supported in Python (the columns parser has no typed_chars).
"""

import re
from dataclasses import dataclass
from typing import Any, Dict, List

from .core.constants import CharType
from .core.parser import parse as _parse

_NUMERIC_RE = re.compile(r"^-?\d+(\.\d+)?([eE][+-]?\d+)?$")


@dataclass(frozen=True)
class Token:
    text: str
    type: CharType
    start: int
    end: int


def _is_numeric(value: str) -> bool:
    return bool(_NUMERIC_RE.fullmatch(value))


def _upgrade_value(text: str) -> CharType:
    if text in ("true", "false"):
        return CharType.BOOLEAN
    if text == "null":
        return CharType.NULL
    if _is_numeric(text):
        return CharType.NUMBER
    if text and text[0] in ("'", '"'):
        return CharType.STRING
    return CharType.COLUMN


def tokenize(text: str, mode: str = "query") -> List[Token]:
    if mode != "query":
        raise ValueError("columns mode is only available in the JavaScript package")
    if not text:
        return []

    parser = _parse(text, raise_error=False)
    typed_chars = parser.typed_chars

    groups: List[Dict[str, Any]] = []
    cur_text = ""
    cur_type: object = None
    cur_start = 0
    for char, char_type in typed_chars:
        if cur_type is None:
            cur_text = char.value
            cur_type = char_type
            cur_start = char.pos
        elif char_type == cur_type:
            cur_text += char.value
        else:
            groups.append(
                {
                    "text": cur_text,
                    "type": cur_type,
                    "start": cur_start,
                    "end": cur_start + len(cur_text),
                }
            )
            cur_text = char.value
            cur_type = char_type
            cur_start = char.pos
    if cur_type is not None:
        groups.append(
            {
                "text": cur_text,
                "type": cur_type,
                "start": cur_start,
                "end": cur_start + len(cur_text),
            }
        )

    tokens: List[Token] = []
    for g in groups:
        token_type = g["type"]
        if token_type == CharType.VALUE:
            token_type = _upgrade_value(g["text"])
        tokens.append(
            Token(
                text=g["text"],
                type=token_type,
                start=g["start"],
                end=g["end"],
            )
        )

    consumed = tokens[-1].end if tokens else 0
    if consumed < len(text):
        tokens.append(
            Token(
                text=text[consumed:],
                type=CharType.ERROR,
                start=consumed,
                end=len(text),
            )
        )

    return tokens
