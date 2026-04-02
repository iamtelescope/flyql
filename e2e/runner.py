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
            "mysql -h 127.0.0.1 -P 9030 -u root < /opt/starrocks/init.sql",
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

    return {"rows": rows, "column_types": column_types}


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
    args = parser.parse_args()

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
            "results": _build_collapsed_results(sql_groups),
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
    main()
