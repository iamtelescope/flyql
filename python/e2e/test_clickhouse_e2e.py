"""ClickHouse E2E tests for Python FlyQL generator.

Connects to a real ClickHouse instance, generates SQL from FlyQL queries
using the Python generator, executes the SQL, and validates returned IDs
match expected results from the shared test cases.

Outputs a JSON report compatible with the e2e runner when E2E_REPORT_JSON is set.
"""

import json
import os
import sys
from pathlib import Path
from typing import Any

import pytest

# Add python/ to path so we can import flyql
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from flyql.core.parser import parse  # noqa: E402
from flyql.generators.clickhouse.column import Column  # noqa: E402
from flyql.generators.clickhouse.generator import to_sql, generate_select  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
TEST_DATA_DIR = REPO_ROOT / "tests-data" / "e2e"

CH_HOST = os.environ.get("CLICKHOUSE_HOST", "localhost")
CH_HTTP_PORT = os.environ.get("CLICKHOUSE_HTTP_PORT", "18123")
CH_USER = os.environ.get("CLICKHOUSE_USER", "flyql")
CH_PASS = os.environ.get("CLICKHOUSE_PASSWORD", "flyql")

_results: list[dict[str, Any]] = []


def ch_query(sql: str) -> list[dict[str, Any]]:
    """Execute a query against ClickHouse via HTTP interface."""
    import urllib.request
    import urllib.parse

    params = urllib.parse.urlencode(
        {
            "user": CH_USER,
            "password": CH_PASS,
            "default_format": "JSONEachRow",
        }
    )
    url = f"http://{CH_HOST}:{CH_HTTP_PORT}/?{params}"

    req = urllib.request.Request(url, data=sql.encode("utf-8"), method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            text = resp.read().decode("utf-8").strip()
    except Exception as e:
        raise RuntimeError(f"ClickHouse error: {e}") from e

    if not text:
        return []
    return [json.loads(line) for line in text.split("\n")]


def load_json(path: Path) -> Any:
    return json.loads(path.read_text())


def build_columns() -> dict[str, Column]:
    col_data = load_json(TEST_DATA_DIR / "clickhouse" / "columns.json")
    columns: dict[str, Column] = {}
    for key, col in col_data["columns"].items():
        columns[key] = Column(
            name=col["name"],
            jsonstring=col["jsonstring"],
            _type=col["type"],
            values=col.get("values"),
        )
    return columns


def load_test_cases() -> list[dict[str, Any]]:
    data = load_json(TEST_DATA_DIR / "test_cases.json")
    return [tc for tc in data["tests"] if "clickhouse" in tc["databases"]]


@pytest.fixture(scope="module")
def ch_available() -> bool:
    try:
        rows = ch_query("SELECT 1 AS ok")
        return len(rows) > 0 and rows[0]["ok"] == 1
    except Exception:
        return False


@pytest.fixture(scope="module")
def columns() -> dict[str, Column]:
    return build_columns()


def ids_match(expected: list[int], got: list[int]) -> bool:
    return sorted(expected) == sorted(got)


@pytest.mark.parametrize(
    "name,flyql,expected_ids",
    [(tc["name"], tc["flyql"], tc["expected_ids"]) for tc in load_test_cases()],
    ids=[tc["name"] for tc in load_test_cases()],
)
def test_clickhouse_where(
    ch_available: bool,
    columns: dict[str, Column],
    name: str,
    flyql: str,
    expected_ids: list[int],
) -> None:
    result: dict[str, Any] = {
        "kind": "where",
        "database": "clickhouse",
        "name": name,
        "flyql": flyql,
        "sql": "",
        "expected_ids": expected_ids,
        "returned_ids": [],
        "passed": False,
        "error": "",
    }

    if not ch_available:
        result["error"] = "ClickHouse not available"
        _results.append(result)
        pytest.skip("ClickHouse not available")
        return

    try:
        parsed = parse(flyql)
        sql_where = to_sql(parsed.current_node, columns)
        result["sql"] = sql_where

        query = f"SELECT id FROM flyql_e2e_test WHERE {sql_where} ORDER BY id"
        rows = ch_query(query)
        returned_ids = [r["id"] for r in rows]
        result["returned_ids"] = returned_ids
        result["passed"] = ids_match(expected_ids, returned_ids)

        _results.append(result)
        assert result["passed"], f"expected {expected_ids}, got {returned_ids}"
    except Exception as e:
        result["error"] = str(e)
        _results.append(result)
        raise


def load_select_test_cases() -> list[dict[str, Any]]:
    data = load_json(TEST_DATA_DIR / "clickhouse" / "select_test_cases.json")
    return data["tests"]


@pytest.mark.parametrize(
    "name,select_columns,expected_rows",
    [
        (tc["name"], tc["select_columns"], tc["expected_rows"])
        for tc in load_select_test_cases()
    ],
    ids=[tc["name"] for tc in load_select_test_cases()],
)
def test_clickhouse_select(
    ch_available: bool,
    columns: dict[str, Column],
    name: str,
    select_columns: str,
    expected_rows: list[list[str]],
) -> None:
    result: dict[str, Any] = {
        "kind": "select",
        "database": "clickhouse",
        "name": name,
        "select_columns": select_columns,
        "sql": "",
        "expected_rows": expected_rows,
        "returned_rows": [],
        "passed": False,
        "error": "",
    }

    if not ch_available:
        result["error"] = "ClickHouse not available"
        _results.append(result)
        pytest.skip("ClickHouse not available")
        return

    try:
        select_result = generate_select(select_columns, columns)
        result["sql"] = select_result.sql

        query = f"SELECT {select_result.sql} FROM flyql_e2e_test ORDER BY id"
        rows = ch_query(query)
        returned_rows = [[str(v) for v in row.values()] for row in rows]
        result["returned_rows"] = returned_rows
        result["passed"] = returned_rows == expected_rows

        _results.append(result)
        assert result["passed"], f"expected {expected_rows}, got {returned_rows}"
    except Exception as e:
        result["error"] = str(e)
        _results.append(result)
        raise
