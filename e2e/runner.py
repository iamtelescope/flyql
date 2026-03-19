#!/usr/bin/env python3
"""FlyQL E2E orchestrator – starts DBs, runs language test suites, writes combined HTML report."""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path

import jinja2

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


def main():
    parser = argparse.ArgumentParser(description="FlyQL E2E orchestrator")
    parser.add_argument(
        "--languages",
        default=",".join(LANGUAGE_CONFIGS.keys()),
        help=f"Comma-separated languages to test (default: {','.join(LANGUAGE_CONFIGS.keys())})",
    )
    parser.add_argument(
        "--output",
        default=str(SCRIPT_DIR / "report.html"),
        help="Output HTML report path (default: e2e/report.html)",
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
            timeout=120,
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

    jinja_env = jinja2.Environment(
        loader=jinja2.FileSystemLoader(str(SCRIPT_DIR / "templates")),
        autoescape=jinja2.select_autoescape(["html"]),
    )
    template = jinja_env.get_template("report.html.j2")

    html = template.render(
        generated_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        infra_steps=infra_steps,
        language_groups=language_groups,
        total=total,
        passed=passed_count,
        failed=total - passed_count,
    )

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html)
    print(f"Report: {output}")

    if args.json:
        json_report = {
            "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "summary": {"total": total, "passed": passed_count, "failed": total - passed_count},
            "failures": [
                {
                    "language": r.get("language", ""),
                    "database": r.get("database", ""),
                    "kind": r.get("kind", ""),
                    "name": r.get("name", ""),
                    "flyql": r.get("flyql", r.get("select_columns", "")),
                    "sql": r.get("sql", ""),
                    "expected": r.get("expected_ids", r.get("expected_rows", [])),
                    "actual": r.get("returned_ids", r.get("returned_rows", [])),
                    "error": r.get("error", ""),
                }
                for r in all_results
                if not r.get("passed")
            ],
        }
        json_path = Path(args.json)
        json_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_text(json.dumps(json_report, indent=2))
        print(f"JSON report: {json_path}")

    failed_count = total - passed_count
    if failed_count > 0:
        print(f"\nFAILED: {failed_count}/{total} tests failed", file=sys.stderr)
        sys.exit(1)
    else:
        print(f"\nOK: {total}/{total} tests passed")


if __name__ == "__main__":
    main()
