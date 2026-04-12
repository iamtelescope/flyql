"""PostgreSQL-dialect Column."""

import re
from typing import Dict, List, Optional

from flyql.flyql_type import Type

REGEX = {
    Type.String: re.compile(
        r"^(varchar|char|character varying|character)\s*\(\s*\d+\s*\)", re.IGNORECASE
    ),
    Type.Float: re.compile(
        r"^(numeric|decimal)\s*\(\s*\d+\s*(,\s*\d+)?\s*\)", re.IGNORECASE
    ),
    Type.Date: re.compile(r"^timestamp\s*\(\s*\d+\s*\)", re.IGNORECASE),
    Type.Array: re.compile(r"(\[\]$|^_)", re.IGNORECASE),
}

# PG renames: jsonb→json, hstore→map, interval→duration.
FLYQL_TYPE_TO_POSTGRESQL_TYPES: Dict[Type, set] = {
    Type.String: {
        "text",
        "varchar",
        "char",
        "character varying",
        "character",
        "name",
        "uuid",
        "citext",
        "inet",
        "cidr",
        "macaddr",
    },
    Type.Int: {
        "smallint",
        "integer",
        "bigint",
        "int2",
        "int4",
        "int8",
        "serial",
        "bigserial",
        "smallserial",
    },
    Type.Float: {
        "real",
        "double precision",
        "numeric",
        "decimal",
        "float4",
        "float8",
        "money",
    },
    Type.Bool: {"boolean", "bool"},
    Type.Date: {
        "date",
        "timestamp",
        "timestamptz",
        "timestamp without time zone",
        "timestamp with time zone",
        "time",
        "timetz",
    },
    Type.Duration: {"interval"},
    Type.JSON: {"jsonb", "json"},
    Type.Map: {"hstore"},
}


def normalize_postgresql_type(pg_type: str) -> Type:
    if not pg_type or not isinstance(pg_type, str):
        return Type.Unknown

    normalized = pg_type.strip().lower()

    if normalized == "jsonstring":
        return Type.JSONString

    if REGEX[Type.Array].search(normalized):
        return Type.Array

    if REGEX[Type.String].match(normalized):
        return Type.String
    if normalized in FLYQL_TYPE_TO_POSTGRESQL_TYPES[Type.String]:
        return Type.String

    if normalized in FLYQL_TYPE_TO_POSTGRESQL_TYPES[Type.Int]:
        return Type.Int

    if REGEX[Type.Float].match(normalized):
        return Type.Float
    if normalized in FLYQL_TYPE_TO_POSTGRESQL_TYPES[Type.Float]:
        return Type.Float

    if normalized in FLYQL_TYPE_TO_POSTGRESQL_TYPES[Type.Bool]:
        return Type.Bool

    if REGEX[Type.Date].match(normalized):
        return Type.Date
    if normalized in FLYQL_TYPE_TO_POSTGRESQL_TYPES[Type.Date]:
        return Type.Date

    if normalized in FLYQL_TYPE_TO_POSTGRESQL_TYPES[Type.Duration]:
        return Type.Duration

    if normalized in FLYQL_TYPE_TO_POSTGRESQL_TYPES[Type.JSON]:
        return Type.JSON

    if normalized in FLYQL_TYPE_TO_POSTGRESQL_TYPES[Type.Map]:
        return Type.Map

    return Type.Unknown


class Column:
    """Opaque PostgreSQL-dialect column."""

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
        self._flyql_type: Type = normalize_postgresql_type(_type)

    @property
    def raw_type(self) -> str:
        return self._raw_type

    @property
    def flyql_type(self) -> Type:
        return self._flyql_type

    def with_raw_identifier(self, identifier: str) -> "Column":
        self.raw_identifier = identifier
        return self
