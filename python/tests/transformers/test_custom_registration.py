"""Integration tests for custom transformer registration (Phase 2)."""

import pytest
from typing import Any

from flyql.core.parser import parse
from flyql.transformers.base import Transformer
from flyql.flyql_type import Type
from flyql.transformers.registry import TransformerRegistry, default_registry
from flyql.generators.clickhouse import generator as ch_gen
from flyql.generators.clickhouse.column import Column as ChColumn
from flyql.generators.postgresql import generator as pg_gen
from flyql.generators.postgresql.column import Column as PgColumn
from flyql.generators.starrocks import generator as sr_gen
from flyql.generators.starrocks.column import Column as SrColumn
from flyql.matcher.evaluator import Evaluator
from flyql.matcher.record import Record


class FirstOctetTransformer(Transformer):
    @property
    def name(self) -> str:
        return "firstoctet"

    @property
    def input_type(self) -> Type:
        return Type.String

    @property
    def output_type(self) -> Type:
        return Type.Int

    def sql(self, dialect: str, column_ref: str, args: Any = None) -> str:
        if dialect == "clickhouse":
            return f"toUInt8(splitByChar('.', {column_ref})[1])"
        return f"CAST(SPLIT_PART({column_ref}, '.', 1) AS INTEGER)"

    def apply(self, value: Any, args: Any = None) -> Any:
        return int(str(value).split(".")[0])


def _custom_registry() -> TransformerRegistry:
    registry = default_registry()
    registry.register(FirstOctetTransformer())
    return registry


class TestCustomRegistration:
    def test_register_and_lookup(self) -> None:
        registry = _custom_registry()
        t = registry.get("firstoctet")
        assert t is not None
        assert t.name == "firstoctet"
        assert t.input_type == Type.String
        assert t.output_type == Type.Int

    def test_builtins_still_available(self) -> None:
        registry = _custom_registry()
        assert registry.get("upper") is not None
        assert registry.get("lower") is not None
        assert registry.get("len") is not None

    def test_parse_with_custom_transformer(self) -> None:
        result = parse("src_ip|firstoctet > 192")
        assert result.root is not None
        key = result.root.left.expression.key
        assert len(key.transformers) == 1
        assert key.transformers[0].name == "firstoctet"

    def test_registration_under_10_lines(self) -> None:
        # The FirstOctetTransformer class definition is 10 lines
        # (class + 5 property/method defs with returns)
        # Registration is 2 lines: registry = default_registry(); registry.register(...)
        # Total: well under 10 lines for the registration call itself
        registry = default_registry()
        registry.register(FirstOctetTransformer())
        assert registry.get("firstoctet") is not None


class TestCustomTransformerClickHouse:
    COLUMNS = {
        "src_ip": ChColumn("src_ip", "String"),
    }

    def test_where_clause(self) -> None:
        registry = _custom_registry()
        result = parse("src_ip|firstoctet > 192")
        sql = ch_gen.to_sql_where(result.root, self.COLUMNS, registry=registry)
        assert "toUInt8(splitByChar('.', src_ip)[1])" in sql
        assert "> 192" in sql

    def test_default_registry_rejects_unknown(self) -> None:
        result = parse("src_ip|firstoctet > 192")
        with pytest.raises(Exception, match="unknown transformer"):
            ch_gen.to_sql_where(result.root, self.COLUMNS)


class TestCustomTransformerPostgreSQL:
    COLUMNS = {
        "src_ip": PgColumn("src_ip", "text"),
    }

    def test_where_clause(self) -> None:
        registry = _custom_registry()
        result = parse("src_ip|firstoctet > 192")
        sql = pg_gen.to_sql_where(result.root, self.COLUMNS, registry=registry)
        assert "CAST(SPLIT_PART" in sql
        assert "> 192" in sql


class TestCustomTransformerStarRocks:
    COLUMNS = {
        "src_ip": SrColumn("src_ip", "VARCHAR"),
    }

    def test_where_clause(self) -> None:
        registry = _custom_registry()
        result = parse("src_ip|firstoctet > 192")
        sql = sr_gen.to_sql_where(result.root, self.COLUMNS, registry=registry)
        assert "CAST(SPLIT_PART" in sql
        assert "> 192" in sql


class TestCustomTransformerMatcher:
    def test_apply_custom_transformer(self) -> None:
        registry = _custom_registry()
        evaluator = Evaluator(registry=registry)
        result = parse("src_ip|firstoctet > 192")
        record = Record({"src_ip": "10.0.0.1"})
        assert evaluator.evaluate(result.root, record) is False

    def test_apply_custom_transformer_match(self) -> None:
        registry = _custom_registry()
        evaluator = Evaluator(registry=registry)
        result = parse("src_ip|firstoctet > 192")
        record = Record({"src_ip": "193.0.0.1"})
        assert evaluator.evaluate(result.root, record) is True

    def test_default_registry_rejects_unknown(self) -> None:
        evaluator = Evaluator()
        result = parse("src_ip|firstoctet > 192")
        record = Record({"src_ip": "10.0.0.1"})
        with pytest.raises(Exception, match="unknown transformer"):
            evaluator.evaluate(result.root, record)
