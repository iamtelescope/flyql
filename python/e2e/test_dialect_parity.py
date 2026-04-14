"""Dialect-parity E2E tests for Python FlyQL generators.

For each entry in dialect_parity_tests.json, generates SQL for ClickHouse,
StarRocks, and PostgreSQL using their respective Python generators, executes
each against the corresponding DB, and emits one report row per (dialect, test).

The cross-dialect assertion (same row IDs across all three) lives in
e2e/runner.py via _assert_dialect_parity. This module only emits report rows.
"""

import json
import sys
from pathlib import Path
from typing import Any

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from flyql.core.parser import parse  # noqa: E402

from flyql.generators.clickhouse.column import Column as CHColumn  # noqa: E402
from flyql.generators.clickhouse.generator import (
    to_sql_where as ch_to_sql_where,
)  # noqa: E402

from flyql.generators.starrocks.column import Column as SRColumn  # noqa: E402
from flyql.generators.starrocks.generator import (
    to_sql_where as sr_to_sql_where,
)  # noqa: E402

from flyql.generators.postgresql.column import Column as PGColumn  # noqa: E402
from flyql.generators.postgresql.generator import (
    to_sql_where as pg_to_sql_where,
)  # noqa: E402

from test_clickhouse_e2e import (
    ch_query,
    build_columns as build_ch_columns,
)  # noqa: E402
from test_starrocks_e2e import sr_query, build_columns as build_sr_columns  # noqa: E402
from test_postgresql_e2e import (
    pg_query,
    build_columns as build_pg_columns,
)  # noqa: E402


def _is_available(probe) -> bool:
    try:
        probe()
        return True
    except Exception:
        return False


REPO_ROOT = Path(__file__).resolve().parent.parent.parent
PARITY_FIXTURE = REPO_ROOT / "tests-data" / "e2e" / "dialect_parity_tests.json"

_results: list[dict[str, Any]] = []


def load_parity_cases() -> list[dict[str, Any]]:
    return json.loads(PARITY_FIXTURE.read_text()).get("tests", [])


def _ch_run(flyql_expr: str, columns: dict[str, CHColumn]) -> tuple[str, list[int]]:
    parsed = parse(flyql_expr)
    sql_where = ch_to_sql_where(parsed.current_node, columns)
    rows = ch_query(f"SELECT id FROM flyql_e2e_test WHERE {sql_where} ORDER BY id")
    return sql_where, [r["id"] for r in rows]


def _sr_run(flyql_expr: str, columns: dict[str, SRColumn]) -> tuple[str, list[int]]:
    parsed = parse(flyql_expr)
    sql_where = sr_to_sql_where(parsed.current_node, columns)
    rows = sr_query(f"SELECT id FROM flyql_e2e_test WHERE {sql_where} ORDER BY id")
    ids: list[int] = []
    for r in rows:
        v = r.get("id")
        if v is None and r:
            v = next(iter(r.values()))
        ids.append(int(v))
    return sql_where, sorted(ids)


def _pg_run(flyql_expr: str, columns: dict[str, PGColumn]) -> tuple[str, list[int]]:
    parsed = parse(flyql_expr)
    sql_where = pg_to_sql_where(parsed.current_node, columns)
    lines = pg_query(f"SELECT id FROM flyql_e2e_test WHERE {sql_where} ORDER BY id")
    return sql_where, [int(line.strip()) for line in lines if line.strip()]


@pytest.fixture(scope="module")
def ch_columns() -> dict[str, CHColumn]:
    return build_ch_columns()


@pytest.fixture(scope="module")
def sr_columns() -> dict[str, SRColumn]:
    return build_sr_columns()


@pytest.fixture(scope="module")
def pg_columns() -> dict[str, PGColumn]:
    return build_pg_columns()


@pytest.fixture(scope="module")
def ch_available() -> bool:
    return _is_available(lambda: ch_query("SELECT 1 AS ok"))


@pytest.fixture(scope="module")
def sr_available() -> bool:
    return _is_available(lambda: sr_query("SELECT 1 AS ok"))


@pytest.fixture(scope="module")
def pg_available() -> bool:
    return _is_available(lambda: pg_query("SELECT 1 AS ok"))


@pytest.mark.parametrize(
    "case",
    load_parity_cases(),
    ids=[c["name"] for c in load_parity_cases()],
)
def test_dialect_parity(
    ch_available: bool,
    sr_available: bool,
    pg_available: bool,
    ch_columns: dict[str, CHColumn],
    sr_columns: dict[str, SRColumn],
    pg_columns: dict[str, PGColumn],
    case: dict[str, Any],
) -> None:
    name = case["name"]
    flyql_expr = case["flyql"]
    expected_ids = sorted(case["expected_row_ids"])

    if not (ch_available and sr_available and pg_available):
        missing = [
            db
            for db, ok in [
                ("clickhouse", ch_available),
                ("starrocks", sr_available),
                ("postgresql", pg_available),
            ]
            if not ok
        ]
        pytest.skip(
            f"dialect parity requires all three DBs; missing: {', '.join(missing)}"
        )

    runners = [
        ("clickhouse", lambda: _ch_run(flyql_expr, ch_columns)),
        ("starrocks", lambda: _sr_run(flyql_expr, sr_columns)),
        ("postgresql", lambda: _pg_run(flyql_expr, pg_columns)),
    ]

    for db, runner in runners:
        result: dict[str, Any] = {
            "kind": "dialect_parity",
            "database": db,
            "name": name,
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
            result["returned_ids"] = sorted(ids)
            result["passed"] = result["returned_ids"] == expected_ids
        except Exception as e:
            result["error"] = str(e)
        _results.append(result)
        if result["error"]:
            pytest.fail(f"{db}: {result['error']}")
        assert result[
            "passed"
        ], f"{db} parity for '{flyql_expr}': expected {expected_ids}, got {result['returned_ids']}"
