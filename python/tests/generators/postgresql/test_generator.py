"""PostgreSQL generator helper unit tests.

Covers PG-specific helpers that shared fixtures can exercise end-to-end but
not introspect directly: ``escape_param``, ``escape_identifier``, and the
PG-specific SQL shapes (ILIKE, JSON ``->>``, timestamp functions).
"""

import math

import pytest

from flyql.core.exceptions import FlyqlError
from flyql.core.parser import parse
from flyql.generators.postgresql.column import Column
from flyql.generators.postgresql.generator import (
    escape_identifier,
    escape_param,
    to_sql_where,
)


class TestEscapeParam:
    def test_none(self):
        assert escape_param(None) == "NULL"

    def test_string(self):
        assert escape_param("hello") == "'hello'"

    def test_string_with_single_quote(self):
        # PG generator backslash-escapes single quotes.
        assert "\\'" in escape_param("it's")

    def test_bool_true(self):
        assert escape_param(True) == "true"

    def test_bool_false(self):
        assert escape_param(False) == "false"

    def test_int(self):
        assert escape_param(42) == "42"

    def test_float_integer_value(self):
        assert escape_param(3.0) == "3"

    def test_float_fractional(self):
        assert escape_param(3.5) == "3.5"

    def test_float_nan_rejected(self):
        with pytest.raises(FlyqlError):
            escape_param(math.nan)

    def test_float_inf_rejected(self):
        with pytest.raises(FlyqlError):
            escape_param(math.inf)

    def test_unknown_type_rejected(self):
        with pytest.raises(FlyqlError):
            escape_param(object())


class TestEscapeIdentifier:
    def test_simple(self):
        assert escape_identifier("col") == '"col"'

    def test_with_quote(self):
        assert escape_identifier('c"ol') == '"c""ol"'


class TestILikeGeneratesILIKE:
    """PostgreSQL is the only dialect with native ``ILIKE``; verify emission."""

    def test_ilike_produces_ILIKE_keyword(self):
        columns = {"message": Column("message", "text")}
        root = parse("message ilike '%err%'").root
        sql = to_sql_where(root, columns)
        assert "ILIKE" in sql

    def test_not_ilike_produces_NOT_ILIKE(self):
        columns = {"message": Column("message", "text")}
        root = parse("message not ilike '%err%'").root
        sql = to_sql_where(root, columns)
        assert "NOT ILIKE" in sql


class TestJsonbPathExtraction:
    """JSON-typed columns should use the ``->>`` text-extraction operator."""

    def test_jsonb_field_access(self):
        columns = {"details": Column("details", "jsonb")}
        root = parse("details.name = 'alice'").root
        sql = to_sql_where(root, columns)
        # PG jsonb access uses ->> for text extraction.
        assert "->>" in sql or "->" in sql


class TestTemporalFunctions:
    """PG temporal function SQL shapes use ``NOW()`` + ``INTERVAL`` form."""

    def test_ago_uses_interval(self):
        columns = {"ts": Column("ts", "timestamptz")}
        root = parse("ts>ago(1h)").root
        sql = to_sql_where(root, columns)
        assert "NOW()" in sql
        assert "INTERVAL" in sql

    def test_today_uses_date_cast(self):
        columns = {"ts": Column("ts", "timestamptz")}
        root = parse("ts>today()").root
        sql = to_sql_where(root, columns)
        assert "date" in sql.lower()
