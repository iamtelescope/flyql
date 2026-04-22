"""Matcher evaluator with lazy optional re2 dependency.

Regex (``~`` / ``!~``) and LIKE-family operators require the ``google-re2``
package, which is shipped as the optional ``[re2]`` extra:

    pip install flyql[re2]

Without the extra, non-regex evaluations (equality, comparison, ``in``,
``has``, ...) work unchanged; invoking a regex or LIKE operator raises
``FlyqlError(ERR_RE2_MISSING)``. RE2-safety (no catastrophic backtracking,
no backreferences/lookahead) is documented in ``SECURITY.md``; there is
no silent fallback to ``re`` by design.

Pattern for future optional deps: import with a try/except at module top,
bind both the module and a boolean flag, then guard once at each
public entry point that uses the dependency (not per call).

@threadsafe: no — construct one Evaluator per request/worker. All caches
(``self.cache``, ``self._tz_cache``, ``self._expr_column_cache``,
``self._migration_warned``) are mutable maps/sets with no locking.

Warning/log channel (Python): invalid timezones and Date→DateTime
migration warnings are emitted on BOTH ``warnings.warn(UserWarning)`` and
``logging.getLogger("flyql").warning``. The Go implementation uses
``log.Printf`` (stdlib log), the JS implementation uses ``console.warn``.
Consumers that need cross-language scraping should check all three.
"""

import logging
import re
import warnings
import weakref
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

# Detects a string carrying a time-of-day component after a T or space
# separator (HH:MM at minimum). Used by the Type.Date migration warning
# to avoid false positives on trailing whitespace / bare `T` / names
# that happen to contain a space.
_DATETIME_SHAPED_STR_RE = re.compile(r"\d[T ]\d{2}:\d{2}")

try:
    import re2  # type: ignore[import-untyped]

    _HAVE_RE2 = True
except ImportError:
    re2 = None
    _HAVE_RE2 = False

from flyql.core.constants import BoolOperator, Operator
from flyql.core.column import Column, ColumnSchema
from flyql.core.exceptions import FlyqlError
from flyql.core.expression import Duration, Expression, FunctionCall, Parameter
from flyql.core.tree import Node
from flyql.errors_generated import ERR_RE2_MISSING, MATCHER_MESSAGES
from flyql.flyql_type import Type
from flyql.literal import LiteralKind

from flyql.matcher.key import Key
from flyql.matcher.record import Record
from flyql.transformers.registry import TransformerRegistry, default_registry

_DURATION_UNIT_MS: Dict[str, int] = {
    "s": 1_000,
    "m": 60_000,
    "h": 3_600_000,
    "d": 86_400_000,
    "w": 604_800_000,
}

# Numeric value → ms multiplier keyed by Column.unit. Empty/missing defaults to "ms".
# "ns" divides (sub-ms precision is truncated — see Decision 23 in the
# date/datetime spec).
_NUMERIC_UNIT_TO_MS_MUL: Dict[str, float] = {
    "": 1.0,
    "ms": 1.0,
    "s": 1000.0,
    "ns": 1.0 / 1_000_000.0,
}

# Literal kinds eligible for schema-driven temporal coercion (Decision 20).
# COLUMN/NULL/BOOLEAN/PARAMETER deliberately excluded.
_TEMPORAL_ELIGIBLE_KINDS = {
    LiteralKind.STRING,
    LiteralKind.FUNCTION,
    LiteralKind.INTEGER,
    LiteralKind.FLOAT,
    LiteralKind.BIGINT,
}


def _sum_durations(durations: List[Duration]) -> int:
    """Sum a list of Duration objects into total milliseconds."""
    total = 0
    for d in durations:
        multiplier = _DURATION_UNIT_MS.get(d.unit)
        if multiplier is None:
            raise FlyqlError(f"unknown duration unit: {d.unit}")
        total += d.value * multiplier
    return total


def _pack_date(year: int, month: int, day: int) -> int:
    """Pack Y/M/D into a single int (``Y*10000 + M*100 + D``) whose integer
    ordering mirrors calendar ordering (Decision 27)."""
    return year * 10000 + month * 100 + day


