"""Base Column class shared across all generator dialects.

Generators extend this base with dialect-specific normalization and flags.
The validator (``flyql.core.validator``) operates on the base type so it
stays dialect-independent.

``match_name`` is the raw, unescaped column name used for validator lookups.
If a caller constructs a Column without setting ``normalized_type``, chain-type
validation for that column is skipped (treated as unknown type).
"""

from typing import Any, Dict, List, Optional

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
        suggest: bool = True,
        children: Optional[Dict[str, "Column"]] = None,
    ) -> None:
        self.name = name
        self.jsonstring = jsonstring
        self.type = _type
        self.normalized_type = normalized_type
        self.values = values or []
        self.display_name = display_name
        self.raw_identifier = raw_identifier
        self.match_name = match_name if match_name is not None else name
        self.suggest = suggest
        self.children = children

    @property
    def is_nested(self) -> bool:
        return self.children is not None

    def with_raw_identifier(self, identifier: str) -> "Column":
        self.raw_identifier = identifier
        return self


class ColumnSchema:
    """Wraps a set of columns with case-insensitive lookup and nested path resolution."""

    def __init__(self, columns: Dict[str, "Column"]) -> None:
        self._columns = columns
        self._by_lower_name: Dict[str, Column] = {}
        for k, v in columns.items():
            self._by_lower_name[k.lower()] = v
            if v is not None and v.children is not None:
                _lowercase_children(v)

    @property
    def columns(self) -> Dict[str, "Column"]:
        return self._columns

    def get(self, name: str) -> Optional["Column"]:
        return self._by_lower_name.get(name.lower())

    def resolve(self, segments: List[str]) -> Optional["Column"]:
        """Walk nested column tree by segments (case-insensitive).
        Returns None if any segment is unresolvable. Does NOT filter by suggest.
        """
        if not segments:
            return None
        col = self._by_lower_name.get(segments[0].lower())
        if col is None:
            return None
        for seg in segments[1:]:
            if col.children is None:
                return None
            col = col.children.get(seg.lower())
            if col is None:
                return None
        return col

    @classmethod
    def from_columns(cls, columns: List["Column"]) -> "ColumnSchema":
        """Build a ColumnSchema from a flat Column list, keyed by match_name.
        On duplicates, the first occurrence wins."""
        m: Dict[str, Column] = {}
        for c in reversed(columns):
            m[c.match_name] = c
        return cls(m)

    @classmethod
    def from_plain_object(cls, obj: Dict[str, Any]) -> "ColumnSchema":
        """Recursively convert {name: {type, children, suggest, values}} dicts."""
        m: Dict[str, Column] = {}
        for name, raw in obj.items():
            col = _column_from_plain_object(name, raw)
            if col is not None:
                m[name] = col
        return cls(m)


def _lowercase_children(col: Column) -> None:
    """Recursively rebuild children dicts with lowercased keys."""
    if col.children is None:
        return
    lowered: Dict[str, Column] = {}
    for k, child in col.children.items():
        lowered[k.lower()] = child
        if child is not None and child.children is not None:
            _lowercase_children(child)
    col.children = lowered


def _column_from_plain_object(name: str, raw: Any) -> Optional[Column]:
    if not isinstance(raw, dict):
        return None
    children: Optional[Dict[str, Column]] = None
    if "children" in raw and isinstance(raw["children"], dict):
        children = {}
        for child_name, child_raw in raw["children"].items():
            child = _column_from_plain_object(child_name, child_raw)
            if child is not None:
                children[child_name] = child
    return Column(
        name=name,
        jsonstring=False,
        _type=raw.get("type", ""),
        normalized_type=raw.get("normalized_type"),
        values=raw.get("values", []),
        suggest=raw.get("suggest", True),
        match_name=name,
        children=children,
    )


def normalized_to_transformer_type(s: Optional[str]) -> Optional[TransformerType]:
    if s is None:
        return None
    try:
        return TransformerType(s)
    except ValueError:
        return None
