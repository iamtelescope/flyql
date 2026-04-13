"""Cross-language parity tests for flyql.tokenize."""

import dataclasses
from typing import List

import pytest

from flyql.core.constants import CharType
from flyql.tokenize import Token, tokenize
from tests.core.helpers import load_tokenize_data

_FIXTURE = load_tokenize_data("query_tokens.json")
_TEST_CASES = _FIXTURE["tests"]

REQUIRED_QUERY_TYPES = {
    "flyqlKey",
    "flyqlOperator",
    "number",
    "string",
    "flyqlBoolean",
    "flyqlNull",
    "flyqlColumn",
    "flyqlError",
}

ROUND_TRIP_INPUTS = [
    "a=1",
    "x='y'",
    "status=200 and region='us-east'",
    "count>=10 or count<0",
    "key=*wild",
]


def _tokens_to_dicts(tokens: List[Token]) -> List[dict]:
    return [
        {"text": t.text, "type": t.type.value, "start": t.start, "end": t.end}
        for t in tokens
    ]


@pytest.mark.parametrize(
    "test_case",
    _TEST_CASES,
    ids=[tc["name"] for tc in _TEST_CASES],
)
def test_query_fixture_parity(test_case: dict) -> None:
    actual = tokenize(test_case["input"])
    assert _tokens_to_dicts(actual) == test_case["expected_tokens"]


def test_empty_input_returns_empty_list() -> None:
    assert tokenize("") == []


def test_columns_mode_raises_value_error() -> None:
    with pytest.raises(ValueError) as exc_info:
        tokenize("x", mode="columns")
    assert (
        str(exc_info.value)
        == "columns mode is only available in the JavaScript package"
    )


def test_round_trip_hand_crafted_inputs() -> None:
    for inp in ROUND_TRIP_INPUTS:
        tokens = tokenize(inp)
        assert "".join(t.text for t in tokens) == inp


def test_monotonic_offsets_across_fixtures_and_round_trip() -> None:
    all_inputs = [tc["input"] for tc in _TEST_CASES] + ROUND_TRIP_INPUTS
    for inp in all_inputs:
        tokens = tokenize(inp)
        if inp == "":
            assert tokens == []
            continue
        assert tokens[0].start == 0
        for i, tok in enumerate(tokens):
            assert tok.end > tok.start
            if i > 0:
                assert tok.start == tokens[i - 1].end
        assert tokens[-1].end == len(inp)


def test_fixture_covers_required_char_types() -> None:
    seen = set()
    for tc in _TEST_CASES:
        for tok in tc["expected_tokens"]:
            seen.add(tok["type"])
    missing = REQUIRED_QUERY_TYPES - seen
    assert not missing, f"fixture missing required types: {missing}"


def test_fixture_never_contains_unupgraded_flyql_value() -> None:
    for tc in _TEST_CASES:
        for tok in tc["expected_tokens"]:
            assert (
                tok["type"] != "flyqlValue"
            ), f"case {tc['name']} contains unupgraded flyqlValue"


@pytest.mark.parametrize("inp", ["val=Infinity", "val=NaN", "val=0x1F"])
def test_rejects_non_canonical_numerics(inp: str) -> None:
    tokens = tokenize(inp)
    value_token = tokens[-1]
    assert value_token.type.value == "flyqlColumn"


def test_token_is_frozen() -> None:
    token = Token(text="x", type=CharType.KEY, start=0, end=1)
    with pytest.raises(dataclasses.FrozenInstanceError):
        token.text = "y"  # type: ignore[misc]
