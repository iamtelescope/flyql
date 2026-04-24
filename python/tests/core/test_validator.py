"""Unit tests for flyql.core.validator �� diagnose() and Diagnostic.

Shared test cases are loaded from tests-data/core/validator.json.
Language-specific tests (invalid AST guard, dialect subclass) remain inline.
"""

import json
import os
from typing import ClassVar, Tuple

import pytest

from flyql.core.column import Column, ColumnSchema
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
    ErrorEntry,
    diagnose,
    make_diag,
)
from flyql.errors_generated import VALIDATOR_REGISTRY
from flyql.transformers.base import ArgSpec, Transformer
from flyql.flyql_type import Type
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
    type_str: str,
    *,
    match_name: str | None = None,
) -> Column:
    from flyql.flyql_type import parse_flyql_type

    return Column(
        name=name,
        column_type=parse_flyql_type(type_str) if type_str else Type.Unknown,
        match_name=match_name,
    )


def _parse_ast(query: str) -> Node:
    p = parse(query)
    assert p.root is not None, f"parse('{query}') returned no AST"
    return p.root


def _columns_from_spec(col_specs: list) -> list[Column]:
    return [make_column(c["name"], c["type"]) for c in col_specs]


# ---------------------------------------------------------------------------
# Custom test transformers
# ---------------------------------------------------------------------------


class TakesStringThenInt(Transformer):
    arg_schema: ClassVar[Tuple[ArgSpec, ...]] = (
        ArgSpec(type=Type.String),
        ArgSpec(type=Type.Int),
    )

    @property
    def name(self) -> str:
        return "takes_string_then_int"

    @property
    def input_type(self) -> Type:
        return Type.String

    @property
    def output_type(self) -> Type:
        return Type.String

    def sql(self, dialect, column_ref, args=None):
        return column_ref

    def apply(self, value, args=None):
        return value


class StringToInt(Transformer):
    @property
    def name(self) -> str:
        return "string_to_int"

    @property
    def input_type(self) -> Type:
        return Type.String

    @property
    def output_type(self) -> Type:
        return Type.Int

    def sql(self, dialect, column_ref, args=None):
        return column_ref

    def apply(self, value, args=None):
        return int(value)


class TakesFloat(Transformer):
    arg_schema: ClassVar[Tuple[ArgSpec, ...]] = (ArgSpec(type=Type.Float),)

    @property
    def name(self) -> str:
        return "takes_float"

    @property
    def input_type(self) -> Type:
        return Type.String

    @property
    def output_type(self) -> Type:
        return Type.String

    def sql(self, dialect, column_ref, args=None):
        return column_ref

    def apply(self, value, args=None):
        return value


class TakesInt(Transformer):
    arg_schema: ClassVar[Tuple[ArgSpec, ...]] = (ArgSpec(type=Type.Int),)

    @property
    def name(self) -> str:
        return "takes_int"

    @property
    def input_type(self) -> Type:
        return Type.String

    @property
    def output_type(self) -> Type:
        return Type.String

    def sql(self, dialect, column_ref, args=None):
        return column_ref

    def apply(self, value, args=None):
        return value


class AcceptsAny(Transformer):
    @property
    def name(self) -> str:
        return "accepts_any"

    @property
    def input_type(self) -> Type:
        return Type.Any

    @property
    def output_type(self) -> Type:
        return Type.String

    def sql(self, dialect, column_ref, args=None):
        return column_ref

    def apply(self, value, args=None):
        return value


class AcceptsAnyReturningArray(Transformer):
    @property
    def name(self) -> str:
        return "accepts_any_returning_array"

    @property
    def input_type(self) -> Type:
        return Type.Any

    @property
    def output_type(self) -> Type:
        return Type.Array

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
    reg.register(AcceptsAny())
    reg.register(AcceptsAnyReturningArray())
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

    diags = diagnose(ast, ColumnSchema.from_columns(cols), reg)

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


