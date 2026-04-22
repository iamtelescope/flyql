"""Per-language Python matcher tests for Date/DateTime types.

Covers the scenarios that cannot be expressed as language-agnostic JSON
fixtures (e.g. native ``datetime``/``date`` objects, pandas/numpy types,
DST edge cases asserted on exact ms values).
"""

import logging
import warnings
from datetime import date, datetime, timedelta, timezone

import pytest

from flyql.core.column import Column, ColumnSchema
from flyql.core.parser import parse
from flyql.flyql_type import Type
from flyql.matcher.evaluator import Evaluator
from flyql.matcher.record import Record


def _eval(query: str, data: dict, schema: ColumnSchema | None = None) -> bool:
    root = parse(query).root
    evaluator = Evaluator(columns=schema)
    return evaluator.evaluate(root, Record(data=data))


def _schema(columns: dict) -> ColumnSchema:
    return ColumnSchema.from_plain_object(columns)


def test_native_datetime_with_datetime_schema() -> None:
    rec = {"ts": datetime(2026, 4, 6, 21, 0, tzinfo=timezone.utc)}
    schema = _schema({"ts": {"type": "datetime"}})
    assert _eval("ts > '2026-04-06T20:00:00Z'", rec, schema) is True


def test_native_datetime_naive_uses_column_tz() -> None:
    # Naive datetime + column.tz='Europe/Moscow' (UTC+3).
    rec = {"ts": datetime(2026, 4, 6, 21, 0)}
    schema = _schema({"ts": {"type": "datetime", "tz": "Europe/Moscow"}})
    # 21:00 Moscow = 18:00 UTC; strictly greater than 17:00 UTC.
    assert _eval("ts > '2026-04-06T17:00:00Z'", rec, schema) is True


def test_native_date_schemaless_auto_infer() -> None:
    rec = {"event_day": date(2026, 4, 6)}
    # No schema → Python-only auto-infer treats native date as Date.
    assert _eval("event_day = '2026-04-06'", rec) is True


def test_datetime_subclass_before_date_check() -> None:
    """Risk 2: datetime is a subclass of date. The DateTime coercion helper
    must check datetime before date to avoid silent truncation surprises."""
    rec = {"ts": datetime(2026, 4, 6, 21, 0, tzinfo=timezone.utc)}
    schema = _schema({"ts": {"type": "datetime"}})
    # Hour component participates — comparison should reflect 21:00 UTC.
    assert _eval("ts < '2026-04-06T22:00:00Z'", rec, schema) is True
    assert _eval("ts > '2026-04-06T22:00:00Z'", rec, schema) is False


def test_date_column_truncates_datetime() -> None:
    rec = {"event_day": datetime(2026, 4, 6, 15, 30)}
    schema = _schema({"event_day": {"type": "date"}})
    # Suppress the migration warning — it is not the focus of this assertion.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        assert _eval("event_day = '2026-04-06'", rec, schema) is True


def test_z_suffix_shim_works() -> None:
    """Python 3.10 ``fromisoformat`` does not accept Z; the matcher shims
    `Z` → `+00:00` before parsing. This must work on all supported versions."""
    rec = {"ts": "2026-04-06T21:00:00Z"}
    schema = _schema({"ts": {"type": "datetime"}})
    assert _eval("ts = '2026-04-06T21:00:00Z'", rec, schema) is True


def test_pandas_timestamp_support() -> None:
    """pandas.Timestamp subclasses ``datetime`` so the isinstance check picks it up."""
    pd = pytest.importorskip("pandas")
    rec = {"ts": pd.Timestamp("2026-04-06T21:00:00Z")}
    schema = _schema({"ts": {"type": "datetime"}})
    assert _eval("ts > '2026-04-06T20:00:00Z'", rec, schema) is True


def test_numpy_datetime64_unsupported() -> None:
    """numpy.datetime64 is not a ``datetime`` subclass — documented as
    unsupported (Task 32). Records with this type return False (skipped)."""
    np = pytest.importorskip("numpy")
    rec = {"ts": np.datetime64("2026-04-06T21:00:00")}
    schema = _schema({"ts": {"type": "datetime"}})
    assert _eval("ts > '2026-01-01T00:00:00Z'", rec, schema) is False


