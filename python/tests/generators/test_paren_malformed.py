"""Defensive test: malformed nodes (empty bool_operator with both children
populated) must raise FlyqlError, not silently emit broken SQL.

Pre-change walkers unconditionally wrapped composite subtrees, so the
``validate_bool_operator("")`` path always fired on this shape and raised.
The refactored walker preserves this invariant — the new combine branch
still calls ``validate_bool_operator`` before assembling the SQL.
"""

import json
from pathlib import Path

import pytest

from flyql.core.exceptions import FlyqlError
from flyql.core.expression import Expression
from flyql.core.key import Key
from flyql.core.tree import Node
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


def _make_leaf(name: str) -> Node:
    expr = Expression(
        key=Key(segments=[name]),
        operator="=",
        value=1,
        value_is_string=False,
    )
    return Node(bool_operator="", expression=expr, left=None, right=None)


def _malformed_root() -> Node:
    """Node with both children populated and bool_operator empty — invalid."""
    return Node(
        bool_operator="",
        expression=None,
        left=_make_leaf("count"),
        right=_make_leaf("count"),
    )


@pytest.mark.parametrize(
    "dialect,generator,ColumnCls",
    [
        ("clickhouse", ch_where, CHColumn),
        ("postgresql", pg_where, PGColumn),
        ("starrocks", sr_where, SRColumn),
    ],
    ids=["clickhouse", "postgresql", "starrocks"],
)
def test_malformed_node_raises(dialect, generator, ColumnCls):
    columns = _load_columns(dialect, ColumnCls)
    root = _malformed_root()
    with pytest.raises((FlyqlError, Exception)) as exc_info:
        generator(root, columns)
    assert "bool operator" in str(exc_info.value).lower()
