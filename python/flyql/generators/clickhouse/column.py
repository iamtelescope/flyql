"""ClickHouse-dialect Column. Construct via ``Column(name=, _type=,
...)``. Public surface is ``name`` / ``raw_identifier`` / ``values`` /
``display_name`` plus the ``raw_type`` and ``flyql_type`` properties.
The ``flyql_type`` is computed at construction from the raw DB type via
:func:`normalize_clickhouse_type`."""

import re
from typing import Dict, List, Optional

from flyql.flyql_type import Type

REGEX = {
    "wrapper": re.compile(
        r"^(nullable|lowcardinality|simpleaggregatefunction|aggregatefunction)\s*\(\s*(.+)\)"
    ),
    Type.String: re.compile(r"^(varchar|char|fixedstring)\s*\(\s*\d+\s*\)"),
    Type.Int: re.compile(
        r"^(tinyint|smallint|mediumint|int|integer|bigint)\s*\(\s*\d+\s*\)"
    ),
    Type.Float: re.compile(r"^(decimal|numeric|dec)\d*\s*\(\s*\d+\s*(,\s*\d+)?\s*\)"),
    Type.Date: re.compile(r"^datetime64\s*\(\s*\d+\s*(,\s*.+)?\s*\)"),
    Type.Array: re.compile(r"^array\s*\("),
    Type.Map: re.compile(r"^map\s*\("),
    Type.Struct: re.compile(r"^tuple\s*\("),
    Type.JSON: re.compile(r"^json\s*\("),
}

# Lookup table for raw ClickHouse DB type names that don't require regex
# matching. CH renames: tuple→Struct, interval→Duration, geometry/special
# collapse into Unknown.
FLYQL_TYPE_TO_CLICKHOUSE_TYPES: Dict[Type, set] = {
    Type.String: {
        "string",
        "fixedstring",
        "longtext",
        "mediumtext",
        "tinytext",
        "text",
        "longblob",
        "mediumblob",
        "tinyblob",
        "blob",
        "varchar",
        "char",
        "char large object",
        "char varying",
        "character",
        "character large object",
        "character varying",
        "nchar large object",
        "nchar varying",
        "national character large object",
        "national character varying",
        "national char varying",
        "national character",
        "national char",
        "binary large object",
        "binary varying",
        "clob",
        "nchar",
        "nvarchar",
        "varchar2",
        "binary",
        "varbinary",
        "bytea",
        "uuid",
        "ipv4",
        "ipv6",
        "enum8",
        "enum16",
    },
    Type.Int: {
        "int8",
        "int16",
        "int32",
        "int64",
        "int128",
        "int256",
        "uint8",
        "uint16",
        "uint32",
        "uint64",
        "uint128",
        "uint256",
        "tinyint",
        "smallint",
        "mediumint",
        "int",
        "integer",
        "bigint",
        "tinyint signed",
        "tinyint unsigned",
        "smallint signed",
        "smallint unsigned",
        "mediumint signed",
        "mediumint unsigned",
        "int signed",
        "int unsigned",
        "integer signed",
        "integer unsigned",
        "bigint signed",
        "bigint unsigned",
        "int1",
        "int1 signed",
        "int1 unsigned",
        "byte",
        "signed",
        "unsigned",
        "bit",
        "set",
        "time",
    },
    Type.Float: {
        "float32",
        "float64",
        "float",
        "double",
        "double precision",
        "real",
        "decimal",
        "decimal32",
        "decimal64",
        "decimal128",
        "decimal256",
        "dec",
        "numeric",
        "fixed",
        "single",
    },
    Type.Bool: {"bool", "boolean"},
    Type.Date: {
        "date",
        "date32",
        "datetime",
        "datetime32",
        "datetime64",
        "timestamp",
        "year",
    },
    Type.Duration: {
        "intervalday",
        "intervalhour",
        "intervalmicrosecond",
        "intervalmillisecond",
        "intervalminute",
        "intervalmonth",
        "intervalnanosecond",
        "intervalquarter",
        "intervalsecond",
        "intervalweek",
        "intervalyear",
    },
    Type.Unknown: {
        "geometry",
        "point",
        "polygon",
        "multipolygon",
        "linestring",
        "ring",
        "nothing",
        "nested",
        "object",
        "dynamic",
        "variant",
    },
    Type.JSON: {"json"},
}


def normalize_clickhouse_type(ch_type: str) -> Type:
    """Map a raw ClickHouse DB type string to its canonical
    :class:`flyql.flyql_type.Type`. Unknown raw types map to ``Type.Unknown``."""
    if not ch_type or not isinstance(ch_type, str):
        return Type.Unknown

    normalized = ch_type.strip().lower()

    if normalized == "jsonstring":
        return Type.JSONString

    match = REGEX["wrapper"].match(normalized)
    if match:
        normalized = match.group(2).strip()

    if REGEX[Type.String].match(normalized):
        return Type.String
    if normalized in FLYQL_TYPE_TO_CLICKHOUSE_TYPES[Type.String]:
        return Type.String

    if REGEX[Type.Int].match(normalized):
        return Type.Int
    if normalized in FLYQL_TYPE_TO_CLICKHOUSE_TYPES[Type.Int]:
        return Type.Int

    if REGEX[Type.Float].match(normalized):
        return Type.Float
    if normalized in FLYQL_TYPE_TO_CLICKHOUSE_TYPES[Type.Float]:
        return Type.Float

    if normalized in FLYQL_TYPE_TO_CLICKHOUSE_TYPES[Type.Bool]:
        return Type.Bool

    if REGEX[Type.Date].match(normalized):
        return Type.Date
    if normalized in FLYQL_TYPE_TO_CLICKHOUSE_TYPES[Type.Date]:
        return Type.Date

    if REGEX[Type.JSON].match(normalized):
        return Type.JSON
    if normalized in FLYQL_TYPE_TO_CLICKHOUSE_TYPES[Type.JSON]:
        return Type.JSON

    if REGEX[Type.Array].match(normalized):
        return Type.Array

    if REGEX[Type.Map].match(normalized):
        return Type.Map

    if REGEX[Type.Struct].match(normalized):
        return Type.Struct

    if normalized in FLYQL_TYPE_TO_CLICKHOUSE_TYPES[Type.Unknown]:
        return Type.Unknown

    if normalized in FLYQL_TYPE_TO_CLICKHOUSE_TYPES[Type.Duration]:
        return Type.Duration

    return Type.Unknown


def _escape_identifier(name: str) -> str:
    needs_quoting = name[:1].isdigit() or any(
        not (c.isalnum() or c == "_") for c in name
    )
    if not needs_quoting:
        return name
    escaped = name.replace("`", "``")
    return f"`{escaped}`"


class Column:
    """Opaque ClickHouse-dialect column. ``flyql_type`` is the primary
    dispatch input for generator code; ``raw_type`` is the fallback for
    DDL-level inspection."""

    def __init__(
        self,
        name: str,
        _type: str,
        values: Optional[List[str]] = None,
        display_name: str = "",
        raw_identifier: str = "",
    ):
        # Public attributes
        self.name = _escape_identifier(name)
        self.match_name = name
        self.values: List[str] = values or []
        self.display_name = display_name
        self.raw_identifier = raw_identifier
        # Internal type fields
        self._raw_type = _type
        self._flyql_type: Type = normalize_clickhouse_type(_type)

    @property
    def raw_type(self) -> str:
        return self._raw_type

    @property
    def flyql_type(self) -> Type:
        return self._flyql_type

    def with_raw_identifier(self, identifier: str) -> "Column":
        self.raw_identifier = identifier
        return self
