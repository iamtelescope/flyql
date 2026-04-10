"""Canonical Column and ColumnSchema used by the validator.

Dialect-specific generators have their own opaque Column classes; use the
dialect's ``to_flyql_schema`` helper to bridge from a dialect column list
to a :class:`ColumnSchema`.
"""

from typing import Any, Dict, List, Optional

from flyql.core.exceptions import FlyqlError
from flyql.flyql_type import Type, parse_flyql_type


class Column:
    """The canonical, schema-aware column type used by the validator.

    ``column_type`` (NOT ``type``) is the parameter name because ``type``
    is a Python builtin and shadowing it inside ``__init__`` would
    generate pylint warnings and risk silent bugs. See Tech Decision #15.
    """

    def __init__(
        self,
        name: str,
        jsonstring: bool,
        column_type: Type,
        values: Optional[List[str]] = None,
        display_name: str = "",
        raw_identifier: str = "",
        match_name: Optional[str] = None,
        suggest: bool = True,
        children: Optional[Dict[str, "Column"]] = None,
    ) -> None:
        self.name = name
        # JSONString is an orthogonal capability flag — see Tech Decision #5.
        # NOT validated against ``column_type``.
        self.jsonstring = jsonstring
        self.type: Type = column_type
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
        Returns None if any segment is unresolvable."""
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
        """Build a ColumnSchema from a flat Column list, keyed by match_name."""
        m: Dict[str, Column] = {}
        for c in reversed(columns):
            m[c.match_name] = c
        return cls(m)

    @classmethod
    def from_plain_object(cls, obj: Dict[str, Any]) -> "ColumnSchema":
        """Recursively convert ``{name: {type, children, suggest, values, jsonstring}}``
        dicts.

        Strict mode: an unknown ``type`` value raises :class:`FlyqlError`.
        The legacy key ``normalized_type`` is detected and raises a
        targeted migration error pointing at
        ``docs.flyql.dev/advanced/column-types``.
        """
        m: Dict[str, Column] = {}
        for name, raw in obj.items():
            col = _column_from_plain_object(name, raw)
            if col is not None:
                m[name] = col
        return cls(m)


def _lowercase_children(col: Column) -> None:
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
    if "normalized_type" in raw:
        raise FlyqlError(
            f"column {name!r}: 'normalized_type' field has been renamed to 'type' "
            "in canonical column JSON; see migration guide at "
            "docs.flyql.dev/advanced/column-types"
        )
    children: Optional[Dict[str, Column]] = None
    if "children" in raw and isinstance(raw["children"], dict):
        children = {}
        for child_name, child_raw in raw["children"].items():
            child = _column_from_plain_object(child_name, child_raw)
            if child is not None:
                children[child_name] = child
    type_str = raw.get("type", "")
    column_type = parse_flyql_type(type_str) if type_str else Type.Unknown
    return Column(
        name=name,
        jsonstring=bool(raw.get("jsonstring", False)),
        column_type=column_type,
        values=raw.get("values", []),
        suggest=raw.get("suggest", True),
        match_name=name,
        children=children,
    )
