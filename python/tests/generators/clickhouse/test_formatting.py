import json
from pathlib import Path

import pytest

from flyql.core.parser import parse
from flyql.generators.clickhouse.column import Column
from flyql.generators.clickhouse.generator import (
    GeneratorOptions,
    to_sql_select,
    to_sql_select_with_options,
    to_sql_where,
    to_sql_where_with_options,
)

TESTS_DATA_DIR = (
    Path(__file__).parent.parent.parent.parent.parent
    / "tests-data"
    / "generators"
    / "clickhouse"
)


def load_columns():
    with open(TESTS_DATA_DIR / "columns.json") as f:
        data = json.load(f)
    columns = {}
    for name, fd in data["columns"].items():
        columns[name] = Column(fd["name"], fd["type"], fd.get("values"))
    return columns


def load_fixture():
    with open(TESTS_DATA_DIR / "formatting.json") as f:
        return json.load(f)["tests"]


def normalize_ws(s: str) -> str:
    s = " ".join(s.split())
    s = s.replace("( ", "(").replace(" )", ")")
    return s


@pytest.fixture(scope="module")
def columns():
    return load_columns()


@pytest.mark.parametrize("case", load_fixture(), ids=lambda c: c["name"])
def test_formatting(columns, case):
    opts = GeneratorOptions(**case["options"])
    kind = case.get("kind", "where")

    if kind == "where":
        root = parse(case["input"]).root
        unformatted = to_sql_where(root, columns)
        formatted = to_sql_where_with_options(root, columns, opts)
    else:
        unformatted = to_sql_select(case["input"], columns).sql
        formatted = to_sql_select_with_options(case["input"], columns, opts).sql

    assert (
        unformatted == case["expected_unformatted_sql"]
    ), f"regression: {unformatted!r} != {case['expected_unformatted_sql']!r}"
    assert (
        formatted == case["expected_formatted_sql"]
    ), f"formatted: {formatted!r} != {case['expected_formatted_sql']!r}"
    assert "\n" not in unformatted, "unformatted output must be single-line"
    assert (
        normalize_ws(formatted) == unformatted
    ), f"equivalence: {normalize_ws(formatted)!r} != {unformatted!r}"
