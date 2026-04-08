from typing import Any, Optional, Dict, List, Final

import re2  # type: ignore[import-untyped]

from flyql.core.constants import Operator, BoolOperator
from flyql.core.expression import Expression
from flyql.core.exceptions import FlyqlError
from flyql.core.tree import Node
from flyql.types import ValueType

from flyql.matcher.key import Key
from flyql.matcher.record import Record
from flyql.transformers.registry import TransformerRegistry, default_registry

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
    ) -> None:
        self.cache: Dict[str, Any] = {}
        self._registry = registry or default_registry()

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
