import json
import os
from pathlib import Path
from typing import Any


def pytest_sessionfinish(session: Any, exitstatus: int) -> None:
    """Write JSON report if E2E_REPORT_JSON is set."""
    report_path = os.environ.get("E2E_REPORT_JSON", "")
    if not report_path:
        return

    all_results: list[dict[str, Any]] = []

    try:
        from test_clickhouse_e2e import _results as ch_results

        all_results.extend(ch_results)
    except ImportError:
        pass

    try:
        from test_starrocks_e2e import _results as sr_results

        all_results.extend(sr_results)
    except ImportError:
        pass

    try:
        from test_postgresql_e2e import _results as pg_results

        all_results.extend(pg_results)
    except ImportError:
        pass

    try:
        from test_matcher_e2e import _results as matcher_results

        all_results.extend(matcher_results)
    except ImportError:
        pass

    if all_results:
        report = {"language": "python", "results": all_results}
        try:
            Path(report_path).write_text(json.dumps(report, indent=2))
        except OSError as e:
            print(f"warn: could not write e2e report {report_path}: {e}")
