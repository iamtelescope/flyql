import unittest

from flyql.tree import Node
from flyql.expression import Expression
from flyql.constants import VALID_BOOL_OPERATORS
from flyql.exceptions import FlyqlError


INVALID_OPERATOR_VALUE = "INVALID_OPERATOR"


def get_valid_expression() -> Expression:
    return Expression(key="a", operator="=", value="b", value_is_string=None)


def get_valid_node() -> Node:
    return Node(
        bool_operator=VALID_BOOL_OPERATORS[0],
        expression=get_valid_expression(),
        left=None,
        right=None,
    )


class TestsNode(unittest.TestCase):
    def test_valid_init(self):
        for op in VALID_BOOL_OPERATORS:
            Node(
                bool_operator=op,
                expression=get_valid_expression(),
                left=None,
                right=None,
            )

    def test_valid_set_bool_operator(self):
        node = get_valid_node()
        self.assertEqual(node.bool_operator, VALID_BOOL_OPERATORS[0])
        node.set_bool_operator(VALID_BOOL_OPERATORS[1])
        self.assertEqual(node.bool_operator, VALID_BOOL_OPERATORS[1])

    def test_invalid_set_bool_operator(self):
        node = get_valid_node()
        with self.assertRaises(FlyqlError):
            node.set_bool_operator(INVALID_OPERATOR_VALUE)

    def test_set_left(self):
        node = get_valid_node()
        self.assertIsNone(node.left)
        left = get_valid_node()
        node.set_left(left)
        self.assertIs(node.left, left)

    def test_set_right(self):
        node = get_valid_node()
        self.assertIsNone(node.right)
        right = get_valid_node()
        node.set_right(right)
        self.assertIs(node.right, right)

    def test_set_expression(self):
        node = get_valid_node()
        expression = get_valid_expression()
        self.assertIsNot(node.expression, expression)
        node.set_expression(expression)
        self.assertIs(node.expression, expression)
