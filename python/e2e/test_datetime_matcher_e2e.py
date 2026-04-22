"""Cross-language parity e2e for Date/DateTime matcher coercion.

Loads the shared fixture at ``tests-data/e2e/datetime_matcher_cases.json``
with a column schema + datetime-shaped rows + query cases, evaluates each
query against every row, and asserts the matched-id list matches the
expected list. Go and JS e2e tests run the same fixture; identical output
across all three is the parity contract.

Also runs a native-type parity suite where the rows are built with
Python ``datetime`` objects rather than ISO strings. Go/JS counterparts
build the same semantic rows using ``time.Time`` / ``Date``. Since the
native types can't be serialized in the shared JSON fixture, this
language-local test is how we pin native-type parity across
implementations — the orchestrator's ``language: "all"`` dedup only
collapses entries when Python, Go, and JS produce identical ids.
"""

from __future__ import annotations

import json
import sys
import warnings
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from flyql.core.column import ColumnSchema  # noqa: E402
from flyql.core.parser import parse  # noqa: E402
from flyql.matcher.evaluator import Evaluator  # noqa: E402
from flyql.matcher.record import Record  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
FIXTURE_PATH = REPO_ROOT / "tests-data" / "e2e" / "datetime_matcher_cases.json"

_results: list[dict[str, Any]] = []

_FIXTURE = json.loads(FIXTURE_PATH.read_text())
_SCHEMA = ColumnSchema.from_plain_object(_FIXTURE["columns"])
_ROWS: list[dict[str, Any]] = _FIXTURE["rows"]


def _match_row(query: str, row: dict[str, Any]) -> bool:
    ast = parse(query).root
    # The migration warning for Date columns receiving datetime-shaped
    # values is expected in this fixture (event_day with time-bearing
    # data in some rows) — suppress to keep e2e output clean.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        evaluator = Evaluator(columns=_SCHEMA)
        return evaluator.evaluate(ast, Record(row))


def _ids_match(expected: list[int], got: list[int]) -> bool:
    return sorted(expected) == sorted(got)


@pytest.mark.parametrize(
    "name,query,expected_ids",
    [(tc["name"], tc["query"], tc["expected_ids"]) for tc in _FIXTURE["tests"]],
    ids=[tc["name"] for tc in _FIXTURE["tests"]],
)
def test_datetime_matcher_e2e(name: str, query: str, expected_ids: list[int]) -> None:
    result: dict[str, Any] = {
        "kind": "where",
        "database": "matcher",
        "name": f"datetime/{name}",
        "flyql": query,
        "sql": "(in-memory)",
        "expected_ids": expected_ids,
        "returned_ids": [],
        "passed": False,
        "error": "",
    }
    try:
        matched_ids = [row["id"] for row in _ROWS if _match_row(query, row)]
        result["returned_ids"] = matched_ids
        result["passed"] = _ids_match(expected_ids, matched_ids)
        _results.append(result)
        assert result["passed"], f"expected {expected_ids}, got {matched_ids}"
    except Exception as e:  # pragma: no cover — reported via e2e JSON
        result["error"] = str(e)
        _results.append(result)
        raise


# ---------------------------------------------------------------------------
# Native-type parity: same semantic rows, but values are Python datetime /
# date objects rather than ISO strings. The Go and JS e2e tests build the
# same semantic rows with their native types (time.Time / Date) and run
# the same query set. The orchestrator's cross-language dedup pins parity.
# ---------------------------------------------------------------------------

_NATIVE_SCHEMA = ColumnSchema.from_plain_object(
    {
        "id": {"type": "int"},
        "ts_utc": {"type": "datetime"},
        "event_day": {"type": "date"},
    }
)

# Rows built from Python-native ``datetime``/``date`` objects (not ISO
# strings). The Go and JS e2e counterparts build rows with the exact
# same instants using their native types (time.Time / Date); the
# orchestrator's dedup pins cross-language parity.
#
# Important: every datetime is tz-aware UTC so the instant is
# unambiguous and can be reproduced identically in Go (via
# ``time.Unix(..., 0).UTC()`` or ``time.Date(..., time.UTC)``) and JS
# (via ``new Date(Date.UTC(...))``). DST fold semantics are deliberately
# out of scope here — they're exercised via the ISO-string cases in
# the shared fixture.
_NATIVE_ROWS: list[dict[str, Any]] = [
    {
        "id": 1,
        "ts_utc": datetime(2026, 4, 6, 10, 0, tzinfo=timezone.utc),
        "event_day": date(2026, 4, 6),
    },
    {
        "id": 2,
        "ts_utc": datetime(2026, 4, 6, 12, 0, tzinfo=timezone.utc),
        "event_day": date(2026, 4, 7),
    },
    {
        "id": 3,
        # Sub-ms precision — truncates to 21:00:00.000 UTC under Decision 23.
        "ts_utc": datetime(2026, 4, 6, 21, 0, 0, 500, tzinfo=timezone.utc),
        "event_day": date(2026, 4, 5),
    },
]

_NATIVE_CASES = [
    # (name, query, expected_ids)
    ("native_datetime_gt", "ts_utc > '2026-04-06T11:00:00Z'", [2, 3]),
    ("native_datetime_lt", "ts_utc < '2026-04-06T11:00:00Z'", [1]),
    ("native_datetime_ms_truncation", "ts_utc = '2026-04-06T21:00:00Z'", [3]),
    ("native_datetime_ne", "ts_utc != '2026-04-06T10:00:00Z'", [2, 3]),
    ("native_date_equals", "event_day = '2026-04-06'", [1]),
    (
        "native_date_range",
        "event_day > '2026-04-05' and event_day <= '2026-04-07'",
        [1, 2],
    ),
    ("native_date_in_list", "event_day in ['2026-04-05', '2026-04-07']", [2, 3]),
]


def _match_native(query: str, row: dict[str, Any]) -> bool:
    ast = parse(query).root
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        evaluator = Evaluator(columns=_NATIVE_SCHEMA)
        return evaluator.evaluate(ast, Record(row))


@pytest.mark.parametrize(
    "name,query,expected_ids",
    _NATIVE_CASES,
    ids=[c[0] for c in _NATIVE_CASES],
)
def test_datetime_native_types_e2e(
    name: str, query: str, expected_ids: list[int]
) -> None:
    result: dict[str, Any] = {
        "kind": "where",
        "database": "matcher",
        "name": f"datetime/{name}",
        "flyql": query,
        "sql": "(in-memory, native types)",
        "expected_ids": expected_ids,
        "returned_ids": [],
        "passed": False,
        "error": "",
    }
    try:
        matched_ids = [row["id"] for row in _NATIVE_ROWS if _match_native(query, row)]
        result["returned_ids"] = matched_ids
        result["passed"] = _ids_match(expected_ids, matched_ids)
        _results.append(result)
        assert result["passed"], f"expected {expected_ids}, got {matched_ids}"
    except Exception as e:  # pragma: no cover
        result["error"] = str(e)
        _results.append(result)
        raise
