import json
import os

import pytest

from flyql.columns import parse, diagnose
from flyql.core.column import Column
from flyql.core.validator import (
    CODE_UNKNOWN_COLUMN,
    CODE_UNKNOWN_TRANSFORMER,
    CODE_ARG_COUNT,
    CODE_ARG_TYPE,
    CODE_CHAIN_TYPE,
)

FIXTURE_PATH = os.path.join(
    os.path.dirname(__file__),
    "..",
    "..",
    "..",
    "tests-data",
    "columns",
    "validator.json",
)
SHARED_DATA = json.loads(open(FIXTURE_PATH, "r").read())


def make_column(name: str, normalized_type: str) -> Column:
    return Column(
        name=name,
        jsonstring=False,
        _type=normalized_type,
        normalized_type=normalized_type,
        match_name=name,
    )


def make_columns(defs):
    return [make_column(d["name"], d["normalized_type"]) for d in defs]


@pytest.mark.parametrize("tc", SHARED_DATA["tests"], ids=lambda tc: tc["name"])
def test_shared_fixtures(tc):
    caps = tc.get("capabilities", {"transformers": True})
    try:
        parsed = parse(tc["input"], capabilities=caps)
    except Exception:
        parsed = []
    columns = make_columns(tc["columns"])
    diags = diagnose(parsed, columns)
    assert len(diags) == len(
        tc["expected_diagnostics"]
    ), f"Expected {len(tc['expected_diagnostics'])} diagnostics, got {len(diags)}"
    for i, expected in enumerate(tc["expected_diagnostics"]):
        assert diags[i].code == expected["code"]
        assert diags[i].severity == expected["severity"]
        assert diags[i].range.start == expected["range"][0]
        assert diags[i].range.end == expected["range"][1]
        if "message_contains" in expected:
            assert expected["message_contains"] in diags[i].message


def test_empty_returns_empty():
    diags = diagnose([], [make_column("level", "string")])
    assert diags == []


def test_valid_column_no_diagnostics():
    cols = parse("level", capabilities={"transformers": True})
    diags = diagnose(cols, [make_column("level", "string")])
    assert diags == []


def test_valid_column_with_transformer():
    cols = parse("level|upper", capabilities={"transformers": True})
    diags = diagnose(cols, [make_column("level", "string")])
    assert diags == []


def test_unknown_column():
    cols = parse("foo", capabilities={"transformers": True})
    diags = diagnose(cols, [make_column("level", "string")])
    assert len(diags) == 1
    assert diags[0].code == CODE_UNKNOWN_COLUMN
    assert diags[0].range.start == 0
    assert diags[0].range.end == 3


def test_unknown_transformer():
    cols = parse("level|zzzz", capabilities={"transformers": True})
    diags = diagnose(cols, [make_column("level", "string")])
    assert len(diags) == 1
    assert diags[0].code == CODE_UNKNOWN_TRANSFORMER
    assert diags[0].range.start == 6
    assert diags[0].range.end == 10


def test_chain_type_mismatch():
    cols = parse("level|len|upper", capabilities={"transformers": True})
    diags = diagnose(cols, [make_column("level", "string")])
    assert any(d.code == CODE_CHAIN_TYPE for d in diags)


def test_dotted_column_highlights_base():
    cols = parse("resource.service.name", capabilities={"transformers": True})
    diags = diagnose(cols, [make_column("level", "string")])
    assert len(diags) == 1
    assert diags[0].range.start == 0
    assert diags[0].range.end == 8  # "resource"
