from typing import Optional, Union

from flyql.core.exceptions import FlyqlError
from flyql.core.expression import Expression
from flyql.core.constants import VALID_BOOL_OPERATORS


class Node:
    def __init__(
        self,
        bool_operator: str,
        expression: Union[Expression, None],
        left: Optional["Node"],
        right: Optional["Node"],
    ) -> None:
        if (left or right) and expression:
            raise FlyqlError("either (left or right) or expression at same time")

        self.bool_operator = bool_operator
        self.expression = expression
        self.left = left
        self.right = right

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