def _resolve_record_value_as_ms(value: Any) -> Optional[int]:
    """Schema-free legacy helper retained for external callers.

    See :meth:`Evaluator._resolve_record_value_as_ms` for the full
    schema-aware implementation used internally.
    """
    if isinstance(value, bool):
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return int(value.timestamp() * 1000)
    if isinstance(value, date):
        dt = datetime(value.year, value.month, value.day, tzinfo=timezone.utc)
        return int(dt.timestamp() * 1000)
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        try:
            s_fix = value.replace("Z", "+00:00") if value.endswith("Z") else value
            dt = datetime.fromisoformat(s_fix)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return int(dt.timestamp() * 1000)
        except (ValueError, OSError):
            return None
    return None


REGEX_OPERATORS = {Operator.REGEX.value, Operator.NOT_REGEX.value}

_REGEX_META = frozenset(r".[{()*+?^$|\\")


def _like_to_regex(pattern: str) -> str:
    """Convert a SQL LIKE pattern to an anchored Python regex string."""
    if not _HAVE_RE2:
        raise FlyqlError(MATCHER_MESSAGES[ERR_RE2_MISSING])
    parts: list[str] = []
    i = 0
    n = len(pattern)
    while i < n:
        ch = pattern[i]
        if ch == "\\" and i + 1 < n:
            next_ch = pattern[i + 1]
            if next_ch == "%":
                parts.append(re2.escape("%"))
            elif next_ch == "_":
                parts.append(re2.escape("_"))
            else:
                parts.append(re2.escape(next_ch))
            i += 2
            continue
        if ch == "%":
            parts.append(".*")
        elif ch == "_":
            parts.append(".")
        else:
            parts.append(re2.escape(ch))
        i += 1
    return "^" + "".join(parts) + "$"


def is_falsy(value: Any) -> bool:
    """Check if a value is falsy (Python-style)."""
    if value is None:
        return True
    if isinstance(value, bool):
        return not value
    if isinstance(value, (int, float)):
        return value == 0
    if isinstance(value, str):
        return value == ""
    if isinstance(value, (list, tuple)):
        return len(value) == 0
    if isinstance(value, dict):
        return len(value) == 0
    return False


def is_truthy(value: Any) -> bool:
    """Check if a value is truthy (not falsy)."""
    return not is_falsy(value)


