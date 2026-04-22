"""flyql.Type — the canonical, dialect-agnostic vocabulary for column and
value types within flyql.

This module is a leaf module: both ``flyql.core.column`` and
``flyql.transformers.base`` import it without creating an import cycle.

Inclusion criterion: a value belongs in this enum if (a) the validator
behaves differently for it, (b) generator dispatch differs across
dialects for it, OR (c) it is a forward-looking type with explicit
user-confirmed need (currently: ``Duration``).

The string values match the Go and JavaScript implementations verbatim
so JSON test fixtures and serialized columns remain language-agnostic.
"""

from enum import Enum


class Type(str, Enum):
    """Canonical flyql semantic type for a column or value."""

    String = "string"
    """Text values. Enables string-only operators (``like``, ``ilike``,
    ``regex``, ``not regex``); IN-list string typing. Absorbs raw DB
    types like varchar, char, text, FixedString, blob, UUID, IPv4/v6."""

    Int = "int"
    """Integer numbers. Enables numeric ordering operators; regex is
    rejected. Absorbs int8/16/32/64/128/256, uint*, bigint, etc."""

    Float = "float"
    """Floating-point numbers. Enables numeric ordering operators; regex
    is rejected. Absorbs float, double, decimal, numeric, real."""

    Bool = "bool"
    """Boolean values. Equality and truthy only; ordering operators
    rejected. Absorbs bool/boolean."""

    Date = "date"
    """Calendar day only (Y/M/D) — no time-of-day component. Comparisons
    truncate to day granularity. Accepts temporal function calls
    (``ago()``, ``today()``, ``startOf()``) and ISO-8601 date or datetime
    string literals (the time component is ignored when present).
    Absorbs raw DB types ``date`` / ``date32``.

    Distinct from :attr:`DateTime` — use this when the semantic is a
    calendar day, not an instant-in-time. A column declared ``Date`` that
    receives a datetime-shaped value emits a migration warning.
    """

    DateTime = "datetime"
    """Instant-in-time (point on the timeline, ms resolution). Comparisons
    happen at millisecond granularity (sub-ms precision is truncated).
    Accepts temporal function calls and ISO-8601 string literals with
    full time + optional timezone. Absorbs raw DB types ``datetime``,
    ``datetime64``, ``timestamp``, ``timestamptz``, ``year``.

    Distinct from :attr:`Date` — use this for wall-clock events,
    timestamps, and anything with a time-of-day. Schema ``tz`` and
    ``unit`` metadata disambiguates naive strings and numeric values.
    """

    Duration = "duration"
    """Interval/duration values. Accepts duration literals like
    ``30m1s``, ``1h``, ``7d``. Absorbs ClickHouse Interval* and PostgreSQL
    interval. Forward-looking: temporal validation against duration
    columns is planned in a follow-up spec."""

    Array = "array"
    """Ordered collection of values. Accepts the ``has`` operator;
    segmented key access uses numeric indices."""

    Map = "map"
    """Key→value collection with dynamic keys. Segmented key access uses
    string keys. Absorbs ClickHouse Map(...) and PostgreSQL hstore."""

    Struct = "struct"
    """Fixed-shape record with named (or positional) fields. Segmented
    key access uses field names. Absorbs ClickHouse Tuple and StarRocks
    STRUCT."""

    JSON = "json"
    """Semi-structured JSON document. Segmented key access uses JSON
    paths. Absorbs ClickHouse JSON, PostgreSQL json/jsonb, StarRocks JSON."""

    JSONString = "jsonstring"
    """Text column whose contents are valid JSON. Segmented key access
    uses JSON paths; operator set mirrors JSON. Generators wrap access
    with a dialect-specific parse function (``parse_json`` for StarRocks,
    ``(col::jsonb)`` for PostgreSQL, ``JSONExtract*`` for ClickHouse).
    Absorbs text/varchar/String columns declared with the synthetic
    flyql raw-type token ``"jsonstring"``."""

    Unknown = "unknown"
    """Documented fallback for types flyql cannot reason about. Operators
    fall through to defaults; path access errors with "unsupported
    column type"; transformers cannot accept it."""


_VALID_TYPE_TOKENS = {member.value: member for member in Type}


def parse_flyql_type(s: str) -> Type:
    """Strictly parse a string into a :class:`Type`.

    Raises :class:`flyql.core.exceptions.FlyqlError` on any value that is
    not one of the 11 valid lowercase tokens. Strict-mode parsing is
    mandatory: a lenient fallback to ``Type.Unknown`` would silently
    corrupt downstream consumers (validator, generators).

    See the unify-column-type-system spec, Tech Decision #21.
    """
    # Local import avoids a top-of-module cycle with flyql.core.exceptions
    # (which has its own dependencies in some legacy import orderings).
    from flyql.core.exceptions import FlyqlError

    if s in _VALID_TYPE_TOKENS:
        return _VALID_TYPE_TOKENS[s]
    raise FlyqlError(f"unknown flyql type: {s!r}")
