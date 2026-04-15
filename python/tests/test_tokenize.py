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


def test_pins_reproduction_case_startof_week() -> None:
    tokens = tokenize("created_at > startOf('week')")
    texts = [t.text for t in tokens]
    types = [t.type.value for t in tokens]
    assert "'week'" in texts
    week_idx = texts.index("'week'")
    assert types[week_idx] == "string"
    assert tokens[-1].text == ")"
    assert tokens[-1].type.value == "flyqlOperator"
    assert "startOf" in texts
    fn_idx = texts.index("startOf")
    assert types[fn_idx] == "flyqlFunction"


@pytest.mark.parametrize(
    "inp,expected_text",
    [
        ("t > ago(1h)", "1h"),
        ("t > ago(1h30m)", "1h30m"),
        ("t > ago(2w3d)", "2w3d"),
    ],
)
def test_duration_literals_upgrade_to_number(inp: str, expected_text: str) -> None:
    tokens = tokenize(inp)
    matches = [t for t in tokens if t.text == expected_text]
    assert len(matches) == 1, f"expected exactly one token with text={expected_text!r}"
    assert matches[0].type.value == "number"


@pytest.mark.parametrize("inp", ["x=whom", "x=salt", "x=dim"])
def test_plain_identifiers_not_upgraded_as_duration(inp: str) -> None:
    tokens = tokenize(inp)
    assert tokens[-1].type.value == "flyqlColumn"


def test_mid_typing_function_call_keeps_function_type() -> None:
    tokens = tokenize("t > ago(")
    assert "".join(t.text for t in tokens) == "t > ago("
    matches = [t for t in tokens if t.text == "ago"]
    assert len(matches) == 1
    assert matches[0].type.value == "flyqlFunction"


def test_mid_typing_partial_duration() -> None:
    tokens = tokenize("t > ago(1h")
    assert "".join(t.text for t in tokens) == "t > ago(1h"
    matches = [t for t in tokens if t.text == "ago"]
    assert matches and matches[0].type.value == "flyqlFunction"


def test_function_call_followed_by_bool_op() -> None:
    tokens = tokenize("t > ago(1h) and status = 200")
    assert "".join(t.text for t in tokens) == "t > ago(1h) and status = 200"
    assert any(t.text == "ago" and t.type.value == "flyqlFunction" for t in tokens)
    assert any(t.text == "1h" and t.type.value == "number" for t in tokens)
    assert any(t.text == "and" and t.type.value == "flyqlOperator" for t in tokens)


def test_whitespace_only_input_emits_space_token() -> None:
    tokens = tokenize("   ")
    assert len(tokens) == 1
    assert tokens[0].text == "   "
    assert tokens[0].type.value == "space"
    assert tokens[0].start == 0
    assert tokens[0].end == 3


def test_token_is_frozen() -> None:
    token = Token(text="x", type=CharType.KEY, start=0, end=1)
    with pytest.raises(dataclasses.FrozenInstanceError):
        token.text = "y"  # type: ignore[misc]
