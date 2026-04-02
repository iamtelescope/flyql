"""StarRocks E2E tests for Python FlyQL generator.

Connects to a real StarRocks instance via HTTP SQL API, generates SQL from FlyQL queries
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

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from flyql.core.parser import parse  # noqa: E402
from flyql.generators.starrocks.column import Column  # noqa: E402
from flyql.generators.starrocks.generator import to_sql, generate_select  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
TEST_DATA_DIR = REPO_ROOT / "tests-data" / "e2e"

SR_HOST = os.environ.get("STARROCKS_HOST", "localhost")
SR_HTTP_PORT = os.environ.get("STARROCKS_HTTP_PORT", "18030")
SR_USER = os.environ.get("STARROCKS_USER", "root")
SR_PASS = os.environ.get("STARROCKS_PASSWORD", "")

_results: list[dict[str, Any]] = []


def sr_query(sql: str) -> list[dict[str, Any]]:
    """Execute a query against StarRocks via HTTP SQL API."""
    import urllib.request
    import urllib.error
    import base64

    url = f"http://{SR_HOST}:{SR_HTTP_PORT}/api/v1/catalogs/default_catalog/databases/flyql_test/sql"
    body = json.dumps({"query": f"{sql};"}).encode("utf-8")

    credentials = base64.b64encode(f"{SR_USER}:{SR_PASS}".encode()).decode()
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Basic {credentials}",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            text = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8") if e.fp else ""
        raise RuntimeError(f"StarRocks HTTP error {e.code}: {error_body}") from e
    except Exception as e:
        raise RuntimeError(f"StarRocks error: {e}") from e

    # StarRocks HTTP SQL API returns newline-delimited JSON:
    # {"connectionId":...}
    # {"meta":[...]}
    # {"data":[...]}  (one per row)
    # {"statistics":...}
    lines = [json.loads(line) for line in text.strip().split("\n") if line.strip()]

    meta: list[dict[str, str]] = []
    col_names: list[str] = []
    result_rows: list[dict[str, Any]] = []

    for obj in lines:
        if "meta" in obj:
            meta = obj["meta"]
            col_names = [m.get("name", f"col{i}") for i, m in enumerate(meta)]
        elif "data" in obj:
            row_values = obj["data"]
            if col_names:
                result_rows.append(dict(zip(col_names, row_values)))
            else:
                result_rows.append({"col0": row_values[0]} if row_values else {})

    return result_rows


def sr_init_db() -> None:
    """Run init.sql against StarRocks to create table and load data."""
    init_sql = TEST_DATA_DIR / "starrocks" / "init.sql"
    if not init_sql.exists():
        return

    content = init_sql.read_text()
    statements = [s.strip() for s in content.split(";") if s.strip()]

    import urllib.request
    import urllib.error
    import base64

    credentials = base64.b64encode(f"{SR_USER}:{SR_PASS}".encode()).decode()

    for stmt in statements:
        if not stmt:
            continue
        # Use the generic endpoint for DDL/DML
        db = (
            "flyql_test"
            if "USE flyql_test" not in stmt and "CREATE DATABASE" not in stmt
            else ""
        )
        catalog_path = (
            f"default_catalog/databases/{db}" if db else "default_catalog/databases/"
        )
        url = f"http://{SR_HOST}:{SR_HTTP_PORT}/api/v1/catalogs/{catalog_path}/sql"
        body = json.dumps({"query": f"{stmt};"}).encode("utf-8")

        req = urllib.request.Request(
            url,
            data=body,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Basic {credentials}",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                resp.read()
        except Exception:
            pass  # Ignore errors (table may already exist)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text())


def build_columns() -> dict[str, Column]:
    col_data = load_json(TEST_DATA_DIR / "starrocks" / "columns.json")
    columns: dict[str, Column] = {}
    for key, col in col_data["columns"].items():
        columns[key] = Column(
            name=col["name"],
            jsonstring=col.get("jsonstring", False),
            _type=col["type"],
            values=col.get("values"),
        )
    return columns


def load_test_cases() -> list[dict[str, Any]]:
    data = load_json(TEST_DATA_DIR / "test_cases.json")
    return [tc for tc in data["tests"] if "starrocks" in tc["databases"]]


def load_select_test_cases() -> list[dict[str, Any]]:
    data = load_json(TEST_DATA_DIR / "starrocks" / "select_test_cases.json")
    return data["tests"]


@pytest.fixture(scope="module")
def sr_available() -> bool:
    try:
        sr_init_db()
        rows = sr_query("SELECT 1 AS ok")
        return len(rows) > 0 and int(rows[0].get("ok", 0)) == 1
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
def test_starrocks_where(
    sr_available: bool,
    columns: dict[str, Column],
    name: str,
    flyql: str,
    expected_ids: list[int],
) -> None:
    result: dict[str, Any] = {
        "kind": "where",
        "database": "starrocks",
        "name": name,
        "flyql": flyql,
        "sql": "",
        "expected_ids": expected_ids,
        "returned_ids": [],
        "passed": False,
        "error": "",
    }

    if not sr_available:
        result["error"] = "StarRocks not available"
        _results.append(result)
        pytest.skip("StarRocks not available")
        return

    try:
        parsed = parse(flyql)
        sql_where = to_sql(parsed.current_node, columns)
        result["sql"] = sql_where

        query = f"SELECT id FROM flyql_e2e_test WHERE {sql_where} ORDER BY id"
        rows = sr_query(query)
        returned_ids = [int(r["id"]) for r in rows]
        result["returned_ids"] = returned_ids
        result["passed"] = ids_match(expected_ids, returned_ids)

        _results.append(result)
        assert result["passed"], f"expected {expected_ids}, got {returned_ids}"
    except Exception as e:
        result["error"] = str(e)
        _results.append(result)
        raise


@pytest.mark.parametrize(
    "name,select_columns,expected_rows",
    [
        (tc["name"], tc["select_columns"], tc["expected_rows"])
        for tc in load_select_test_cases()
    ],
    ids=[tc["name"] for tc in load_select_test_cases()],
)
def test_starrocks_select(
    sr_available: bool,
    columns: dict[str, Column],
    name: str,
    select_columns: str,
    expected_rows: list[list[str]],
) -> None:
    result: dict[str, Any] = {
        "kind": "select",
        "database": "starrocks",
        "name": name,
        "select_columns": select_columns,
        "sql": "",
        "expected_rows": expected_rows,
        "returned_rows": [],
        "passed": False,
        "error": "",
    }

    if not sr_available:
        result["error"] = "StarRocks not available"
        _results.append(result)
        pytest.skip("StarRocks not available")
        return

    try:
        select_result = generate_select(select_columns, columns)
        result["sql"] = select_result.sql

        query = f"SELECT {select_result.sql} FROM flyql_e2e_test ORDER BY id"
        rows = sr_query(query)
        raw_rows = [
            [str(v) if v is not None else "null" for v in row.values()] for row in rows
        ]
        # Strip JSON quotes from StarRocks JSON path values and normalize nulls
        returned_rows = [
            [
                (
                    cell[1:-1]
                    if len(cell) >= 2 and cell.startswith('"') and cell.endswith('"')
                    else ("null" if cell == "None" else cell)
                )
                for cell in row
            ]
            for row in raw_rows
        ]
        result["returned_rows"] = returned_rows
        result["passed"] = returned_rows == expected_rows

        _results.append(result)
        assert result["passed"], f"expected {expected_rows}, got {returned_rows}"
    except Exception as e:
        result["error"] = str(e)
        _results.append(result)
        raise
