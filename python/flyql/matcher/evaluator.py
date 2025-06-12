import re
from typing import Optional, Any, Dict, Pattern

from flyql.core.constants import Operator, BoolOperator
from flyql.core.expression import Expression
from flyql.core.exceptions import FlyqlError
from flyql.core.tree import Node

from flyql.matcher.key import Key
from flyql.matcher.record import Record


class Evaluator:
    def __init__(
        self,
    ) -> None:
        self.cache: Dict[str, Pattern[str]] = {}

    def evaluate(
        self,
        root: Node,
        record: Record,
    ) -> bool:

        if root.expression:
            return self._eval_expression(root.expression, record)

        left: Optional[bool] = None
        right: Optional[bool] = None

        if root.left is not None:
            left = self.evaluate(root.left, record)

        if root.right is not None:
            right = self.evaluate(root.right, record)

        if left is not None and right is not None:
            if root.bool_operator == BoolOperator.AND.value:
                return left and right
            elif root.bool_operator == BoolOperator.OR.value:
                return left or right
            else:
                raise FlyqlError(f"Unknown boolean operator: {root.bool_operator}")
        elif left is not None:
            return left
        elif right is not None:
            return right
        else:
            raise ValueError("it should never happen")

    def _get_regex(
        self,
        value: str,
    ) -> Pattern[str]:
        regex = self.cache.get(value)
        if regex is None:
            try:
                regex = re.compile(value)
            except Exception as err:
                raise FlyqlError(f"invalid regex given: {value} -> {err}")
            else:
                self.cache[value] = regex
        return regex

    def _eval_expression(
        self,
        expression: Expression,
        record: Record,
    ) -> bool:

        key = Key(expression.key)
        value = record.get_value(key)

        regex: Optional[Pattern[str]] = None
        if (
            expression.operator == Operator.EQUALS_REGEX.value
            or expression.operator == Operator.NOT_EQUALS_REGEX.value
        ):
            regex = self._get_regex(str(expression.value))

        if expression.operator == Operator.EQUALS.value:
            return bool(value == expression.value)
        elif expression.operator == Operator.NOT_EQUALS.value:
            return bool(value != expression.value)
        elif expression.operator == Operator.EQUALS_REGEX.value:
            if regex is None:
                return False
            return bool(regex.search(str(value)))
        elif expression.operator == Operator.NOT_EQUALS_REGEX.value:
            if regex is None:
                return True
            return not bool(regex.search(str(value)))
        elif expression.operator == Operator.GREATER_THAN.value:
            return bool(value > expression.value)
        elif expression.operator == Operator.LOWER_THAN.value:
            return bool(value < expression.value)
        elif expression.operator == Operator.GREATER_OR_EQUALS_THAN.value:
            return bool(value >= expression.value)
        elif expression.operator == Operator.LOWER_OR_EQUALS_THAN.value:
            return bool(value <= expression.value)
        else:
            raise FlyqlError(f"Unknown expression operator: {expression.operator}")
