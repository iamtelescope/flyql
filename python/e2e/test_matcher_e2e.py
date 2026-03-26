"""Matcher E2E tests for Python FlyQL — in-memory evaluation parity with database results."""

import json
import sys
from pathlib import Path
from typing import Any

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from flyql.matcher.evaluator import Evaluator  # noqa: E402
from flyql.matcher.record import Record  # noqa: E402
from flyql.core.parser import parse  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
TEST_DATA_DIR = REPO_ROOT / "tests-data" / "e2e"

_results: list[dict[str, Any]] = []


def load_json(path: Path) -> Any:
    return json.loads(path.read_text())


ROWS = load_json(TEST_DATA_DIR / "rows.json")["rows"]


def load_test_cases() -> list[dict[str, Any]]:
    data = load_json(TEST_DATA_DIR / "test_cases.json")
    return [
        tc
        for tc in data["tests"]
        if not any(
            x in tc["flyql"]
            for x in [
                "tags.",
                "metadata.",
                "meta_json.",
                "meta.'dc.region'",
                "meta.'0'",
                "meta.tags.",
                "json_meta",
                "hello*'",
                "'*@",
                "created_at<=",
            ]
        )
    ]


def match_row(query: str, data: dict[str, Any]) -> bool:
    result = parse(query)
    evaluator = Evaluator()
    record = Record(data)
    return evaluator.evaluate(result.current_node, record)


def ids_match(expected: list[int], got: list[int]) -> bool:
    return sorted(expected) == sorted(got)


@pytest.mark.parametrize(
    "name,flyql,expected_ids",
    [(tc["name"], tc["flyql"], tc["expected_ids"]) for tc in load_test_cases()],
    ids=[tc["name"] for tc in load_test_cases()],
)
def test_matcher_where(name: str, flyql: str, expected_ids: list[int]) -> None:
    result: dict[str, Any] = {
        "kind": "where",
        "database": "matcher",
        "name": name,
        "flyql": flyql,
        "sql": "(in-memory)",
        "expected_ids": expected_ids,
        "returned_ids": [],
        "passed": False,
        "error": "",
    }

    try:
        matched_ids = [row["id"] for row in ROWS if match_row(flyql, row)]
        result["returned_ids"] = matched_ids
        result["passed"] = ids_match(expected_ids, matched_ids)
        _results.append(result)
        assert result["passed"], f"expected {expected_ids}, got {matched_ids}"
    except Exception as e:
        result["error"] = str(e)
        _results.append(result)
        raise
