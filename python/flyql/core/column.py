"""Base Column class shared across all generator dialects.

Generators extend this base with dialect-specific normalization and flags.
The validator (``flyql.core.validator``) operates on the base type so it
stays dialect-independent.

``match_name`` is the raw, unescaped column name used for validator lookups.
If a caller constructs a Column without setting ``normalized_type``, chain-type
validation for that column is skipped (treated as unknown type).
"""

from typing import List, Optional

from flyql.transformers.base import TransformerType


class Column:
    def __init__(
        self,
        name: str,
        jsonstring: bool,
        _type: str,
        normalized_type: Optional[str],
        values: Optional[List[str]] = None,
        display_name: str = "",
        raw_identifier: str = "",
        match_name: Optional[str] = None,
    ) -> None:
        self.name = name
        self.jsonstring = jsonstring
        self.type = _type
        self.normalized_type = normalized_type
        self.values = values or []
        self.display_name = display_name
        self.raw_identifier = raw_identifier
        self.match_name = match_name if match_name is not None else name

    def with_raw_identifier(self, identifier: str) -> "Column":
        self.raw_identifier = identifier
        return self


def normalized_to_transformer_type(s: Optional[str]) -> Optional[TransformerType]:
    if s is None:
        return None
    try:
        return TransformerType(s)
    except ValueError:
        return None
