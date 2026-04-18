"""Regression tests for the canonical-columns-parser swap in
``to_sql_select``. Covers the adapter helper (``_to_key_transformers``) and
the renderer-suffix-in-alias fix (``col as alias|tag``).
"""

from typing import Any, Dict, List

import pytest

from flyql.core.exceptions import FlyqlError
from flyql.core.key import KeyTransformer
from flyql.core.range import Range
from flyql.generators.clickhouse import Column, to_sql_select
from flyql.generators.clickhouse.generator import _to_key_transformers


@pytest.mark.parametrize(
    "input_ts, expected",
    [
        ([], []),
        (
            [{"name": "upper", "arguments": []}],
            [("upper", [])],
        ),
        (
            [
                {"name": "chars", "arguments": [10]},
                {"name": "upper", "arguments": []},
            ],
            [("chars", [10]), ("upper", [])],
        ),
        (
            [{"name": "substr", "arguments": [0, "."]}],
            [("substr", [0, "."])],
        ),
    ],
    ids=["empty", "single_zero_arg", "two_entry_chain", "string_plus_int_args"],
)
def test_to_key_transformers_round_trip(
    input_ts: List[Dict[str, Any]], expected: List[tuple]
) -> None:
    result = _to_key_transformers(input_ts)
    assert isinstance(result, list)
    assert len(result) == len(expected)
    for got, (want_name, want_args) in zip(result, expected):
        assert isinstance(got, KeyTransformer)
        assert got.name == want_name
        assert got.arguments == want_args
        assert got.range == Range(0, 0)
        assert got.name_range == Range(0, 0)
        assert got.argument_ranges == []


def test_to_key_transformers_defensive_copy() -> None:
    """Mutating the adapter's output Arguments must not leak to the source."""
    source = [{"name": "chars", "arguments": [10, 20]}]
    result = _to_key_transformers(source)
    result[0].arguments[0] = 999
    assert source[0]["arguments"][0] == 10


@pytest.mark.parametrize(
    "input_text, expected_alias, expected_expr, forbid",
    [
        (
            "message as msg|tag",
            "msg",
            "message AS msg",
            ["|", "tag"],
        ),
        (
            "message as msg|tag('red')",
            "msg",
            "message AS msg",
            ["|", "tag", "red"],
        ),
        (
            "message as msg|tag('red', 'blue')",
            "msg",
            "message AS msg",
            ["|", "tag", "red", "blue"],
        ),
        (
            "message|upper as msg|tag",
            "msg",
            "upper(message) AS msg",
            ["|", "tag"],
        ),
    ],
    ids=[
        "tag_no_arg",
        "tag_string_arg",
        "tag_multi_arg",
        "transformer_plus_renderer",
    ],
)
def test_to_sql_select_renderer_suffix(
    input_text: str,
    expected_alias: str,
    expected_expr: str,
    forbid: List[str],
) -> None:
    cols = {"message": Column(name="message", _type="String")}
    result = to_sql_select(input_text, cols)
    assert len(result.columns) == 1
    col = result.columns[0]
    assert col.alias == expected_alias
    assert col.sql_expr == expected_expr
    for sub in forbid:
        assert (
            sub not in col.sql_expr
        ), f"{sub!r} should be absent from {col.sql_expr!r}"


def test_to_sql_select_renderer_without_alias_errors() -> None:
    """``message|tag`` with no AS must raise — renderers require an alias."""
    cols = {"message": Column(name="message", _type="String")}
    with pytest.raises(Exception) as exc_info:
        to_sql_select("message|tag", cols)
    # Accepts FlyqlError, ParserError, or similar from the canonical parser.
    assert exc_info.value is not None
