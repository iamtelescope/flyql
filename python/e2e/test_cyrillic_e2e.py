"""Cross-language Cyrillic (non-ASCII) E2E tests for Python FlyQL.

Two layers, both driven by the shared tests-data/e2e/cyrillic.json fixture:

  * matcher  — evaluates every case in-memory; identical expected_ids across
    Python/Go/JS prove cross-language parsing parity for non-ASCII input.
  * database — generates SQL per dialect and runs it against the dedicated
    flyql_cyrillic_test table in ClickHouse, StarRocks, and PostgreSQL.

Regression coverage for the byte-vs-codepoint offset bug in the Go parser.
Emits report rows compatible with e2e/runner.py when E2E_REPORT_JSON is set.
"""

import json
import sys
from pathlib import Path
from typing import Any

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from flyql.matcher.evaluator import Evaluator  # noqa: E402
from flyql.matcher.record import Record  # noqa: E402
from flyql.core.parser import parse  # noqa: E402

# Generator + per-DB helper imports are deliberately deferred into the database
# helpers below (not imported at module scope). The matcher layer needs only the
# parser + evaluator, so a failure importing a database helper module must not
# prevent this module from loading and silently drop ALL Cyrillic results
# (conftest aggregates via `from test_cyrillic_e2e import _results`).

CYRILLIC_TABLE = "flyql_cyrillic_test"

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
FIXTURE = REPO_ROOT / "tests-data" / "e2e" / "cyrillic.json"

_results: list[dict[str, Any]] = []


def _load_fixture() -> dict[str, Any]:
    return json.loads(FIXTURE.read_text())


_FIXTURE = _load_fixture()
ROWS = _FIXTURE["rows"]
CASES = _FIXTURE["tests"]


def _ids_match(expected: list[int], got: list[int]) -> bool:
    return sorted(expected) == sorted(got)


# --------------------------------------------------------------------------- #
# Matcher (in-memory)
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "case",
    CASES,
    ids=[c["name"] for c in CASES],
)
def test_cyrillic_matcher(case: dict[str, Any]) -> None:
    flyql_expr = case["flyql"]
    expected_ids = case["expected_ids"]

    result: dict[str, Any] = {
        "kind": "where",
        "database": "matcher",
        "name": case["name"],
        "flyql": flyql_expr,
        "sql": "(in-memory)",
        "expected_ids": expected_ids,
        "returned_ids": [],
        "passed": False,
        "error": "",
    }

    try:
        parsed = parse(flyql_expr)
        evaluator = Evaluator()
        matched_ids = [
            row["id"] for row in ROWS if evaluator.evaluate(parsed.root, Record(row))
        ]
        result["returned_ids"] = matched_ids
        result["passed"] = _ids_match(expected_ids, matched_ids)
        _results.append(result)
        assert result["passed"], f"expected {expected_ids}, got {matched_ids}"
    except Exception as e:
        result["error"] = str(e)
        _results.append(result)
        raise


# --------------------------------------------------------------------------- #
# Databases
# --------------------------------------------------------------------------- #


def _is_available(probe) -> bool:
    try:
        probe()
        return True
    except Exception:
        return False


@pytest.fixture(scope="module")
def ch_columns():
    from test_clickhouse_e2e import build_columns

    return build_columns()


@pytest.fixture(scope="module")
def sr_columns():
    from test_starrocks_e2e import build_columns

    return build_columns()


@pytest.fixture(scope="module")
def pg_columns():
    from test_postgresql_e2e import build_columns

    return build_columns()


def _ch_run(flyql_expr: str, columns) -> tuple[str, list[int]]:
    from flyql.generators.clickhouse.generator import to_sql_where
    from test_clickhouse_e2e import ch_query

    sql_where = to_sql_where(parse(flyql_expr).root, columns)
    rows = ch_query(f"SELECT id FROM {CYRILLIC_TABLE} WHERE {sql_where} ORDER BY id")
    return sql_where, sorted(int(r["id"]) for r in rows)


def _sr_run(flyql_expr: str, columns) -> tuple[str, list[int]]:
    from flyql.generators.starrocks.generator import to_sql_where
    from test_starrocks_e2e import sr_query

    sql_where = to_sql_where(parse(flyql_expr).root, columns)
    rows = sr_query(f"SELECT id FROM {CYRILLIC_TABLE} WHERE {sql_where} ORDER BY id")
    ids: list[int] = []
    for r in rows:
        v = r.get("id")
        if v is None and r:
            v = next(iter(r.values()))
        ids.append(int(v))
    return sql_where, sorted(ids)


def _pg_run(flyql_expr: str, columns) -> tuple[str, list[int]]:
    from flyql.generators.postgresql.generator import to_sql_where
    from test_postgresql_e2e import pg_query

    sql_where = to_sql_where(parse(flyql_expr).root, columns)
    lines = pg_query(f"SELECT id FROM {CYRILLIC_TABLE} WHERE {sql_where} ORDER BY id")
    return sql_where, sorted(int(line.strip()) for line in lines if line.strip())


@pytest.fixture(scope="module")
def ch_available() -> bool:
    from test_clickhouse_e2e import ch_query

    return _is_available(lambda: ch_query("SELECT 1 AS ok"))


@pytest.fixture(scope="module")
def sr_available() -> bool:
    from test_starrocks_e2e import sr_query

    return _is_available(lambda: sr_query("SELECT 1 AS ok"))


@pytest.fixture(scope="module")
def pg_available() -> bool:
    from test_postgresql_e2e import pg_query

    return _is_available(lambda: pg_query("SELECT 1 AS ok"))


_DB_CASES = [
    (case, db)
    for case in CASES
    for db in case.get("databases", [])
]


@pytest.mark.parametrize(
    "case,db",
    _DB_CASES,
    ids=[f"{c['name']}-{db}" for c, db in _DB_CASES],
)
def test_cyrillic_database(
    case,
    db,
    ch_columns,
    sr_columns,
    pg_columns,
    ch_available,
    sr_available,
    pg_available,
) -> None:
    flyql_expr = case["flyql"]
    expected_ids = sorted(case["expected_ids"])

    runners = {
        "clickhouse": (ch_available, lambda: _ch_run(flyql_expr, ch_columns)),
        "starrocks": (sr_available, lambda: _sr_run(flyql_expr, sr_columns)),
        "postgresql": (pg_available, lambda: _pg_run(flyql_expr, pg_columns)),
    }
    available, runner = runners[db]

    if not available:
        pytest.skip(f"{db} not available")

    result: dict[str, Any] = {
        "kind": "where",
        "database": db,
        "name": case["name"],
        "flyql": flyql_expr,
        "sql": "",
        "expected_ids": expected_ids,
        "returned_ids": [],
        "passed": False,
        "error": "",
    }

    try:
        sql_text, ids = runner()
        result["sql"] = sql_text
        result["returned_ids"] = ids
        result["passed"] = ids == expected_ids
        _results.append(result)
        assert result["passed"], f"{db}: expected {expected_ids}, got {ids}"
    except Exception as e:
        result["error"] = str(e)
        _results.append(result)
        raise
