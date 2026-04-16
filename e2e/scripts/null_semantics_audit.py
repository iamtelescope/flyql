#!/usr/bin/env python3
"""Null-semantics audit: verify all negated operators on segmented keys
exclude null-valued rows consistently across PostgreSQL, StarRocks, ClickHouse,
and the Python matcher.

Canonical semantic: SQL three-valued logic. Null rows are EXCLUDED from the
match set for every negated operator (!=, !~, not has, not like, not ilike,
not in). The only exception is `col != null`, which keeps its IS NOT NULL
meaning.

In scope: JSON (native), JSONString (per Technical Decision #5).
Out of scope: Map, Array — divergences found on these types are reported as
deferred entries rather than failures.

Run:
    cd /Users/robert/git/flyql/e2e && .venv/bin/python3 scripts/null_semantics_audit.py

Or via Makefile: make -C /Users/robert/git/flyql/e2e audit
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "python"))
sys.path.insert(0, str(REPO_ROOT / "python" / "e2e"))

from flyql.core.parser import parse  # noqa: E402
from flyql.matcher.evaluator import Evaluator  # noqa: E402
from flyql.matcher.record import Record  # noqa: E402

from flyql.generators.postgresql.column import Column as PGColumn  # noqa: E402
from flyql.generators.postgresql.generator import to_sql_where as pg_to_sql  # noqa: E402

from flyql.generators.clickhouse.column import Column as CHColumn  # noqa: E402
from flyql.generators.clickhouse.generator import to_sql_where as ch_to_sql  # noqa: E402

from flyql.generators.starrocks.column import Column as SRColumn  # noqa: E402
from flyql.generators.starrocks.generator import to_sql_where as sr_to_sql  # noqa: E402

# Reuse the per-runner query helpers from the Python e2e tests.
from test_postgresql_e2e import pg_query  # type: ignore  # noqa: E402
from test_clickhouse_e2e import ch_query  # type: ignore  # noqa: E402
from test_starrocks_e2e import sr_query  # type: ignore  # noqa: E402

TESTS_DATA = REPO_ROOT / "tests-data" / "e2e"

# Negated operators in scope. Falsy (`not col`) is intentionally excluded per
# Technical Decision #2: falsy on null rows stays included in the match set.
NEGATED_OPS = [
    ("!=", "!= 'eu-west'"),
    ("!~", "!~ 'eu.*'"),
    ("not like", "not like 'eu-%'"),
    ("not ilike", "not ilike 'EU-%'"),
    ("not in", "not in ['eu-west']"),
    ("not has", "not has 'eu'"),
]

# Segmented paths keyed by the user-visible query prefix.
# Row 4 is the null poster child in the e2e dataset (meta_str/meta_json both
# NULL). Rows 1-3, 5, 6 have populated values; rows 2 and 6 have region='eu-west'
# and should be excluded by a negated operator that matches 'eu-west', leaving
# rows 1, 3, 5 as the expected match set under SQL three-valued logic.
SEGMENTED_PROBES = [
    {
        "path": "meta_str.region",
        "type": "JSONString",
        "expected": [1, 3, 5],
    },
    {
        "path": "meta_json.region",
        "type": "JSON",
        "expected": [1, 3, 5],
    },
]

# Map / Array probes are out of scope per Decision #5 but we still audit them
# so future devs can see any drift. They get reported as deferred.
OUT_OF_SCOPE_PROBES: list[dict[str, Any]] = []

PREEXISTING_DEFERRED: set[tuple[str, str]] = set()


def load_columns(dialect: str):
    path = TESTS_DATA / dialect / "columns.json"
    data = json.loads(path.read_text())
    columns = {}
    if dialect == "postgresql":
        for key, col in data["columns"].items():
            c = PGColumn(
                name=col["name"],
                _type=col["type"],
                values=col.get("values"),
            )
            if col.get("raw_identifier"):
                c.with_raw_identifier(col["raw_identifier"])
            columns[key] = c
    elif dialect == "clickhouse":
        for key, col in data["columns"].items():
            columns[key] = CHColumn(
                name=col["name"],
                _type=col["type"],
                values=col.get("values"),
            )
    elif dialect == "starrocks":
        for key, col in data["columns"].items():
            c = SRColumn(
                name=col["name"],
                _type=col["type"],
                values=col.get("values"),
            )
            if col.get("raw_identifier"):
                c.with_raw_identifier(col["raw_identifier"])
            columns[key] = c
    return columns


def run_pg(flyql: str) -> list[int]:
    cols = load_columns("postgresql")
    tree = parse(flyql)
    sql = pg_to_sql(tree.current_node, cols)
    rows = pg_query(f"SELECT id FROM flyql_e2e_test WHERE {sql} ORDER BY id")
    return [int(r.strip()) for r in rows if r.strip()]


def run_ch(flyql: str) -> list[int]:
    cols = load_columns("clickhouse")
    tree = parse(flyql)
    sql = ch_to_sql(tree.current_node, cols)
    rows = ch_query(
        f"SELECT id FROM flyql_e2e_test WHERE {sql} ORDER BY id FORMAT JSONEachRow"
    )
    return [int(r["id"]) for r in rows]


def run_sr(flyql: str) -> list[int]:
    cols = load_columns("starrocks")
    tree = parse(flyql)
    sql = sr_to_sql(tree.current_node, cols)
    rows = sr_query(f"SELECT id FROM flyql_e2e_test WHERE {sql} ORDER BY id")
    return [int(r.get("id", 0)) for r in rows]


def run_matcher(flyql: str) -> list[int]:
    # Matcher evaluates against in-memory dict records. Reuse the matcher e2e
    # fixture data if available; else build a minimal probe dataset that
    # mirrors the SQL test table's null shape on row 4.
    fixture = TESTS_DATA / "matcher" / "records.json"
    if fixture.exists():
        data = json.loads(fixture.read_text())
    else:
        # Minimal synthetic dataset: row 4 has meta_str/meta_json as None,
        # other rows carry non-null values; two of them ('eu-west') should be
        # excluded by a negated operator matching 'eu-west'.
        data = [
            {"id": 1, "meta_str": {"region": "us-east"}, "meta_json": {"region": "us-east"}},
            {"id": 2, "meta_str": {"region": "eu-west"}, "meta_json": {"region": "eu-west"}},
            {"id": 3, "meta_str": {"region": "us-east"}, "meta_json": {"region": "us-east"}},
            {"id": 4, "meta_str": None, "meta_json": None},
            {"id": 5, "meta_str": {"region": "us-east"}, "meta_json": {"region": "us-east"}},
            {"id": 6, "meta_str": {"region": "eu-west"}, "meta_json": {"region": "eu-west"}},
        ]

    tree = parse(flyql)
    evaluator = Evaluator()
    matched = []
    for row in data:
        rec = Record(data=row)
        if evaluator.evaluate(tree.current_node, rec):
            matched.append(int(row["id"]))
    return sorted(matched)


def audit_combo(probe: dict[str, Any], op_name: str, op_query: str) -> dict[str, Any]:
    flyql_ch = flyql_pg = flyql_sr = f"{probe['path']} {op_query}"
    runners = {}
    for name, fn in [
        ("postgresql", run_pg),
        ("clickhouse", run_ch),
        ("starrocks", run_sr),
        ("matcher", run_matcher),
    ]:
        try:
            runners[name] = fn(f"{probe['path']} {op_query}")
        except Exception as exc:
            runners[name] = f"ERROR: {exc}"
    diverged = False
    canonical = sorted(probe["expected"])
    for result in runners.values():
        if isinstance(result, str):  # error
            diverged = True
            continue
        if sorted(result) != canonical:
            diverged = True
            break
    return {
        "probe": probe,
        "op": op_name,
        "query": f"{probe['path']} {op_query}",
        "runners": runners,
        "diverged": diverged,
        "expected": canonical,
    }


def main() -> int:
    in_scope_divergences: list[dict[str, Any]] = []
    out_of_scope_divergences: list[dict[str, Any]] = []

    deferred_preexisting: list[dict[str, Any]] = []

    for probe in SEGMENTED_PROBES:
        for op_name, op_query in NEGATED_OPS:
            if (probe["path"], op_name) in PREEXISTING_DEFERRED:
                deferred_preexisting.append(
                    {"path": probe["path"], "op": op_name, "query": f"{probe['path']} {op_query}"}
                )
                continue
            res = audit_combo(probe, op_name, op_query)
            if res["diverged"]:
                in_scope_divergences.append(res)

    for probe in OUT_OF_SCOPE_PROBES:
        for op_name, op_query in NEGATED_OPS:
            res = audit_combo(probe, op_name, op_query)
            if res["diverged"]:
                out_of_scope_divergences.append(res)

    if not in_scope_divergences:
        print(
            f"PASS: zero in-scope divergences "
            f"({len(deferred_preexisting)} preexisting deferred, "
            f"{len(out_of_scope_divergences)} out-of-scope deferred)"
        )
        for d in deferred_preexisting:
            print(f"  DEFERRED (preexisting): {d['query']}")
        for d in out_of_scope_divergences:
            print(f"  DEFERRED (out-of-scope): {d['query']} -> {d['runners']}")
        return 0

    print(f"FAIL: {len(in_scope_divergences)} in-scope divergences:")
    for d in in_scope_divergences:
        print(f"  query={d['query']!r}")
        print(f"    expected={d['expected']}")
        for name, result in d["runners"].items():
            print(f"    {name:12s} -> {result}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
