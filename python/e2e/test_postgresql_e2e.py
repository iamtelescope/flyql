"""PostgreSQL E2E tests for Python FlyQL generator."""

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from flyql.core.parser import parse  # noqa: E402
from flyql.generators.postgresql.column import Column  # noqa: E402
from flyql.generators.postgresql.generator import (
    to_sql_where,
    to_sql_select,
)  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
TEST_DATA_DIR = REPO_ROOT / "tests-data" / "e2e"

PG_HOST = os.environ.get("POSTGRESQL_HOST", "localhost")
PG_PORT = os.environ.get("POSTGRESQL_PORT", "15432")
PG_USER = os.environ.get("POSTGRESQL_USER", "flyql")
PG_PASS = os.environ.get("POSTGRESQL_PASSWORD", "flyql")
PG_DB = os.environ.get("POSTGRESQL_DB", "flyql_test")

_results: list[dict[str, Any]] = []


def pg_query(sql: str) -> list[str]:
    """Execute a query via psql, return lines."""
    env = {
        **os.environ,
        "PGHOST": PG_HOST,
        "PGPORT": PG_PORT,
        "PGUSER": PG_USER,
        "PGPASSWORD": PG_PASS,
        "PGDATABASE": PG_DB,
    }
    result = subprocess.run(
        ["psql", "-t", "-A", "-F", "\t", "-c", sql],
        env=env,
        capture_output=True,
        text=True,
        timeout=10,
    )
    if result.returncode != 0:
        raise RuntimeError(f"psql error: {result.stderr.strip()}")
    return [l for l in result.stdout.strip().split("\n") if l.strip()]


def pg_query_rows(sql: str) -> list[list[str]]:
    lines = pg_query(sql)
    return [line.split("\t") for line in lines]


def load_json(path: Path) -> Any:
    return json.loads(path.read_text())


def build_columns() -> dict[str, Column]:
    col_data = load_json(TEST_DATA_DIR / "postgresql" / "columns.json")
    columns: dict[str, Column] = {}
    for key, col in col_data["columns"].items():
        c = Column(
            name=col["name"],
            _type=col["type"],
            values=col.get("values"),
        )
        if col.get("raw_identifier"):
            c.with_raw_identifier(col["raw_identifier"])
        columns[key] = c
    return columns


def load_test_cases() -> list[dict[str, Any]]:
    data = load_json(TEST_DATA_DIR / "test_cases.json")
    return [tc for tc in data["tests"] if "postgresql" in tc["databases"]]


def build_join_columns() -> dict[str, Column]:
    col_data = load_json(TEST_DATA_DIR / "postgresql" / "join_columns.json")
    columns: dict[str, Column] = {}
    for key, col in col_data["columns"].items():
        c = Column(
            name=col["name"],
            _type=col["type"],
            values=col.get("values"),
        )
        if col.get("raw_identifier"):
            c.with_raw_identifier(col["raw_identifier"])
        columns[key] = c
    return columns


def load_join_test_cases() -> list[dict[str, Any]]:
    data = load_json(TEST_DATA_DIR / "join_test_cases.json")
    return [tc for tc in data["tests"] if "postgresql" in tc["databases"]]


def load_select_test_cases() -> list[dict[str, Any]]:
    data = load_json(TEST_DATA_DIR / "postgresql" / "select_test_cases.json")
    return data["tests"]


def load_join_select_test_cases() -> list[dict[str, Any]]:
    data = load_json(TEST_DATA_DIR / "postgresql" / "join_select_test_cases.json")
    return data["tests"]


@pytest.fixture(scope="module")
def pg_available() -> bool:
    try:
        lines = pg_query("SELECT 1 AS ok")
        return len(lines) > 0 and lines[0].strip() == "1"
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
def test_postgresql_where(
    pg_available: bool,
    columns: dict[str, Column],
    name: str,
    flyql: str,
    expected_ids: list[int],
) -> None:
    result: dict[str, Any] = {
        "kind": "where",
        "database": "postgresql",
        "name": name,
        "flyql": flyql,
        "sql": "",
        "expected_ids": expected_ids,
        "returned_ids": [],
        "passed": False,
        "error": "",
    }

    if not pg_available:
        result["error"] = "PostgreSQL not available"
        _results.append(result)
        pytest.skip("PostgreSQL not available")
        return

    try:
        parsed = parse(flyql)
        sql_where = to_sql_where(parsed.root, columns)
        result["sql"] = sql_where

        query = f"SELECT id FROM flyql_e2e_test WHERE {sql_where} ORDER BY id"
        lines = pg_query(query)
        returned_ids = [int(l.strip()) for l in lines if l.strip()]
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
def test_postgresql_select(
    pg_available: bool,
    columns: dict[str, Column],
    name: str,
    select_columns: str,
    expected_rows: list[list[str]],
) -> None:
    result: dict[str, Any] = {
        "kind": "select",
        "database": "postgresql",
        "name": name,
        "select_columns": select_columns,
        "sql": "",
        "expected_rows": expected_rows,
        "returned_rows": [],
        "passed": False,
        "error": "",
    }

    if not pg_available:
        result["error"] = "PostgreSQL not available"
        _results.append(result)
        pytest.skip("PostgreSQL not available")
        return

    try:
        select_result = to_sql_select(select_columns, columns)
        result["sql"] = select_result.sql

        query = f"SELECT {select_result.sql} FROM flyql_e2e_test ORDER BY id"
        raw_rows = pg_query_rows(query)
        # Strip JSON quotes from raw jsonb values (psql returns "value" for jsonb ->)
        expected_col_count = len(expected_rows[0]) if expected_rows else 0
        rows = []
        for row in raw_rows:
            cleaned = [
                (
                    cell[1:-1]
                    if len(cell) >= 2 and cell.startswith('"') and cell.endswith('"')
                    else cell
                )
                for cell in row
            ]
            # psql omits trailing tab-separated NULLs; pad to expected column count
            while len(cleaned) < expected_col_count:
                cleaned.append("")
            rows.append(cleaned)
        result["returned_rows"] = rows
        result["passed"] = rows == expected_rows

        _results.append(result)
        assert result["passed"], f"expected {expected_rows}, got {rows}"
    except Exception as e:
        result["error"] = str(e)
        _results.append(result)
        raise


