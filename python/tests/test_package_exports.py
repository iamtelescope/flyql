"""Verify that all public symbols are importable from the documented package paths."""

import pytest


def test_top_level_imports() -> None:
    """AC #1: All core symbols importable from flyql root."""
    from flyql import (
        parse,
        Parser,
        ParserError,
        Node,
        Expression,
        Key,
        parse_key,
        Column,
        Operator,
        BoolOperator,
        Range,
        Diagnostic,
        diagnose,
        ValueType,
        TransformerType,
        TransformerRegistry,
        default_registry,
    )

    assert callable(parse)
    assert callable(parse_key)
    assert callable(diagnose)
    assert callable(default_registry)


def test_core_subpackage_imports() -> None:
    """AC #2: Core types importable from flyql.core."""
    from flyql.core import (
        Node,
        Expression,
        Key,
        Column,
        Operator,
        BoolOperator,
        Range,
        parse,
        Parser,
        ParserError,
        Diagnostic,
        diagnose,
    )

    assert callable(parse)
    assert callable(diagnose)


def test_matcher_subpackage_imports() -> None:
    """AC #3: Matcher types importable from flyql.matcher."""
    from flyql.matcher import Evaluator, Record

    assert Evaluator is not None
    assert Record is not None


def test_generator_dialect_imports() -> None:
    """AC #4: Generator dialect imports remain separate and work."""
    from flyql.generators.clickhouse.generator import to_sql as ch_to_sql
    from flyql.generators.postgresql.generator import to_sql as pg_to_sql
    from flyql.generators.starrocks.generator import to_sql as sr_to_sql

    assert callable(ch_to_sql)
    assert callable(pg_to_sql)
    assert callable(sr_to_sql)


def test_columns_subpackage_imports() -> None:
    """Columns subpackage exports remain intact."""
    from flyql.columns import parse, Parser, ParsedColumn, ParserError, diagnose

    assert callable(parse)
    assert callable(diagnose)


def test_transformers_subpackage_imports() -> None:
    """Transformers subpackage exports remain intact."""
    from flyql.transformers import (
        Transformer,
        TransformerType,
        TransformerRegistry,
        default_registry,
        ArgSpec,
    )

    assert callable(default_registry)


def test_all_lists_defined() -> None:
    """All __init__.py files define __all__."""
    import flyql
    import flyql.core
    import flyql.matcher
    import flyql.transformers
    import flyql.columns

    assert hasattr(flyql, "__all__")
    assert hasattr(flyql.core, "__all__")
    assert hasattr(flyql.matcher, "__all__")
    assert hasattr(flyql.transformers, "__all__")
    assert hasattr(flyql.columns, "__all__")