def test_dst_fall_back_earlier_exact_ms() -> None:
    """Decision 19 + AC 26: naive fall-back time resolves to fold=0 (earlier).

    Asserts the exact ms value, not just a relative ordering. This is the
    parity-pin across Python/Go/JS — identical ms for identical input.
    """
    rec = {"ts": "2026-11-01 01:30:00"}
    schema = _schema({"ts": {"type": "datetime", "tz": "America/New_York"}})
    # Exact-ms parity check: 05:30 UTC = 2026-11-01T05:30:00Z = 1793511000000ms.
    evaluator = Evaluator(columns=schema)
    coerced = evaluator._resolve_record_value_as_ms(rec["ts"], schema.get("ts"))
    assert coerced == 1793511000000, f"got {coerced}, want 1793511000000 (fold=0 EDT)"
    # Sanity-check via comparison too (05:30 UTC < 06:00 UTC).
    assert _eval("ts < '2026-11-01T06:00:00Z'", rec, schema) is True
    assert _eval("ts > '2026-11-01T06:00:00Z'", rec, schema) is False


def test_dst_spring_forward_nonexistent_skipped() -> None:
    """Decision 19 + AC 27: nonexistent spring-forward wall-clock → False."""
    rec = {"ts": "2026-03-08 02:30:00"}
    schema = _schema({"ts": {"type": "datetime", "tz": "America/New_York"}})
    assert _eval("ts > '2026-01-01T00:00:00Z'", rec, schema) is False


def test_microsecond_truncation_collapse() -> None:
    """Decision 23: sub-ms precision is not preserved."""
    rec = {"ts": datetime(2026, 4, 6, 21, 0, 0, 999, tzinfo=timezone.utc)}
    schema = _schema({"ts": {"type": "datetime"}})
    assert _eval("ts = '2026-04-06T21:00:00Z'", rec, schema) is True


def test_migration_warning_fires_once(caplog: pytest.LogCaptureFixture) -> None:
    """AC 28: Type.Date column receiving datetime-shaped values warns once
    per column.match_name via both ``warnings`` and ``logging``."""
    schema = _schema({"event_day": {"type": "date"}})
    evaluator = Evaluator(columns=schema)
    rec1 = Record(data={"event_day": datetime(2026, 4, 6, 15, 0)})
    rec2 = Record(data={"event_day": datetime(2026, 4, 7, 15, 0)})
    root = parse("event_day > '2026-01-01'").root

    with warnings.catch_warnings(record=True) as caught, caplog.at_level(
        logging.WARNING, logger="flyql"
    ):
        warnings.simplefilter("always")
        for _ in range(100):
            evaluator.evaluate(root, rec1)
            evaluator.evaluate(root, rec2)
        migration_warnings = [w for w in caught if "Type.DateTime" in str(w.message)]
        assert len(migration_warnings) == 1
        migration_log = [r for r in caplog.records if "Type.DateTime" in r.getMessage()]
        assert len(migration_log) == 1


def test_invalid_timezone_warns_once_and_uses_utc(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Decision 25 / F60: a non-empty invalid tz name warns once and
    degrades to UTC, both resolutions cache-memoized."""
    with warnings.catch_warnings(record=True) as caught, caplog.at_level(
        logging.WARNING, logger="flyql"
    ):
        warnings.simplefilter("always")
        evaluator = Evaluator(default_timezone="Not/A/Zone")
        zi1 = evaluator._resolve_tz()
        zi2 = evaluator._resolve_tz()
        assert zi1 is zi2  # same cached UTC object
        bad_warns = [w for w in caught if "invalid timezone" in str(w.message)]
        assert len(bad_warns) == 1


def test_tz_cache_populates_only_distinct_names() -> None:
    """AC 25 parity: cache grows with unique tzs, not per-record.

    Naive ISO strings force tz resolution via column.tz; 1000 records
    with a single column tz should produce exactly one cache entry.
    """
    schema = _schema({"ts": {"type": "datetime", "tz": "Europe/Moscow"}})
    evaluator = Evaluator(columns=schema)
    root = parse("ts > '2026-01-01T00:00:00'").root
    for i in range(1000):
        data = {"ts": f"2026-04-06 {i%24:02d}:00:00"}
        evaluator.evaluate(root, Record(data=data))
    assert len(evaluator._tz_cache) == 1