class Evaluator:
    def __init__(
        self,
        registry: Optional[TransformerRegistry] = None,
        default_timezone: str = "UTC",
        columns: Optional[ColumnSchema] = None,
    ) -> None:
        """Construct an Evaluator.

        :param columns: Optional :class:`ColumnSchema`. When present, the
            matcher performs schema-driven temporal coercion for columns
            declared :attr:`Type.Date` or :attr:`Type.DateTime`. When
            absent, the matcher falls back to schema-free behaviour
            (numerics assumed ms, ISO strings auto-parsed, native
            temporal types handled by runtime introspection).

        @threadsafe: no — construct one Evaluator per request/worker.
        ``self.cache`` (regex), ``self._tz_cache`` (ZoneInfo),
        ``self._expr_column_cache``, ``self._migration_warned``, and
        ``self._invalid_tz_warned`` are all unprotected mutable state.
        """
        self.cache: Dict[str, Any] = {}
        self._registry = registry or default_registry()
        self._default_timezone = default_timezone
        self._columns = columns
        self._tz_cache: Dict[str, ZoneInfo] = {}
        # Per Decision 26: cache column resolution by Expression identity.
        # WeakValueDictionary-over-id won't work (id reuses after GC) and
        # Expression isn't hashable, so we key by id(expr) but register a
        # weakref finalizer that evicts the cache entry when the Expression
        # is collected — guarantees no stale-address hits (P1 fix).
        self._expr_column_cache: Dict[int, Optional[Column]] = {}
        self._expr_column_finalizers: Dict[int, Any] = {}
        # Dedup migration warnings by match_name (fully-qualified) per F45/F59.
        self._migration_warned: set[str] = set()
        self._invalid_tz_warned: set[str] = set()

    def _resolve_tz(self, col_tz: str = "", fc_tz: str = "") -> ZoneInfo:
        """Resolve a tz name via the fallback order from Decision 25.

        Order: ``col_tz → fc_tz → self._default_timezone → "UTC"``. Empty
        strings fall through. Invalid-but-truthy names warn once and
        degrade to UTC (F60); the result is cached under both the bad
        name and ``"UTC"`` so subsequent records do not re-warn.
        """
        tz_name = col_tz or fc_tz or self._default_timezone or "UTC"
        cached = self._tz_cache.get(tz_name)
        if cached is not None:
            return cached
        try:
            zi = ZoneInfo(tz_name)
        except (ZoneInfoNotFoundError, ValueError):
            if tz_name not in self._invalid_tz_warned:
                self._invalid_tz_warned.add(tz_name)
                msg = (
                    f"flyql: invalid timezone {tz_name!r} — falling back to UTC. "
                    "Fix the column.tz / default_timezone / toDateTime() tz argument."
                )
                warnings.warn(msg, UserWarning, stacklevel=3)
                logging.getLogger("flyql").warning(msg)
            if "UTC" not in self._tz_cache:
                self._tz_cache["UTC"] = ZoneInfo("UTC")
            self._tz_cache[tz_name] = self._tz_cache["UTC"]
            return self._tz_cache["UTC"]
        self._tz_cache[tz_name] = zi
        return zi

    def _resolve_column_for_expression(
        self, expression: Expression
    ) -> Optional[Column]:
        """Resolve and cache the column schema entry for an Expression.

        Keyed by ``id(expression)`` with a weakref finalizer that evicts
        the entry when the Expression is collected, so a later Expression
        allocated at the same address cannot return a stale hit.
        """
        key = id(expression)
        if key in self._expr_column_cache:
            return self._expr_column_cache[key]
        col: Optional[Column] = None
        if self._columns is not None and expression.key.segments:
            col = self._columns.resolve(list(expression.key.segments))
        self._expr_column_cache[key] = col
        try:
            self._expr_column_finalizers[key] = weakref.finalize(
                expression, self._evict_expr_column_cache, key
            )
        except TypeError:
            # Expression doesn't support weak refs — skip caching-with-finalizer;
            # the entry will survive for the Evaluator's lifetime but that's
            # OK because the Expression is retained by a strong ref elsewhere
            # (same-id risk only applies when the original is GC'd).
            pass
        return col

    def _evict_expr_column_cache(self, key: int) -> None:
        self._expr_column_cache.pop(key, None)
        self._expr_column_finalizers.pop(key, None)

    def _evaluate_function_call(self, fc: FunctionCall) -> int:
        """Resolve a FunctionCall to milliseconds since epoch."""
        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)

        if fc.name == "now":
            return now_ms

        if fc.name == "ago":
            return now_ms - _sum_durations(fc.duration_args)

        tz = self._resolve_tz("", fc.timezone)

        if fc.name == "today":
            midnight = datetime.now(tz).replace(
                hour=0,
                minute=0,
                second=0,
                microsecond=0,
            )
            return int(midnight.timestamp() * 1000)

        if fc.name == "startOf":
            now_local = datetime.now(tz)
            if fc.unit == "day":
                start = now_local.replace(
                    hour=0,
                    minute=0,
                    second=0,
                    microsecond=0,
                )
            elif fc.unit == "week":
                days_since_monday = now_local.weekday()
                start = (now_local - timedelta(days=days_since_monday)).replace(
                    hour=0,
                    minute=0,
                    second=0,
                    microsecond=0,
                )
            elif fc.unit == "month":
                start = now_local.replace(
                    day=1,
                    hour=0,
                    minute=0,
                    second=0,
                    microsecond=0,
                )
            else:
                raise FlyqlError(f"unsupported startOf unit: {fc.unit}")
            return int(start.timestamp() * 1000)

        raise FlyqlError(f"unknown function: {fc.name}")

    def _parse_iso_string_to_ms(
        self, s: str, column: Optional[Column]
    ) -> Optional[int]:
        """Lenient iso8601 parse (T or space separator, optional offset/Z).

        Decision 19: DST fall-back resolves to fold=0 (earlier); DST
        spring-forward (nonexistent wall-clock) returns None.
        Python 3.10 ``fromisoformat`` lacks Z support — shim via replace.
        """
        if not s:
            return None
        # Fast-path: reject obvious non-date strings before parsing.
        has_delim = any(ch in s for ch in "-:T/")
        if not has_delim and not s.lstrip("-").isdigit():
            return None
        s_fix = s.replace("Z", "+00:00", 1) if s.endswith("Z") else s
        dt: Optional[datetime] = None
        try:
            dt = datetime.fromisoformat(s_fix)
        except ValueError:
            if " " in s_fix:
                try:
                    dt = datetime.fromisoformat(s_fix.replace(" ", "T", 1))
                except ValueError:
                    dt = None
        if dt is None:
            # Try date-only form
            try:
                d = date.fromisoformat(s)
                dt = datetime(d.year, d.month, d.day)
            except ValueError:
                return None
        if dt.tzinfo is None:
            tz = self._resolve_tz(column.tz if column else "", "")
            aware = dt.replace(tzinfo=tz, fold=0)
            try:
                ms = int(aware.timestamp() * 1000)
            except (OSError, OverflowError, ValueError):
                return None
            # DST spring-forward detection (Decision 19): re-project the
            # UTC instant back to the tz wall clock and compare to the
            # original naive input. Mismatch = input was in the gap.
            try:
                roundtrip = datetime.fromtimestamp(ms / 1000, tz).replace(tzinfo=None)
            except (OSError, OverflowError, ValueError):
                return None
            if roundtrip.replace(microsecond=0) != dt.replace(microsecond=0):
                return None
            return ms
        try:
            return int(dt.timestamp() * 1000)
        except (OSError, OverflowError, ValueError):
            return None

    def _resolve_record_value_as_ms(
        self, value: Any, column: Optional[Column] = None
    ) -> Optional[int]:
        """Coerce an arbitrary record/literal value to ms since epoch.

        Handles native temporal types, pandas ``Timestamp`` (via
        datetime subclass), ISO strings (lenient T/space separator),
        and numerics with ``column.unit`` (default ``"ms"``).

        Precision caveat (Decision 23): ``int(dt.timestamp() * 1000)``
        truncates microseconds.
        """
        if value is None or isinstance(value, bool):
            return None
        # datetime.datetime check MUST precede datetime.date (Risk 2).
        if isinstance(value, datetime):
            if value.tzinfo is None:
                tz = self._resolve_tz(column.tz if column else "", "")
                value = value.replace(tzinfo=tz)
            try:
                return int(value.timestamp() * 1000)
            except (OSError, OverflowError, ValueError):
                return None
        if isinstance(value, date):
            tz = self._resolve_tz(column.tz if column else "", "")
            dt = datetime(value.year, value.month, value.day, tzinfo=tz)
            try:
                return int(dt.timestamp() * 1000)
            except (OSError, OverflowError, ValueError):
                return None
        if isinstance(value, (int, float)):
            unit = (column.unit if column else "") or "ms"
            mul = _NUMERIC_UNIT_TO_MS_MUL.get(unit)
            if mul is None:
                return None
            try:
                return int(value * mul)
            except (OverflowError, ValueError):
                return None
        if isinstance(value, str):
            return self._parse_iso_string_to_ms(value, column)
        # pandas.Timestamp / other datetime-like objects exposing
        # to_pydatetime(); covered by the datetime isinstance above
        # (pandas.Timestamp subclasses datetime), but kept defensive.
        to_py = getattr(value, "to_pydatetime", None)
        if callable(to_py):
            try:
                return self._resolve_record_value_as_ms(to_py(), column)
            except Exception:
                return None
        return None

    def _resolve_record_value_as_date(
        self, value: Any, column: Optional[Column] = None
    ) -> Optional[int]:
        """Coerce to packed YYYYMMDD int for Date-column comparison."""
        if value is None or isinstance(value, bool):
            return None
        if isinstance(value, datetime):
            if value.tzinfo is not None:
                tz = self._resolve_tz(column.tz if column else "", "")
                value = value.astimezone(tz)
            return _pack_date(value.year, value.month, value.day)
        if isinstance(value, date):
            return _pack_date(value.year, value.month, value.day)
        if isinstance(value, (int, float)):
            ms = self._resolve_record_value_as_ms(value, column)
            if ms is None:
                return None
            tz = self._resolve_tz(column.tz if column else "", "")
            try:
                dt = datetime.fromtimestamp(ms / 1000, tz)
            except (OSError, OverflowError, ValueError):
                return None
            return _pack_date(dt.year, dt.month, dt.day)
        if isinstance(value, str):
            # Try date-only form first (YYYY-MM-DD) so a pure date literal
            # round-trips exactly without going through a tz conversion.
            if len(value) == 10 and value[4:5] == "-" and value[7:8] == "-":
                try:
                    d = date.fromisoformat(value)
                    return _pack_date(d.year, d.month, d.day)
                except ValueError:
                    pass
            ms = self._parse_iso_string_to_ms(value, column)
            if ms is None:
                return None
            tz = self._resolve_tz(column.tz if column else "", "")
            try:
                dt = datetime.fromtimestamp(ms / 1000, tz)
            except (OSError, OverflowError, ValueError):
                return None
            return _pack_date(dt.year, dt.month, dt.day)
        to_py = getattr(value, "to_pydatetime", None)
        if callable(to_py):
            try:
                return self._resolve_record_value_as_date(to_py(), column)
            except Exception:
                return None
        return None

    def _coerce_literal_to_ms(
        self,
        val: Any,
        value_type: Optional[LiteralKind],
        column: Optional[Column],
    ) -> Optional[int]:
        if value_type == LiteralKind.FUNCTION and isinstance(val, FunctionCall):
            try:
                return self._evaluate_function_call(val)
            except FlyqlError:
                raise
            except Exception:
                return None
        return self._resolve_record_value_as_ms(val, column)

    def _coerce_literal_to_date(
        self,
        val: Any,
        value_type: Optional[LiteralKind],
        column: Optional[Column],
    ) -> Optional[int]:
        if value_type == LiteralKind.FUNCTION and isinstance(val, FunctionCall):
            try:
                ms = self._evaluate_function_call(val)
            except FlyqlError:
                raise
            except Exception:
                return None
            tz = self._resolve_tz(column.tz if column else "", "")
            try:
                dt = datetime.fromtimestamp(ms / 1000, tz)
            except (OSError, OverflowError, ValueError):
                return None
            return _pack_date(dt.year, dt.month, dt.day)
        return self._resolve_record_value_as_date(val, column)

    def _maybe_warn_date_migration(self, col: Column, record_value: Any) -> None:
        """Fire a one-shot migration warning when a Type.Date column
        receives a datetime-shaped value (native datetime OR ISO string
        with a time component). Numerics do not trigger (F57).
        """
        key = col.match_name or col.name
        if key in self._migration_warned:
            return
        triggered = False
        if isinstance(record_value, bool):
            return
        if isinstance(record_value, datetime):
            triggered = True
        elif isinstance(record_value, str):
            if _DATETIME_SHAPED_STR_RE.search(record_value):
                triggered = True
        if not triggered:
            return
        self._migration_warned.add(key)
        msg = (
            f"flyql: column {col.name!r} is declared Type.Date but received "
            "a datetime-shaped value — did you mean Type.DateTime? "
            "See migration guide: https://docs.flyql.dev/syntax/dates"
        )
        warnings.warn(msg, UserWarning, stacklevel=3)
        logging.getLogger("flyql").warning(msg)

    def evaluate(
        self,
        root: Node,
        record: Record,
    ) -> bool:
        result: bool

        if root.expression:
            result = self._eval_expression(root.expression, record)
        else:
            left: Optional[bool] = None
            right: Optional[bool] = None

            if root.left is not None:
                left = self.evaluate(root.left, record)

            if root.right is not None:
                right = self.evaluate(root.right, record)

            if left is not None and right is not None:
                if root.bool_operator == BoolOperator.AND.value:
                    result = left and right
                elif root.bool_operator == BoolOperator.OR.value:
                    result = left or right
                else:
                    raise FlyqlError(f"Unknown boolean operator: {root.bool_operator}")
            elif left is not None:
                result = left
            elif right is not None:
                result = right
            else:
                raise ValueError("it should never happen")

        if getattr(root, "negated", False):
            result = not result

        return result

    def _get_regex(
        self,
        value: str,
    ) -> Any:
        if not _HAVE_RE2:
            raise FlyqlError(MATCHER_MESSAGES[ERR_RE2_MISSING])
        regex = self.cache.get(value)
        if regex is None:
            try:
                regex = re2.compile(value)
            except Exception as err:
                raise FlyqlError(f"invalid regex given: {value} -> {err}") from err
            else:
                self.cache[value] = regex
        return regex

    def _eval_expression(
        self,
        expression: Expression,
        record: Record,
    ) -> bool:
        if expression.value_type == LiteralKind.PARAMETER:
            if isinstance(expression.value, Parameter):
                raise FlyqlError(
                    f"unbound parameter '${expression.value.name}' — call bind_params() before evaluating"
                )
            raise FlyqlError("unbound parameter — call bind_params() before evaluating")

        if expression.values is not None:
            for v in expression.values:
                if isinstance(v, Parameter):
                    raise FlyqlError(
                        f"unbound parameter '${v.name}' in IN list — call bind_params() before evaluating"
                    )

        if (
            isinstance(expression.value, FunctionCall)
            and expression.value.parameter_args
        ):
            raise FlyqlError(
                f"unbound parameter(s) in function {expression.value.name}() — call bind_params() before evaluating"
            )

        key = Key(expression.key.raw)
        value = record.get_value(key)

        if expression.key.transformers:
            for t_dict in expression.key.transformers:
                transformer = self._registry.get(t_dict.name)
                if transformer is None:
                    raise FlyqlError(f"unknown transformer: {t_dict.name}")
                value = transformer.apply(value, t_dict.arguments)

        # Handle truthy operator (standalone key check)
        if expression.operator == Operator.TRUTHY.value:
            return is_truthy(value)

        # Resolve COLUMN-typed RHS values from the record
        expr_value = expression.value
        if expression.value_type == LiteralKind.COLUMN and isinstance(expr_value, str):
            try:
                rhs_key = Key(expr_value)
            except Exception:
                rhs_key = None
            if rhs_key is not None and rhs_key.value in record.data:
                expr_value = record.get_value(rhs_key)

        # Determine temporal context (schema-driven + Python-only schemaless fallback)
        col = self._resolve_column_for_expression(expression)
        is_date_col = col is not None and col.type == Type.Date
        is_datetime_col = col is not None and col.type == Type.DateTime
        if col is None:
            # Python-only schemaless auto-infer (Decision 14) — datetime BEFORE date (subclass)
            if isinstance(value, datetime):
                is_datetime_col = True
            elif isinstance(value, date):
                is_date_col = True

        # Decision 15: runtime migration warning for Type.Date columns that
        # actually carry datetime-shaped data.
        if is_date_col and col is not None and col.type == Type.Date:
            self._maybe_warn_date_migration(col, value)

        # Decision 20: column-driven coercion for eligible literal kinds.
        temporal = is_date_col or is_datetime_col
        coerced = False
        if (
            temporal
            and expression.value_type in _TEMPORAL_ELIGIBLE_KINDS
            and expression.operator not in (Operator.IN.value, Operator.NOT_IN.value)
        ):
            if is_datetime_col:
                rec_coerced = self._resolve_record_value_as_ms(value, col)
                rhs_coerced = self._coerce_literal_to_ms(
                    expr_value, expression.value_type, col
                )
            else:  # is_date_col
                rec_coerced = self._resolve_record_value_as_date(value, col)
                rhs_coerced = self._coerce_literal_to_date(
                    expr_value, expression.value_type, col
                )
            if rec_coerced is None or rhs_coerced is None:
                return False
            value = rec_coerced
            expr_value = rhs_coerced
            coerced = True

        # Schema-free legacy FUNCTION path (preserves pre-spec behavior when
        # no Date/DateTime column schema is declared).
        if (
            not coerced
            and expression.value_type == LiteralKind.FUNCTION
            and isinstance(expr_value, FunctionCall)
            and expression.operator not in (Operator.IN.value, Operator.NOT_IN.value)
        ):
            threshold_ms = self._evaluate_function_call(expr_value)
            record_ms = self._resolve_record_value_as_ms(value, None)
            if record_ms is None:
                return False
            value = record_ms
            expr_value = threshold_ms

        regex: Optional[Any] = None
        if expression.operator in REGEX_OPERATORS:
            regex = self._get_regex(str(expr_value))

        if expression.operator == Operator.EQUALS.value:
            if isinstance(expr_value, bool) or expr_value is None:
                return value is expr_value
            if isinstance(value, bool) != isinstance(expr_value, bool):
                return False
            return bool(value == expr_value)
        elif expression.operator == Operator.NOT_EQUALS.value:
            if isinstance(expr_value, bool) or expr_value is None:
                return value is not expr_value
            if value is None:
                return False
            if isinstance(value, bool) != isinstance(expr_value, bool):
                return True
            return bool(value != expr_value)
        elif expression.operator == Operator.REGEX.value:
            if regex is None:
                return False
            return bool(regex.search(str(value)))
        elif expression.operator == Operator.NOT_REGEX.value:
            if value is None:
                return False
            if regex is None:
                return True
            return not bool(regex.search(str(value)))
        elif expression.operator == Operator.LIKE.value:
            like_regex = _like_to_regex(str(expr_value))
            regex = self._get_regex(like_regex)
            return bool(regex.search(str(value)))
        elif expression.operator == Operator.NOT_LIKE.value:
            if value is None:
                return False
            like_regex = _like_to_regex(str(expr_value))
            regex = self._get_regex(like_regex)
            return not bool(regex.search(str(value)))
        elif expression.operator == Operator.ILIKE.value:
            like_regex = "(?i)" + _like_to_regex(str(expr_value))
            regex = self._get_regex(like_regex)
            return bool(regex.search(str(value)))
        elif expression.operator == Operator.NOT_ILIKE.value:
            if value is None:
                return False
            like_regex = "(?i)" + _like_to_regex(str(expr_value))
            regex = self._get_regex(like_regex)
            return not bool(regex.search(str(value)))
        elif expression.operator == Operator.GREATER_THAN.value:
            try:
                return bool(value > expr_value)
            except TypeError:
                return False
        elif expression.operator == Operator.LOWER_THAN.value:
            try:
                return bool(value < expr_value)
            except TypeError:
                return False
        elif expression.operator == Operator.GREATER_OR_EQUALS_THAN.value:
            try:
                return bool(value >= expr_value)
            except TypeError:
                return False
        elif expression.operator == Operator.LOWER_OR_EQUALS_THAN.value:
            try:
                return bool(value <= expr_value)
            except TypeError:
                return False
        elif expression.operator == Operator.IN.value:
            if not expression.values:
                return False
            resolved_values = self._resolve_in_values(
                expression, record, col, is_date_col, is_datetime_col
            )
            if temporal:
                value = self._coerce_value_for_temporal(value, col, is_date_col)
                if value is None:
                    return False
            return self._value_in_list(value, resolved_values)
        elif expression.operator == Operator.NOT_IN.value:
            if not expression.values:
                return True
            if value is None:
                return False
            resolved_values = self._resolve_in_values(
                expression, record, col, is_date_col, is_datetime_col
            )
            if temporal:
                value = self._coerce_value_for_temporal(value, col, is_date_col)
                if value is None:
                    return False
            return not self._value_in_list(value, resolved_values)
        elif expression.operator == Operator.HAS.value:
            return self._eval_has(value, expr_value)
        elif expression.operator == Operator.NOT_HAS.value:
            if value is None:
                return False
            return not self._eval_has(value, expr_value)
        else:
            raise FlyqlError(f"Unknown expression operator: {expression.operator}")

    def _coerce_value_for_temporal(
        self, value: Any, col: Optional[Column], is_date_col: bool
    ) -> Optional[int]:
        if is_date_col:
            return self._resolve_record_value_as_date(value, col)
        return self._resolve_record_value_as_ms(value, col)

    @staticmethod
    def _strict_equal(a: Any, b: Any) -> bool:
        if isinstance(a, bool) != isinstance(b, bool):
            return False
        if a is None or b is None:
            return a is b
        return bool(a == b)

    def _resolve_in_values(
        self,
        expression: Expression,
        record: Record,
        column: Optional[Column] = None,
        is_date_col: bool = False,
        is_datetime_col: bool = False,
    ) -> List[Any]:
        if not expression.values_types or not expression.values:
            return expression.values or []
        resolved: List[Any] = []
        for i, v in enumerate(expression.values):
            vt = (
                expression.values_types[i] if i < len(expression.values_types) else None
            )
            if vt == LiteralKind.COLUMN and isinstance(v, str):
                try:
                    rhs_key = Key(v)
                except Exception:
                    rhs_key = None
                if rhs_key is not None and rhs_key.value in record.data:
                    resolved.append(record.get_value(rhs_key))
                else:
                    resolved.append(v)
            elif (is_date_col or is_datetime_col) and vt in _TEMPORAL_ELIGIBLE_KINDS:
                if is_datetime_col:
                    coerced = self._coerce_literal_to_ms(v, vt, column)
                else:
                    coerced = self._coerce_literal_to_date(v, vt, column)
                # Skip items that fail to coerce (no match rather than crash).
                if coerced is not None:
                    resolved.append(coerced)
            else:
                resolved.append(v)
        return resolved

    def _value_in_list(self, value: Any, items: List[Any]) -> bool:
        for item in items:
            if self._strict_equal(value, item):
                return True
        return False

    def _eval_has(self, value: Any, expr_value: Any) -> bool:
        if value is None:
            return False
        if isinstance(value, str):
            return str(expr_value) in value
        if isinstance(value, dict):
            return str(expr_value) in value
        if isinstance(value, (list, tuple)):
            return any(self._strict_equal(item, expr_value) for item in value)
        return False
