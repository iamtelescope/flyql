"""PostgreSQL-dialect Column unit tests — covers the PG-only API surface
(with_raw_identifier, PG-specific type normalization)."""

import pytest

from flyql.flyql_type import Type
from flyql.generators.postgresql.column import Column, normalize_postgresql_type


class TestColumnConstructor:
    def test_positional_args(self):
        col = Column("msg", "text")
        assert col.name == "msg"
        assert col.raw_type == "text"
        assert col.flyql_type == Type.String
        assert col.values == []
        assert col.display_name == ""
        assert col.raw_identifier == ""

    def test_keyword_args(self):
        col = Column(name="status", _type="integer", values=None, display_name="Status")
        assert col.name == "status"
        assert col.flyql_type == Type.Int
        assert col.display_name == "Status"

    def test_enum_values(self):
        col = Column("env", "text", values=["dev", "prod"])
        assert col.values == ["dev", "prod"]


class TestWithRawIdentifier:
    def test_sets_raw_identifier(self):
        col = Column("name", "text")
        result = col.with_raw_identifier("u.name")
        assert col.raw_identifier == "u.name"
        assert result is col

    def test_overrides_default_quoted_identifier(self):
        # When raw_identifier is set, get_identifier returns it as-is
        # (used downstream by the generator) — verified indirectly by the
        # shared fixtures with `"u.name"` raw_identifier.
        col = Column("simple", "text")
        col.with_raw_identifier("t.simple")
        assert col.raw_identifier == "t.simple"


class TestNormalizePostgresqlType:
    @pytest.mark.parametrize(
        "pg_type,expected",
        [
            ("text", Type.String),
            ("varchar", Type.String),
            ("varchar(255)", Type.String),
            ("character varying(100)", Type.String),
            ("char(10)", Type.String),
            ("uuid", Type.String),
            ("inet", Type.String),
            ("integer", Type.Int),
            ("bigint", Type.Int),
            ("smallint", Type.Int),
            ("int4", Type.Int),
            ("int8", Type.Int),
            ("real", Type.Float),
            ("double precision", Type.Float),
            ("numeric", Type.Float),
            ("numeric(10,2)", Type.Float),
            ("decimal", Type.Float),
            ("money", Type.Float),
            ("boolean", Type.Bool),
            ("bool", Type.Bool),
            ("date", Type.Date),
            ("timestamp", Type.Date),
            ("timestamptz", Type.Date),
            ("timestamp with time zone", Type.Date),
            ("timestamp(6)", Type.Date),
            ("interval", Type.Duration),
            ("jsonb", Type.JSON),
            ("json", Type.JSON),
            ("hstore", Type.Map),
            ("text[]", Type.Array),
            ("_int4", Type.Array),
            ("jsonstring", Type.JSONString),
        ],
    )
    def test_normalize(self, pg_type, expected):
        assert normalize_postgresql_type(pg_type) == expected

    def test_empty_returns_unknown(self):
        assert normalize_postgresql_type("") == Type.Unknown

    def test_non_string_returns_unknown(self):
        assert normalize_postgresql_type(None) == Type.Unknown  # type: ignore[arg-type]

    def test_unknown_type(self):
        assert normalize_postgresql_type("geometry") == Type.Unknown

    def test_case_insensitive(self):
        assert normalize_postgresql_type("INTEGER") == Type.Int
        assert normalize_postgresql_type("JSONB") == Type.JSON