class TestDialectBridge:
    def test_accepts_dialect_column_via_bridge(
        self, registry: TransformerRegistry
    ) -> None:
        # After the unify-column-type-system refactor, dialect Columns are
        # opaque and no longer subclass core Column. Consumers must bridge
        # via to_flyql_schema (or hand-construct flyql.Column from
        # column.flyql_type).
        from flyql.generators.clickhouse.column import Column as CHColumn

        ch = CHColumn("host", "String")
        bridged = Column(
            name=ch.name,
            column_type=ch.flyql_type,
            match_name=ch.match_name,
        )
        ast = _parse_ast("host='X'")
        assert diagnose(ast, ColumnSchema.from_columns([bridged]), registry) == []


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
        diags = diagnose(node, ColumnSchema.from_columns(cols), registry)
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
        assert diagnose(ast, ColumnSchema.from_columns(cols), registry) == []


# ---------------------------------------------------------------------------
# Diagnostic.error population (rich error objects)
# ---------------------------------------------------------------------------


from flyql.core.validator import (
    CODE_INVALID_COLUMN_VALUE,
    CODE_INVALID_DATETIME_LITERAL,
    CODE_UNKNOWN_COLUMN_VALUE,
)

_ERROR_PAYLOAD_CASES = [
    pytest.param(
        "unknown_col=1",
        [make_column("known", "string")],
        CODE_UNKNOWN_COLUMN,
        id="unknown_column",
    ),
    pytest.param(
        "host|wat",
        [make_column("host", "string")],
        CODE_UNKNOWN_TRANSFORMER,
        id="unknown_transformer",
    ),
    pytest.param(
        "host|takes_int(1, 2)",
        [make_column("host", "string")],
        CODE_ARG_COUNT,
        id="arg_count",
    ),
    pytest.param(
        "host|takes_int('not-an-int')",
        [make_column("host", "string")],
        CODE_ARG_TYPE,
        id="arg_type",
    ),
    pytest.param(
        "n|string_to_int|takes_int(1)",
        [make_column("n", "string")],
        CODE_CHAIN_TYPE,
        id="chain_type",
    ),
    pytest.param(
        "field=nonexistent",
        [make_column("field", "string")],
        CODE_UNKNOWN_COLUMN_VALUE,
        id="unknown_column_value",
    ),
    pytest.param(
        "event_day > foo+bar",
        [make_column("event_day", "date")],
        CODE_INVALID_COLUMN_VALUE,
        id="invalid_column_value",
    ),
    pytest.param(
        "ts > 'not-a-date'",
        [make_column("ts", "datetime")],
        CODE_INVALID_DATETIME_LITERAL,
        id="invalid_datetime_literal",
    ),
]


@pytest.mark.parametrize("query,cols,expected_code", _ERROR_PAYLOAD_CASES)
def test_diagnostic_error_populated(
    query: str,
    cols: list,
    expected_code: str,
    registry: TransformerRegistry,
) -> None:
    ast = _parse_ast(query)
    diags = diagnose(ast, ColumnSchema.from_columns(cols), registry)
    matching = [d for d in diags if d.code == expected_code]
    assert matching, f"no diagnostic emitted with code {expected_code!r} from {query!r}"
    for d in matching:
        assert d.error is not None, f"{d.code}: error is None"
        assert isinstance(d.error, ErrorEntry)
        assert d.error.code == d.code
        assert d.error.name == VALIDATOR_REGISTRY[d.code].name


def test_invalid_ast_diagnostic_carries_error() -> None:
    key = Key(segments=["foo"], raw="foo", segment_ranges=[])
    expr = Expression(key=key, operator="=", value="X", value_is_string=True)
    node = Node(bool_operator="and", expression=expr, left=None, right=None)
    cols = [make_column("foo", "string")]
    diags = diagnose(node, ColumnSchema.from_columns(cols), default_registry())
    assert len(diags) == 1
    assert diags[0].code == CODE_INVALID_AST
    assert diags[0].error is not None
    assert diags[0].error.name == VALIDATOR_REGISTRY[CODE_INVALID_AST].name


def test_make_diag_unknown_code_returns_none_error() -> None:
    # Decision 7: optional field — no raise on registry miss.
    d = make_diag(Range(0, 1), "totally_made_up", "error", "fake")
    assert isinstance(d, Diagnostic)
    assert d.error is None
    assert d.code == "totally_made_up"
