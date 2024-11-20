from typing import Optional

from flyql.exceptions import FlyqlError
from flyql.expression import Expression
from flyql.constants import VALID_BOOL_OPERATORS


class Node:
    def __init__(
        self,
        bool_operator: str,
        expression: Expression | None,
        left: Optional["Node"],
        right: Optional["Node"],
    ):
        #        if bool_operator not in VALID_BOOL_OPERATORS:
        #            raise FlyqlError(f"invalid bool operator: {bool_operator}")

        if (left or right) and expression:
            raise FlyqlError("either (left or right) or expression at same time")

        #        if not left and not right and not expression:
        #            raise FlyqlError("one of left, right or expression should be specified")

        self.bool_operator = bool_operator
        self.expression = expression
        self.left = left
        self.right = right

    def set_bool_operator(self, bool_operator: str):
        if bool_operator not in VALID_BOOL_OPERATORS:
            raise FlyqlError(f"invalid bool operator: {bool_operator}")
        self.bool_operator = bool_operator

    def set_left(self, node: "Node"):
        self.left = node

    def set_right(self, node: "Node"):
        self.right = node

    def set_expression(self, expression: Expression):
        self.expression = expression
