from typing import Optional, Union

from flyql.core.exceptions import FlyqlError
from flyql.core.expression import Expression
from flyql.core.constants import VALID_BOOL_OPERATORS
from flyql.core.range import Range


class Node:
    def __init__(
        self,
        bool_operator: str,
        expression: Union[Expression, None],
        left: Optional["Node"],
        right: Optional["Node"],
        range: Optional[Range] = None,
        bool_operator_range: Optional[Range] = None,
        negated: bool = False,
    ) -> None:
        if (left or right) and expression:
            raise FlyqlError("either (left or right) or expression at same time")

        self.bool_operator = bool_operator
        self.expression = expression
        self.left = left
        self.right = right
        self.negated = negated
        self.range = range if range is not None else Range(0, 0)
        self.bool_operator_range = bool_operator_range

    def set_bool_operator(self, bool_operator: str) -> None:
        if bool_operator not in VALID_BOOL_OPERATORS:
            raise FlyqlError(f"invalid bool operator: {bool_operator}")
        self.bool_operator = bool_operator

    def set_left(self, node: "Node") -> None:
        self.left = node

    def set_right(self, node: "Node") -> None:
        self.right = node

    def set_expression(self, expression: Expression) -> None:
        self.expression = expression
