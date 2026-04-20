"""Canonical reproducer tests for precedence-aware paren output.

Pinned against the 5 reproducers in
``e2e/baselines/pre-paren-cleanup-reproducers.md``. These must pass before
``scripts/regen_generator_fixtures.py`` is run (the sanity gate for Task 2.2
in tech-spec-minimal-sql-parens.md) — if the walker is buggy, catching it
here prevents poisoning the shared fixtures.
"""

import json
from pathlib import Path

import pytest

from flyql.core.parser import parse
from flyql.generators.clickhouse.column import Column as CHColumn
from flyql.generators.clickhouse.generator import to_sql_where as ch_where
from flyql.generators.postgresql.column import Column as PGColumn
from flyql.generators.postgresql.generator import to_sql_where as pg_where
from flyql.generators.starrocks.column import Column as SRColumn
from flyql.generators.starrocks.generator import to_sql_where as sr_where

TESTS_DATA = Path(__file__).parent.parent.parent.parent / "tests-data" / "generators"


def _load_columns(dialect: str, ColumnCls):
    path = TESTS_DATA / dialect / "columns.json"
    with open(path) as f:
        data = json.load(f)
    return {
        n: ColumnCls(fd["name"], fd["type"], fd.get("values"))
        for n, fd in data["columns"].items()
    }


DIALECTS = [
    pytest.param(
        "clickhouse", ch_where, _load_columns("clickhouse", CHColumn), id="clickhouse"
    ),
    pytest.param(
        "postgresql", pg_where, _load_columns("postgresql", PGColumn), id="postgresql"
    ),
    pytest.param(
        "starrocks", sr_where, _load_columns("starrocks", SRColumn), id="starrocks"
    ),
]


# Each reproducer maps (flyql_input) → (per-dialect expected_sql).
# Expected strings are authoritative canonical output after the refactor.
REPRODUCERS = [
    {
        "id": "same_precedence_chain",
        "input": "count > 1 and count < 2 and count > 3 and count > 5 and count > 6",
        "expected": {
            "clickhouse": "count > 1 AND count < 2 AND count > 3 AND count > 5 AND count > 6",
            "postgresql": '"count" > 1 AND "count" < 2 AND "count" > 3 AND "count" > 5 AND "count" > 6',
            "starrocks": "`count` > 1 AND `count` < 2 AND `count` > 3 AND `count` > 5 AND `count` > 6",
        },
    },
    {
        "id": "and_under_or_no_wrap",
        "input": "count = 1 or count = 2 and count = 3",
        "expected": {
            "clickhouse": "count = 1 OR count = 2 AND count = 3",
            "postgresql": '"count" = 1 OR "count" = 2 AND "count" = 3',
            "starrocks": "`count` = 1 OR `count` = 2 AND `count` = 3",
        },
    },
    {
        "id": "right_leaning_mixed",
        "input": "count = 1 or count = 2 and count = 3 or count = 4",
        "expected": {
            "clickhouse": "count = 1 OR count = 2 AND count = 3 OR count = 4",
            "postgresql": '"count" = 1 OR "count" = 2 AND "count" = 3 OR "count" = 4',
            "starrocks": "`count` = 1 OR `count` = 2 AND `count` = 3 OR `count` = 4",
        },
    },
    {
        "id": "or_under_and_wrap",
        "input": "count = 1 and (count = 2 or count = 3)",
        "expected": {
            "clickhouse": "count = 1 AND (count = 2 OR count = 3)",
            "postgresql": '"count" = 1 AND ("count" = 2 OR "count" = 3)',
            "starrocks": "`count` = 1 AND (`count` = 2 OR `count` = 3)",
        },
    },
    {
        "id": "not_atomicity_sole",
        "input": "not (count = 1 and count = 2)",
        "expected": {
            "clickhouse": "NOT (count = 1 AND count = 2)",
            "postgresql": 'NOT ("count" = 1 AND "count" = 2)',
            "starrocks": "NOT (`count` = 1 AND `count` = 2)",
        },
    },
    {
        "id": "not_as_atom_under_and",
        "input": "count = 5 and not (count = 1 or count = 2)",
        "expected": {
            "clickhouse": "count = 5 AND NOT (count = 1 OR count = 2)",
            "postgresql": '"count" = 5 AND NOT ("count" = 1 OR "count" = 2)',
            "starrocks": "`count` = 5 AND NOT (`count` = 1 OR `count` = 2)",
        },
    },
]


@pytest.mark.parametrize("dialect,generator,columns", DIALECTS)
@pytest.mark.parametrize("case", REPRODUCERS, ids=[c["id"] for c in REPRODUCERS])
def test_paren_reproducer(dialect, generator, columns, case):
    result = parse(case["input"])
    sql = generator(result.root, columns)
    assert (
        sql == case["expected"][dialect]
    ), f"{case['id']} / {dialect}: got {sql!r}, want {case['expected'][dialect]!r}"
