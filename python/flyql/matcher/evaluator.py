from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Dict, List, Final
from zoneinfo import ZoneInfo

import re2  # type: ignore[import-untyped]

from flyql.core.constants import Operator, BoolOperator
from flyql.core.expression import Expression, FunctionCall, Duration, Parameter
from flyql.core.exceptions import FlyqlError
from flyql.core.tree import Node
from flyql.types import ValueType

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


def _sum_durations(durations: List[Duration]) -> int:
    """Sum a list of Duration objects into total milliseconds."""
    total = 0
    for d in durations:
        multiplier = _DURATION_UNIT_MS.get(d.unit)
        if multiplier is None:
            raise FlyqlError(f"unknown duration unit: {d.unit}")
        total += d.value * multiplier
    return total


def _evaluate_function_call(fc: FunctionCall, default_tz: str) -> int:
    """Resolve a FunctionCall to milliseconds since epoch."""
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)

    if fc.name == "now":
        return now_ms

    if fc.name == "ago":
        return now_ms - _sum_durations(fc.duration_args)

    tz_name = fc.timezone or default_tz
    try:
        tz = ZoneInfo(tz_name)
    except (KeyError, Exception):
        raise ValueError(f"invalid timezone '{tz_name}'")

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


def _resolve_record_value_as_ms(value: Any) -> Optional[int]:
    """Convert a record value to milliseconds since epoch for temporal comparison.

    Returns None if the value cannot be interpreted as a timestamp.
    """
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value)
            return int(dt.timestamp() * 1000)
        except (ValueError, OSError):
            return None
    return None


REGEX_OPERATORS = {Operator.REGEX.value, Operator.NOT_REGEX.value}

_REGEX_META = frozenset(r".[{()*+?^$|\\")


def _like_to_regex(pattern: str) -> str:
    """Convert a SQL LIKE pattern to an anchored Python regex string."""
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
    ) -> None:
        self.cache: Dict[str, Any] = {}
        self._registry = registry or default_registry()
        self._default_timezone = default_timezone

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
        if expression.value_type == ValueType.PARAMETER:
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
        if expression.value_type == ValueType.COLUMN and isinstance(expr_value, str):
            try:
                rhs_key = Key(expr_value)
            except Exception:
                rhs_key = None
            if rhs_key is not None and rhs_key.value in record.data:
                expr_value = record.get_value(rhs_key)

        # Resolve FUNCTION-typed RHS values to milliseconds since epoch
        if expression.value_type == ValueType.FUNCTION and isinstance(
            expr_value, FunctionCall
        ):
            threshold_ms = _evaluate_function_call(expr_value, self._default_timezone)
            record_ms = _resolve_record_value_as_ms(value)
            if record_ms is None:
                return False
            # Replace both sides with numeric ms values for the comparison below
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
            if isinstance(value, bool) != isinstance(expr_value, bool):
                return True
            return bool(value != expr_value)
        elif expression.operator == Operator.REGEX.value:
            if regex is None:
                return False
            return bool(regex.search(str(value)))
        elif expression.operator == Operator.NOT_REGEX.value:
            if regex is None:
                return True
            return not bool(regex.search(str(value)))
        elif expression.operator == Operator.LIKE.value:
            like_regex = _like_to_regex(str(expr_value))
            regex = self._get_regex(like_regex)
            return bool(regex.search(str(value)))
        elif expression.operator == Operator.NOT_LIKE.value:
            like_regex = _like_to_regex(str(expr_value))
            regex = self._get_regex(like_regex)
            return not bool(regex.search(str(value)))
        elif expression.operator == Operator.ILIKE.value:
            like_regex = "(?i)" + _like_to_regex(str(expr_value))
            regex = self._get_regex(like_regex)
            return bool(regex.search(str(value)))
        elif expression.operator == Operator.NOT_ILIKE.value:
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
            resolved_values = self._resolve_in_values(expression, record)
            return self._value_in_list(value, resolved_values)
        elif expression.operator == Operator.NOT_IN.value:
            if not expression.values:
                return True
            resolved_values = self._resolve_in_values(expression, record)
            return not self._value_in_list(value, resolved_values)
        elif expression.operator == Operator.HAS.value:
            return self._eval_has(value, expr_value)
        elif expression.operator == Operator.NOT_HAS.value:
            if value is None:
                return True
            return not self._eval_has(value, expr_value)
        else:
            raise FlyqlError(f"Unknown expression operator: {expression.operator}")

    @staticmethod
    def _strict_equal(a: Any, b: Any) -> bool:
        if isinstance(a, bool) != isinstance(b, bool):
            return False
        if a is None or b is None:
            return a is b
        return bool(a == b)

    @staticmethod
    def _resolve_in_values(expression: Expression, record: Record) -> List[Any]:
        if not expression.values_types or not expression.values:
            return expression.values or []
        resolved: List[Any] = []
        for i, v in enumerate(expression.values):
            if (
                i < len(expression.values_types)
                and expression.values_types[i] == ValueType.COLUMN
                and isinstance(v, str)
            ):
                try:
                    rhs_key = Key(v)
                except Exception:
                    rhs_key = None
                if rhs_key is not None and rhs_key.value in record.data:
                    resolved.append(record.get_value(rhs_key))
                else:
                    resolved.append(v)
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
