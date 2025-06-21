import pytest

from flyql.core.tree import Node
from flyql.core.expression import Expression
from flyql.core.constants import VALID_BOOL_OPERATORS
from flyql.core.exceptions import FlyqlError
from flyql.core.key import Key


INVALID_OPERATOR_VALUE = "INVALID_OPERATOR"


def get_valid_expression() -> Expression:
    return Expression(key=Key(["a"]), operator="=", value="b", value_is_string=None)


def get_valid_node() -> Node:
    return Node(
        bool_operator=VALID_BOOL_OPERATORS[0],
        expression=get_valid_expression(),
        left=None,
        right=None,
    )


def test_valid_init():
    for op in VALID_BOOL_OPERATORS:
        node = Node(
            bool_operator=op,
            expression=get_valid_expression(),
            left=None,
            right=None,
        )
        assert node.bool_operator == op
        assert node.expression is not None
        assert node.left is None
        assert node.right is None


def test_valid_set_bool_operator():
    node = get_valid_node()
    assert node.bool_operator == VALID_BOOL_OPERATORS[0]
    node.set_bool_operator(VALID_BOOL_OPERATORS[1])
    assert node.bool_operator == VALID_BOOL_OPERATORS[1]


def test_invalid_set_bool_operator():
    node = get_valid_node()
    with pytest.raises(FlyqlError):
        node.set_bool_operator(INVALID_OPERATOR_VALUE)


def test_set_left():
    node = get_valid_node()
    assert node.left is None
    left = get_valid_node()
    node.set_left(left)
    assert node.left is left


def test_set_right():
    node = get_valid_node()
    assert node.right is None
    right = get_valid_node()
    node.set_right(right)
    assert node.right is right


def test_set_expression():
    node = get_valid_node()
    expression = get_valid_expression()
    assert node.expression is not expression
    node.set_expression(expression)
    assert node.expression is expression


def test_node_with_children_no_expression():
    left = get_valid_node()
    right = get_valid_node()
    node = Node(
        bool_operator="and",
        expression=None,
        left=left,
        right=right,
    )
    assert node.left is left
    assert node.right is right
    assert node.expression is None


def test_node_with_expression_no_children():
    expression = get_valid_expression()
    node = Node(
        bool_operator="",
        expression=expression,
        left=None,
        right=None,
    )
    assert node.expression is expression
    assert node.left is None
    assert node.right is None
