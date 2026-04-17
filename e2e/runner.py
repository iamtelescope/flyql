#!/usr/bin/env python3
"""FlyQL E2E orchestrator – starts DBs, runs language test suites, writes JSON report."""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent

LANGUAGE_CONFIGS = {
    "go": {
        "label": "Go",
        "cmd": ["go", "test", "-v", "-count=1", "-vet=off", "./..."],
        "cwd": SCRIPT_DIR.parent / "golang" / "e2e",
        "report_env_key": "E2E_REPORT_JSON",
    },
    "javascript": {
        "label": "JavaScript",
        "cmd": ["npx", "vitest", "run", "--config", "vitest.e2e.config.js", "e2e/"],
        "cwd": SCRIPT_DIR.parent / "javascript",
        "report_env_key": "E2E_REPORT_JSON",
    },
    "python": {
        "label": "Python",
        "cmd": [".venv/bin/python3", "-m", "pytest", "-v", "e2e/"],
        "cwd": SCRIPT_DIR.parent / "python",
        "report_env_key": "E2E_REPORT_JSON",
    },
}

DB_CONFIGS = [
    {
        "key": "clickhouse",
        "label": "ClickHouse",
        "service": "clickhouse",
        "version_cmd": [
            "docker", "compose", "exec", "clickhouse",
            "clickhouse-client", "--user=flyql", "--password=flyql",
            "--query", "SELECT version()",
        ],
        "count_cmd": [
            "docker", "compose", "exec", "clickhouse",
            "clickhouse-client", "--user=flyql", "--password=flyql",
            "--query", "SELECT count() FROM flyql_e2e_test",
        ],
    },
    {
        "key": "starrocks",
        "label": "StarRocks",
        "service": "starrocks",
        "version_cmd": [
            "docker", "compose", "exec", "starrocks",
            "mysql", "-h", "127.0.0.1", "-P", "9030", "-u", "root",
            "--skip-column-names", "-e", "SELECT current_version()",
        ],
        "count_cmd": [
            "docker", "compose", "exec", "starrocks",
            "mysql", "-h", "127.0.0.1", "-P", "9030", "-u", "root",
            "-D", "flyql_test",
            "--skip-column-names", "-e", "SELECT count(*) FROM flyql_e2e_test",
        ],
        "init_cmd": [
            "docker", "compose", "exec", "-T", "starrocks",
            "bash", "-c",
            "mysql -h 127.0.0.1 -P 9030 -u root < /opt/starrocks/init.sql && mysql -h 127.0.0.1 -P 9030 -u root < /opt/starrocks/join_init.sql",
        ],
    },
    {
        "key": "postgresql",
        "label": "PostgreSQL",
        "service": "postgresql",
        "version_cmd": [
            "docker", "compose", "exec", "postgresql",
            "psql", "-U", "flyql", "-d", "flyql_test", "-t", "-c", "SELECT version()",
        ],
        "count_cmd": [
            "docker", "compose", "exec", "postgresql",
            "psql", "-U", "flyql", "-d", "flyql_test", "-t", "-c",
            "SELECT count(*) FROM flyql_e2e_test",
        ],
    },
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def load_version_env(version_file: str) -> dict:
    path = SCRIPT_DIR / version_file
    env = {}
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


def run_cmd(cmd, cwd=None, extra_env=None, timeout=180):
    """Run a command; return (returncode, stdout, stderr, duration_seconds)."""
    env = os.environ.copy()
    if extra_env:
        env.update(extra_env)
    start = time.monotonic()
    try:
        result = subprocess.run(
            cmd,
            cwd=str(cwd or SCRIPT_DIR),
            env=env,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return result.returncode, result.stdout.strip(), result.stderr.strip(), time.monotonic() - start
    except subprocess.TimeoutExpired:
        return 1, "", "timeout", time.monotonic() - start
    except Exception as e:
        return 1, "", str(e), time.monotonic() - start


def fmt_dur(seconds: float) -> str:
    return f"{seconds:.1f}s"


def _load_test_data() -> dict:
    rows_path = SCRIPT_DIR.parent / "tests-data" / "e2e" / "rows.json"
    rows = []
    if rows_path.exists():
        rows = json.loads(rows_path.read_text()).get("rows", [])

    column_types: dict = {}
    for dialect in ["clickhouse", "postgresql", "starrocks"]:
        cols_path = SCRIPT_DIR.parent / "tests-data" / "e2e" / dialect / "columns.json"
        if cols_path.exists():
            data = json.loads(cols_path.read_text())
            for name, col in data.get("columns", {}).items():
                column_types.setdefault(name, {})[dialect] = col.get("type", "")

    related_rows_path = SCRIPT_DIR.parent / "tests-data" / "e2e" / "related_rows.json"
    related_rows = []
    if related_rows_path.exists():
        related_rows = json.loads(related_rows_path.read_text()).get("rows", [])

    return {
        "rows": rows,
        "column_types": column_types,
        "related_rows": related_rows,
    }


def _normalize_result(r: dict) -> dict:
    return {
        "language": r.get("language", ""),
        "database": r.get("database", ""),
        "kind": r.get("kind", ""),
        "name": r.get("name", ""),
        "flyql": r.get("flyql", r.get("select_columns", "")),
        "sql": r.get("sql", ""),
        "expected": r.get("expected_ids", r.get("expected_rows", [])),
        "actual": r.get("returned_ids", r.get("returned_rows", [])),
        "passed": r.get("passed", False),
        "error": r.get("error", ""),
    }


def _assert_dialect_parity(raw_results: list) -> list:
    """Cross-database parity check for dialect_parity entries.

    Groups by (name, language); each group must contain one entry per database.
    Asserts that every dialect returned the expected row IDs and that the three
    SQL strings differ (informational warning only — does not fail the run).
    Emits one synthesized summary row per (name) and returns the list.
    """
    fixture_path = SCRIPT_DIR.parent / "tests-data" / "e2e" / "dialect_parity_tests.json"
    expected_by_name: dict = {}
    if fixture_path.exists():
        data = json.loads(fixture_path.read_text())
        for tc in data.get("tests", []):
            expected_by_name[tc["name"]] = sorted(tc.get("expected_row_ids", []))

    parity_entries = [r for r in raw_results if r.get("kind") == "dialect_parity"]
    if not parity_entries:
        return []

    groups: dict = {}
    for r in parity_entries:
        key = (r.get("name", ""), r.get("language", ""))
        groups.setdefault(key, []).append(r)

    summary_by_name: dict = {}
    for (name, language), entries in groups.items():
        by_db = {e.get("database", ""): e for e in entries}
        per_db_status = []
        sqls = []
        for db in ("clickhouse", "starrocks", "postgresql"):
            entry = by_db.get(db)
            if entry is None:
                per_db_status.append((db, False, f"missing {db} result"))
                continue
            actual = sorted(entry.get("actual") or entry.get("returned_ids") or [])
            expected = sorted(expected_by_name.get(name, []))
            sqls.append(entry.get("sql", ""))
            ok = bool(entry.get("passed")) and actual == expected
            per_db_status.append((db, ok, "" if ok else f"{db} actual={actual} expected={expected}"))

        all_ok = all(ok for _, ok, _ in per_db_status)
        sql_distinct = len({s for s in sqls if s}) == len([s for s in sqls if s])

        prev = summary_by_name.get(name)
        agg_passed = all_ok if prev is None else (prev["passed"] and all_ok)
        agg_errors = [] if prev is None else list(prev.get("_errors", []))
        for _, ok, msg in per_db_status:
            if not ok and msg:
                agg_errors.append(f"{language}: {msg}")
        summary_by_name[name] = {
            "kind": "dialect_parity",
            "language": "all",
            "database": "parity",
            "name": name,
            "flyql": entries[0].get("flyql", ""),
            "sql": "; ".join(s for s in sqls if s),
            "expected": expected_by_name.get(name, []),
            "actual": [],
            "passed": agg_passed,
            "error": "" if not agg_errors else " | ".join(agg_errors),
            "_errors": agg_errors,
            "_sql_distinct": sql_distinct if prev is None else (prev.get("_sql_distinct", True) and sql_distinct),
        }

    summary_rows = []
    for name, row in summary_by_name.items():
        if not row["_sql_distinct"]:
            print(f"PARITY WARNING: '{name}' produced byte-identical SQL across dialects (expected differences from identifier quoting)", file=sys.stderr)
        row.pop("_errors", None)
        row.pop("_sql_distinct", None)
        summary_rows.append(row)
    return summary_rows


def _build_collapsed_results(sql_groups: dict) -> list:
    rows = []
    for (_name, _database, _kind), group in sql_groups.items():
        all_passed = all(r.get("passed") for r in group)
        non_empty_sqls = [r.get("sql", "") for r in group if r.get("sql")]
        unique_sqls = set(non_empty_sqls)
        parity = len(unique_sqls) <= 1

        if parity and all_passed:
            base = _normalize_result(group[0])
            base["language"] = "all"
            if non_empty_sqls:
                base["sql"] = non_empty_sqls[0]
            rows.append(base)
        else:
            for r in group:
                row = _normalize_result(r)
                if not parity:
                    row["passed"] = False
                    row["error"] = row["error"] or "SQL parity mismatch across languages"
                rows.append(row)
    return rows


REPO_ROOT = SCRIPT_DIR.parent
CORE_COVERAGE_FIXTURE = REPO_ROOT / "tests-data" / "core" / "parser" / "errno_coverage.json"
COLUMNS_COVERAGE_FIXTURE = REPO_ROOT / "tests-data" / "core" / "parser" / "columns_errno_coverage.json"
GO_PARITY_CLI_DIR = REPO_ROOT / "golang" / "e2e"
GO_PARITY_CLI_BIN = GO_PARITY_CLI_DIR / "_bin" / "errno_parity_cli"
PY_PARITY_CLI = SCRIPT_DIR / "errno_parity_py_cli.py"
JS_PARITY_CLI = SCRIPT_DIR / "errno_parity_js_cli.js"


def _resolve_parity_input(entry):
    if "input" in entry:
        return entry["input"]
    c = entry["input_construction"]
    if c["type"] == "nested_parens":
        depth = c["depth"]
        return "(" * depth + "a=1" + ")" * depth
    raise RuntimeError(f"unknown input_construction type: {c['type']!r}")


def _run_parity_stub(cmd, label):
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
    except subprocess.TimeoutExpired:
        return None, f"{label}: timed out"
    if proc.returncode != 0:
        return None, f"{label}: exit {proc.returncode}: {proc.stderr.strip() or proc.stdout.strip()}"
    line = proc.stdout.strip().splitlines()[-1] if proc.stdout.strip() else ""
    try:
        return json.loads(line), None
    except json.JSONDecodeError as e:
        return None, f"{label}: json decode error: {e}: stdout={proc.stdout!r}"


def run_errno_parity(args):
    # Build the Go CLI.
    print("[errno-parity] Building Go CLI...")
    rc = subprocess.run(
        ["go", "build", "-o", str(GO_PARITY_CLI_BIN.relative_to(GO_PARITY_CLI_DIR)), "./errno_parity_cli"],
        cwd=str(GO_PARITY_CLI_DIR),
    ).returncode
    if rc != 0:
        print("[errno-parity] Go build failed", file=sys.stderr)
        return 1

    core_fixture = json.loads(CORE_COVERAGE_FIXTURE.read_text(encoding="utf-8"))
    columns_fixture = json.loads(COLUMNS_COVERAGE_FIXTURE.read_text(encoding="utf-8"))
    py_exe = sys.executable

    results = []
    mismatches = 0

    def _dispatch(entry, category):
        inp = _resolve_parity_input(entry)
        caps = entry.get("capabilities") or {}
        py_flags = [f"--category={category}", f"--input={inp}"]
        js_flags = [f"--category={category}", f"--input={inp}"]
        go_flags = [f"--category={category}", f"--input={inp}"]
        if caps.get("transformers"):
            py_flags.append("--transformers")
            js_flags.append("--transformers")
            go_flags.append("--transformers")
        if caps.get("renderers"):
            py_flags.append("--renderers")
            js_flags.append("--renderers")
            go_flags.append("--renderers")
        py_res, py_err = _run_parity_stub([py_exe, str(PY_PARITY_CLI)] + py_flags, "python")
        js_res, js_err = _run_parity_stub(["node", str(JS_PARITY_CLI)] + js_flags, "javascript")
        go_res, go_err = _run_parity_stub([str(GO_PARITY_CLI_BIN)] + go_flags, "go")

        errors = [e for e in (py_err, js_err, go_err) if e]
        per_lang = {
            "python": py_res if py_res else None,
            "javascript": js_res if js_res else None,
            "go": go_res if go_res else None,
        }

        expected = entry.get("expected_error") or {}
        expected_errno = expected.get("errno")
        expected_options = expected.get("errno_options")

        per_lang_errnos = {lang: (v["errno"] if v else None) for lang, v in per_lang.items()}
        per_lang_text = {lang: (v["error_text"] if v else None) for lang, v in per_lang.items()}

        diverging = []
        if errors:
            diverging.append("STUB_ERROR")
        else:
            if expected_errno is not None:
                for lang, errno in per_lang_errnos.items():
                    if errno != expected_errno:
                        diverging.append(lang)
            elif expected_options:
                for lang, errno in per_lang_errnos.items():
                    if errno not in expected_options:
                        diverging.append(lang)
            else:
                distinct = {e for e in per_lang_errnos.values() if e is not None}
                if len(distinct) > 1:
                    diverging = sorted(per_lang_errnos.keys())

        return {
            "name": entry["name"],
            "category": category,
            "input": inp,
            "expected_errno": expected_errno,
            "expected_errno_options": expected_options,
            "errnos_per_language": per_lang_errnos,
            "error_text_per_language": per_lang_text,
            "stub_errors": errors,
            "diverging_languages": diverging,
            "pass": not diverging,
        }

    for entry in core_fixture["tests"]:
        r = _dispatch(entry, "core")
        results.append(r)
        if not r["pass"]:
            mismatches += 1
    for entry in columns_fixture["tests"]:
        r = _dispatch(entry, "columns")
        results.append(r)
        if not r["pass"]:
            mismatches += 1

    report = {
        "suite": "errno-parity",
        "total": len(results),
        "passed": len(results) - mismatches,
        "failed": mismatches,
        "entries": results,
    }

    out_path = args.json or str(SCRIPT_DIR / "output" / "errno_parity.json")
    out_file = Path(out_path)
    out_file.parent.mkdir(parents=True, exist_ok=True)
    out_file.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"[errno-parity] Wrote {out_file}")
    print(f"[errno-parity] {report['passed']}/{report['total']} entries pass")
    return 0 if mismatches == 0 else 1


def main():
    parser = argparse.ArgumentParser(description="FlyQL E2E orchestrator")
    parser.add_argument(
        "--languages",
        default=",".join(LANGUAGE_CONFIGS.keys()),
        help=f"Comma-separated languages to test (default: {','.join(LANGUAGE_CONFIGS.keys())})",
    )
    parser.add_argument(
        "--down",
        action="store_true",
        default=False,
        help="Bring down DBs after tests complete",
    )
    parser.add_argument(
        "--databases",
        default=",".join(db["key"] for db in DB_CONFIGS),
        help=f"Comma-separated databases to start for infrastructure (default: {','.join(db['key'] for db in DB_CONFIGS)}). "
             "Tests gracefully skip unavailable databases.",
    )
    parser.add_argument(
        "--version-file",
        default="versions/default.env",
        help="Version env file relative to e2e/ (default: versions/default.env)",
    )
    parser.add_argument(
        "--json",
        default="",
        help="Also write a JSON report to this path (machine-readable, for LLM consumption)",
    )
    parser.add_argument(
        "--skip-dbs",
        action="store_true",
        default=False,
        help="Skip DB orchestration (for suites that don't need containers, e.g. --errno-parity).",
    )
    parser.add_argument(
        "--errno-parity",
        action="store_true",
        default=False,
        help="Run the cross-language errno-parity harness instead of the default e2e language suites.",
    )
    args = parser.parse_args()

    if args.errno_parity:
        return run_errno_parity(args)

    languages = [l.strip() for l in args.languages.split(",") if l.strip()]
    for lang in languages:
        if lang not in LANGUAGE_CONFIGS:
            print(f"Unknown language: {lang}. Available: {', '.join(LANGUAGE_CONFIGS)}", file=sys.stderr)
            sys.exit(1)

    requested_dbs = {d.strip() for d in args.databases.split(",") if d.strip()}
    available_db_keys = {db["key"] for db in DB_CONFIGS}
    unknown_dbs = requested_dbs - available_db_keys
    if unknown_dbs:
        print(f"Unknown database(s): {', '.join(unknown_dbs)}. Available: {', '.join(available_db_keys)}", file=sys.stderr)
        sys.exit(1)

    version_env = load_version_env(args.version_file)

    infra_steps = []
    all_results = []

    for db in DB_CONFIGS:
        if db["key"] not in requested_dbs:
            continue

        label = db["label"]
        service = db["service"]

        print(f"[infra] Starting {label}...")
        rc, stdout, stderr, dur = run_cmd(
            ["docker", "compose", "up", "-d", "--wait", service],
            extra_env=version_env,
            timeout=180,
        )

        version_detail = ""
        if rc == 0:
            rc2, vout, _, _ = run_cmd(db["version_cmd"], timeout=10)
            if rc2 == 0 and vout:
                first_line = vout.splitlines()[0].strip()
                if "PostgreSQL" in first_line:
                    first_line = first_line.split(" on ")[0].strip()
                version_detail = first_line

        infra_steps.append({
            "name": f"{label} started",
            "detail": version_detail or (stderr or stdout)[:120] or "ok",
            "duration": fmt_dur(dur),
            "success": rc == 0,
        })

        if rc == 0 and "init_cmd" in db:
            print(f"[infra] Initializing {label} database...")
            rc_init, _, stderr_init, dur_init = run_cmd(db["init_cmd"], timeout=30)
            infra_steps.append({
                "name": f"{label} initialized",
                "detail": "ok" if rc_init == 0 else f"failed: {stderr_init[:80]}",
                "duration": fmt_dur(dur_init),
                "success": rc_init == 0,
            })

        if rc == 0:
            print(f"[infra] Verifying {label} data...")
            rc3, cout, cerr, dur3 = run_cmd(db["count_cmd"], timeout=10)
            count = cout.strip().strip("|").strip() if rc3 == 0 else None
            infra_steps.append({
                "name": f"{label} data loaded",
                "detail": f"{count} rows" if count else f"failed: {cerr[:80]}",
                "duration": fmt_dur(dur3),
                "success": rc3 == 0 and bool(count),
            })
        else:
            infra_steps.append({
                "name": f"{label} data loaded",
                "detail": "skipped (DB did not start)",
                "duration": "0.0s",
                "success": False,
            })

    for lang_key in languages:
        cfg = LANGUAGE_CONFIGS[lang_key]
        label = cfg["label"]

        print(f"[{lang_key}] Running {label} tests...")

        tmp = tempfile.NamedTemporaryFile(suffix=".json", delete=False)
        tmp.close()
        report_path = tmp.name

        extra_env = {cfg["report_env_key"]: report_path}
        rc, stdout, stderr, dur = run_cmd(
            cfg["cmd"],
            cwd=cfg["cwd"],
            extra_env=extra_env,
            timeout=300,
        )

        lang_results = []
        if os.path.exists(report_path) and os.path.getsize(report_path) > 0:
            try:
                with open(report_path) as f:
                    report_data = json.load(f)
                lang_results = report_data.get("results", [])
                for r in lang_results:
                    r["language"] = lang_key
            except Exception as e:
                print(f"warn: could not parse {label} JSON report: {e}", file=sys.stderr)
        os.unlink(report_path)

        all_results.extend(lang_results)

        total_lang = len(lang_results)
        passed_lang = sum(1 for r in lang_results if r.get("passed"))
        infra_steps.append({
            "name": f"{label} suite",
            "detail": f"{passed_lang}/{total_lang} passed",
            "duration": fmt_dur(dur),
            "success": rc == 0,
        })

    if args.down:
        print("[infra] Bringing down DBs...")
        run_cmd(["docker", "compose", "down", "-v"], timeout=60)

    lang_order = list(dict.fromkeys(r.get("language", "") for r in all_results))
    language_groups = []
    for lang_key in lang_order:
        group = [r for r in all_results if r.get("language") == lang_key]
        group.sort(key=lambda r: (r.get("passed", True), r.get("database", ""), r.get("name", "")))
        cfg = LANGUAGE_CONFIGS.get(lang_key, {})
        total_g = len(group)
        passed_g = sum(1 for r in group if r.get("passed"))
        language_groups.append({
            "key": lang_key,
            "label": cfg.get("label", lang_key),
            "results": group,
            "total": total_g,
            "passed": passed_g,
            "failed": total_g - passed_g,
        })

    total = len(all_results)
    passed_count = sum(1 for r in all_results if r.get("passed"))

    # SQL parity check: same flyql + same database should produce identical SQL across languages
    sql_groups: dict = {}
    for r in all_results:
        key = (r.get("name", ""), r.get("database", ""), r.get("kind", ""))
        sql_groups.setdefault(key, []).append(r)

    sql_mismatches = []
    sql_not_implemented = []
    for (name, database, kind), group in sql_groups.items():
        sqls = {r.get("language", ""): r.get("sql", "") for r in group}
        empty_langs = [lang for lang, sql in sqls.items() if not sql]
        non_empty = {lang: sql for lang, sql in sqls.items() if sql}

        if empty_langs and non_empty:
            sql_not_implemented.append({
                "name": name,
                "database": database,
                "kind": kind,
                "flyql": group[0].get("flyql", group[0].get("select_columns", "")),
                "missing_languages": empty_langs,
                "implemented_languages": list(non_empty.keys()),
            })

        if len(non_empty) >= 2:
            unique_sqls = set(non_empty.values())
            if len(unique_sqls) > 1:
                sql_mismatches.append({
                    "name": name,
                    "database": database,
                    "kind": kind,
                    "flyql": group[0].get("flyql", group[0].get("select_columns", "")),
                    "by_language": non_empty,
                })

    if args.json:
        by_db: dict = {}
        for r in all_results:
            db = r.get("database", "")
            if db not in by_db:
                by_db[db] = {"total": 0, "passed": 0, "failed": 0}
            by_db[db]["total"] += 1
            if r.get("passed"):
                by_db[db]["passed"] += 1
            else:
                by_db[db]["failed"] += 1

        json_report = {
            "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "versions": version_env,
            "summary": {
                "total": total,
                "passed": passed_count,
                "failed": total - passed_count,
                "by_language": {
                    g["key"]: {"total": g["total"], "passed": g["passed"], "failed": g["failed"]}
                    for g in language_groups
                },
                "by_database": by_db,
                "parity": {
                    "total_groups": len(sql_groups),
                    "matching": len(sql_groups) - len(sql_mismatches),
                    "mismatched": len(sql_mismatches),
                    "not_implemented": len(sql_not_implemented),
                },
            },
            "infrastructure": infra_steps,
            "test_data": _load_test_data(),
            "sql_parity": {
                "total_groups": len(sql_groups),
                "mismatches": len(sql_mismatches),
                "details": sql_mismatches,
                "not_implemented": sql_not_implemented,
            },
            "results": _build_collapsed_results(sql_groups) + _assert_dialect_parity(all_results),
        }
        json_path = Path(args.json)
        json_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_text(json.dumps(json_report, indent=2))
        print(f"JSON report: {json_path}")

    if sql_not_implemented:
        print(f"\nSQL PARITY WARNING: {len(sql_not_implemented)} test(s) not implemented in all languages", file=sys.stderr)
        for m in sql_not_implemented:
            print(f"  {m['name']} / {m['database']}: missing in {', '.join(m['missing_languages'])}", file=sys.stderr)

    if sql_mismatches:
        print(f"\nSQL PARITY: {len(sql_mismatches)} mismatch(es) across languages", file=sys.stderr)
        for m in sql_mismatches:
            print(f"  {m['name']} / {m['database']}:", file=sys.stderr)
            for lang, sql in m["by_language"].items():
                print(f"    {lang}: {sql}", file=sys.stderr)

    failed_count = total - passed_count
    if failed_count > 0:
        print(f"\nFAILED: {failed_count}/{total} tests failed", file=sys.stderr)
        sys.exit(1)
    elif sql_mismatches:
        print(f"\nFAILED: SQL parity check found {len(sql_mismatches)} mismatch(es)", file=sys.stderr)
        sys.exit(1)
    else:
        print(f"\nOK: {total}/{total} tests passed")


if __name__ == "__main__":
    rc = main()
    if isinstance(rc, int):
        sys.exit(rc)
