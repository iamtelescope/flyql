import json
import os
from pathlib import Path
from typing import Any


def pytest_sessionfinish(session: Any, exitstatus: int) -> None:
    """Write JSON report if E2E_REPORT_JSON is set."""
    report_path = os.environ.get("E2E_REPORT_JSON", "")
    if not report_path:
        return

    from test_clickhouse_e2e import _results

    if _results:
        report = {"language": "python", "results": _results}
        try:
            Path(report_path).write_text(json.dumps(report, indent=2))
        except OSError as e:
            print(f"warn: could not write e2e report {report_path}: {e}")
