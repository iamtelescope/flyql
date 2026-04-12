"""StarRocks-dialect Column."""

import re
from typing import Dict, List, Optional

from flyql.flyql_type import Type

REGEX = {
    Type.String: re.compile(r"^(varchar|char|string)\s*\(\s*\d+\s*\)"),
    Type.Int: re.compile(r"^(tinyint|smallint|int|largeint|bigint)\s*\(\s*\d+\s*\)"),
    Type.Float: re.compile(r"^(decimal|float|double)\d*\s*\(\s*\d+\s*(,\s*\d+)?\s*\)"),
    Type.Date: re.compile(r"^datetime"),
    Type.Array: re.compile(r"^array\s*\<"),
    Type.Map: re.compile(r"^map\s*\<"),
    Type.Struct: re.compile(r"^struct\s*\<"),
    Type.JSON: re.compile(r"^json"),
}

# SR renames: special→unknown.
FLYQL_TYPE_TO_STARROCKS_TYPES: Dict[Type, set] = {
    Type.String: {"string", "varchar", "char", "binary", "varbinary"},
    Type.Int: {"int", "tinyint", "smallint", "largeint", "bigint"},
    Type.Float: {"float", "double", "decimal"},
    Type.Bool: {"bool", "boolean"},
    Type.Date: {"date", "datetime"},
    Type.Unknown: {"bitmap", "hll"},
    Type.JSON: {"json"},
}


def normalize_starrocks_type(sr_type: str) -> Type:
    if not sr_type or not isinstance(sr_type, str):
        return Type.Unknown

    normalized = sr_type.strip().lower()

    if normalized == "jsonstring":
        return Type.JSONString

    if REGEX[Type.String].match(normalized):
        return Type.String
    if normalized in FLYQL_TYPE_TO_STARROCKS_TYPES[Type.String]:
        return Type.String

    if REGEX[Type.Int].match(normalized):
        return Type.Int
    if normalized in FLYQL_TYPE_TO_STARROCKS_TYPES[Type.Int]:
        return Type.Int

    if REGEX[Type.Float].match(normalized):
        return Type.Float
    if normalized in FLYQL_TYPE_TO_STARROCKS_TYPES[Type.Float]:
        return Type.Float

    if normalized in FLYQL_TYPE_TO_STARROCKS_TYPES[Type.Bool]:
        return Type.Bool

    if REGEX[Type.Date].match(normalized):
        return Type.Date
    if normalized in FLYQL_TYPE_TO_STARROCKS_TYPES[Type.Date]:
        return Type.Date

    if REGEX[Type.JSON].match(normalized):
        return Type.JSON
    if normalized in FLYQL_TYPE_TO_STARROCKS_TYPES[Type.JSON]:
        return Type.JSON

    if REGEX[Type.Array].match(normalized):
        return Type.Array

    if REGEX[Type.Map].match(normalized):
        return Type.Map

    if REGEX[Type.Struct].match(normalized):
        return Type.Struct

    if normalized in FLYQL_TYPE_TO_STARROCKS_TYPES[Type.Unknown]:
        return Type.Unknown

    return Type.Unknown


class Column:
    """Opaque StarRocks-dialect column."""

    def __init__(
        self,
        name: str,
        _type: str,
        values: Optional[List[str]] = None,
        display_name: str = "",
        raw_identifier: str = "",
    ):
        self.name = name
        self.match_name = name
        self.values: List[str] = values or []
        self.display_name = display_name
        self.raw_identifier = raw_identifier
        self._raw_type = _type
        self._flyql_type: Type = normalize_starrocks_type(_type)

    @property
    def raw_type(self) -> str:
        return self._raw_type

    @property
    def flyql_type(self) -> Type:
        return self._flyql_type

    def with_raw_identifier(self, identifier: str) -> "Column":
        self.raw_identifier = identifier
        return self
