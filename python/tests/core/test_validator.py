"""Unit tests for flyql.core.validator �� diagnose() and Diagnostic.

Shared test cases are loaded from tests-data/core/validator.json.
Language-specific tests (invalid AST guard, dialect subclass) remain inline.
"""

import json
import os
from typing import ClassVar, Tuple

import pytest

from flyql.core.column import Column
from flyql.core.expression import Expression
from flyql.core.key import Key
from flyql.core.parser import parse
from flyql.core.range import Range
from flyql.core.tree import Node
from flyql.core.validator import (
    CODE_ARG_COUNT,
    CODE_ARG_TYPE,
    CODE_CHAIN_TYPE,
    CODE_INVALID_AST,
    CODE_UNKNOWN_COLUMN,
    CODE_UNKNOWN_TRANSFORMER,
    Diagnostic,
    diagnose,
)
from flyql.transformers.base import ArgSpec, Transformer, TransformerType
from flyql.transformers.registry import TransformerRegistry, default_registry

# ---------------------------------------------------------------------------
# Shared fixture loading
# ---------------------------------------------------------------------------

FIXTURES_PATH = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__),
        "..",
        "..",
        "..",
        "tests-data",
        "core",
        "validator.json",
    )
)


def _load_shared_cases():
    with open(FIXTURES_PATH) as f:
        data = json.load(f)
    return data["tests"]


SHARED_CASES = _load_shared_cases()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_column(
    name: str,
    normalized_type: str,
    *,
    jsonstring: bool = False,
    match_name: str | None = None,
) -> Column:
    return Column(
        name=name,
        jsonstring=jsonstring,
        _type=normalized_type,
        normalized_type=normalized_type,
        match_name=match_name,
    )


def _parse_ast(query: str) -> Node:
    p = parse(query)
    assert p.root is not None, f"parse('{query}') returned no AST"
    return p.root


def _columns_from_spec(col_specs: list) -> list[Column]:
    return [make_column(c["name"], c["normalized_type"]) for c in col_specs]


# ---------------------------------------------------------------------------
# Custom test transformers
# ---------------------------------------------------------------------------


class TakesStringThenInt(Transformer):
    arg_schema: ClassVar[Tuple[ArgSpec, ...]] = (
        ArgSpec(type=TransformerType.STRING),
        ArgSpec(type=TransformerType.INT),
    )

    @property
    def name(self) -> str:
        return "takes_string_then_int"

    @property
    def input_type(self) -> TransformerType:
        return TransformerType.STRING

    @property
    def output_type(self) -> TransformerType:
        return TransformerType.STRING

    def sql(self, dialect, column_ref, args=None):
        return column_ref

    def apply(self, value, args=None):
        return value


class StringToInt(Transformer):
    @property
    def name(self) -> str:
        return "string_to_int"

    @property
    def input_type(self) -> TransformerType:
        return TransformerType.STRING

    @property
    def output_type(self) -> TransformerType:
        return TransformerType.INT

    def sql(self, dialect, column_ref, args=None):
        return column_ref

    def apply(self, value, args=None):
        return int(value)


class TakesFloat(Transformer):
    arg_schema: ClassVar[Tuple[ArgSpec, ...]] = (ArgSpec(type=TransformerType.FLOAT),)

    @property
    def name(self) -> str:
        return "takes_float"

    @property
    def input_type(self) -> TransformerType:
        return TransformerType.STRING

    @property
    def output_type(self) -> TransformerType:
        return TransformerType.STRING

    def sql(self, dialect, column_ref, args=None):
        return column_ref

    def apply(self, value, args=None):
        return value


class TakesInt(Transformer):
    arg_schema: ClassVar[Tuple[ArgSpec, ...]] = (ArgSpec(type=TransformerType.INT),)

    @property
    def name(self) -> str:
        return "takes_int"

    @property
    def input_type(self) -> TransformerType:
        return TransformerType.STRING

    @property
    def output_type(self) -> TransformerType:
        return TransformerType.STRING

    def sql(self, dialect, column_ref, args=None):
        return column_ref

    def apply(self, value, args=None):
        return value


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def registry() -> TransformerRegistry:
    reg = default_registry()
    reg.register(TakesStringThenInt())
    reg.register(StringToInt())
    reg.register(TakesFloat())
    reg.register(TakesInt())
    return reg


# ---------------------------------------------------------------------------
# Shared fixture-driven tests
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "test_case",
    [pytest.param(tc, id=tc["name"]) for tc in SHARED_CASES],
)
def test_shared_validator(test_case: dict, registry: TransformerRegistry) -> None:
    query = test_case["query"]
    cols = _columns_from_spec(test_case["columns"])
    use_default = test_case.get("use_default_registry", False)
    reg = None if use_default else registry

    if query is None:
        ast = None
    else:
        ast = _parse_ast(query)

    diags = diagnose(ast, cols, reg)

    expected = test_case["expected_diagnostics"]
    assert len(diags) == len(
        expected
    ), f"expected {len(expected)} diagnostics, got {len(diags)}: {diags}"

    for i, exp in enumerate(expected):
        d = diags[i]
        assert d.code == exp["code"], f"diag[{i}]: code={d.code}, want {exp['code']}"
        assert (
            d.severity == exp["severity"]
        ), f"diag[{i}]: severity={d.severity}, want {exp['severity']}"
        if "range" in exp:
            assert d.range == Range(
                exp["range"][0], exp["range"][1]
            ), f"diag[{i}]: range={d.range}, want {exp['range']}"
        if "message_contains" in exp:
            assert (
                exp["message_contains"] in d.message
            ), f"diag[{i}]: {exp['message_contains']!r} not in {d.message!r}"

    # Check absent codes
    absent = test_case.get("absent_codes", [])
    diag_codes = {d.code for d in diags}
    for code in absent:
        assert (
            code not in diag_codes
        ), f"expected code {code!r} to be absent, but found it in {diags}"


# ---------------------------------------------------------------------------
# Language-specific tests (require manual AST construction or dialect imports)
# ---------------------------------------------------------------------------


class TestDialectColumnSubclass:
    def test_accepts_dialect_column_subclass(
        self, registry: TransformerRegistry
    ) -> None:
        from flyql.generators.clickhouse.column import Column as CHColumn

        col = CHColumn("host", False, "String")
        ast = _parse_ast("host='X'")
        assert diagnose(ast, [col], registry) == []


class TestInvalidAstGuard:
    def test_invalid_ast_guard(self, registry: TransformerRegistry) -> None:
        key = Key(segments=["foo"], raw="foo", segment_ranges=[])
        expr = Expression(
            key=key,
            operator="=",
            value="X",
            value_is_string=True,
        )
        node = Node(
            bool_operator="and",
            expression=expr,
            left=None,
            right=None,
        )
        cols = [make_column("foo", "string")]
        diags = diagnose(node, cols, registry)
        assert len(diags) == 1
        assert diags[0].code == CODE_INVALID_AST
        assert diags[0].range == Range(0, 0)


class TestBacktickEscapedColumn:
    def test_backtick_escaped_column(self, registry: TransformerRegistry) -> None:
        from flyql.generators.clickhouse.column import Column as CHColumn

        col = CHColumn("1host", False, "String")
        assert col.name == "`1host`"
        assert col.match_name == "1host"
        ast = _parse_ast("host='X'")
        cols = [make_column("host", "string")]
        assert diagnose(ast, cols, registry) == []