@pytest.fixture(scope="module")
def join_columns() -> dict[str, Column]:
    return build_join_columns()


@pytest.mark.parametrize(
    "name,flyql,expected_ids",
    [(tc["name"], tc["flyql"], tc["expected_ids"]) for tc in load_join_test_cases()],
    ids=[tc["name"] for tc in load_join_test_cases()],
)
def test_postgresql_join(
    pg_available: bool,
    join_columns: dict[str, Column],
    name: str,
    flyql: str,
    expected_ids: list[int],
) -> None:
    result: dict[str, Any] = {
        "kind": "where",
        "database": "postgresql",
        "name": name,
        "flyql": flyql,
        "sql": "",
        "expected_ids": expected_ids,
        "returned_ids": [],
        "passed": False,
        "error": "",
    }

    if not pg_available:
        result["error"] = "PostgreSQL not available"
        _results.append(result)
        pytest.skip("PostgreSQL not available")
        return

    try:
        parsed = parse(flyql)
        sql_where = to_sql_where(parsed.root, join_columns)
        result["sql"] = sql_where

        query = f"SELECT t.id FROM flyql_e2e_test t INNER JOIN flyql_e2e_related r ON t.id = r.test_id WHERE {sql_where} ORDER BY t.id"
        lines = pg_query(query)
        returned_ids = [int(l.strip()) for l in lines if l.strip()]
        result["returned_ids"] = returned_ids
        result["passed"] = ids_match(expected_ids, returned_ids)

        _results.append(result)
        assert result["passed"], f"expected {expected_ids}, got {returned_ids}"
    except Exception as e:
        result["error"] = str(e)
        _results.append(result)
        raise


@pytest.fixture(scope="module")
def join_select_columns() -> dict[str, Column]:
    return build_join_columns()


@pytest.mark.parametrize(
    "name,select_columns,expected_rows",
    [
        (tc["name"], tc["select_columns"], tc["expected_rows"])
        for tc in load_join_select_test_cases()
    ],
    ids=[tc["name"] for tc in load_join_select_test_cases()],
)
def test_postgresql_join_select(
    pg_available: bool,
    join_select_columns: dict[str, Column],
    name: str,
    select_columns: str,
    expected_rows: list[list[str]],
) -> None:
    result: dict[str, Any] = {
        "kind": "select",
        "database": "postgresql",
        "name": name,
        "select_columns": select_columns,
        "sql": "",
        "expected_rows": expected_rows,
        "returned_rows": [],
        "passed": False,
        "error": "",
    }

    if not pg_available:
        result["error"] = "PostgreSQL not available"
        _results.append(result)
        pytest.skip("PostgreSQL not available")
        return

    try:
        select_result = to_sql_select(select_columns, join_select_columns)
        result["sql"] = select_result.sql

        query = f"SELECT {select_result.sql} FROM flyql_e2e_test t INNER JOIN flyql_e2e_related r ON t.id = r.test_id ORDER BY t.id"
        raw_rows = pg_query_rows(query)
        # Strip JSON quotes from raw jsonb values (psql returns "value" for jsonb ->)
        expected_col_count = len(expected_rows[0]) if expected_rows else 0
        rows = []
        for row in raw_rows:
            cleaned = [
                (
                    cell[1:-1]
                    if len(cell) >= 2 and cell.startswith('"') and cell.endswith('"')
                    else cell
                )
                for cell in row
            ]
            # psql omits trailing tab-separated NULLs; pad to expected column count
            while len(cleaned) < expected_col_count:
                cleaned.append("")
            rows.append(cleaned)
        result["returned_rows"] = rows
        result["passed"] = rows == expected_rows

        _results.append(result)
        assert result["passed"], f"expected {expected_rows}, got {rows}"
    except Exception as e:
        result["error"] = str(e)
        _results.append(result)
        raise
