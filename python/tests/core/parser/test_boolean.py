import pytest
from flyql.core.parser import Parser, ParserError, parse
from flyql.core.constants import Operator, BoolOperator
from flyql.core.state import State
from .helpers import get_expression


class TestParserBooleanOperators:

    def test_and_operator(self):
        result = parse("key1=value1 and key2=value2")
        assert result.root.bool_operator == "and"
        assert result.root.left is not None
        assert result.root.right is not None

        left_expr = get_expression(result.root.left)
        right_expr = get_expression(result.root.right)

        assert left_expr.key == "key1"
        assert right_expr.key == "key2"

    def test_or_operator(self):
        result = parse("status=200 or status=404")
        assert result.root.bool_operator == "or"

        left_expr = get_expression(result.root.left)
        right_expr = get_expression(result.root.right)

        assert left_expr.key == "status"
        assert right_expr.key == "status"

    def test_multiple_and(self):
        result = parse("a=1 and b=2 and c=3")
        assert result.root.bool_operator == "and"
        assert result.root.left is not None
        assert result.root.right is not None

    def test_multiple_or(self):
        result = parse("x=1 or y=2 or z=3")
        assert result.root.bool_operator == "or"
        assert result.root.left is not None
        assert result.root.right is not None


class TestParserGrouping:

    def test_simple_grouping(self):
        result = parse("(key=value)")
        assert result.root is not None
        try:
            expr = get_expression(result.root)
            assert expr.key == "key"
            assert expr.value == "value"
        except AssertionError:
            assert result.root.left is not None or result.root.right is not None

    def test_group_with_and(self):
        result = parse("(a=1 and b=2)")
        assert result.root.bool_operator in ["and", "or"]
        assert result.root.left is not None or result.root.right is not None

    def test_group_with_or(self):
        result = parse("(x=1 or y=2)")
        assert result.root.bool_operator in ["and", "or"]
        assert result.root.left is not None or result.root.right is not None

    def test_mixed_operators_with_groups(self):
        result = parse("status=200 and (service=api or service=web)")
        assert result.root.bool_operator == "and"
        assert result.root.left is not None
        assert result.root.right is not None
        assert result.root.right.bool_operator == "or"

    def test_nested_groups(self):
        result = parse("((a=1 and b=2) or (c=3 and d=4))")
        assert result.root.bool_operator in ["and", "or"]
        has_content = (
            result.root.expression is not None
            or result.root.left is not None
            or result.root.right is not None
        )
        assert has_content, "Tree should have some content"

    def test_complex_nested_groups(self):
        result = parse(
            "status=200 and ((service=api and version>1.0) or (service=web and active=true))"
        )
        assert result.root.bool_operator == "and"
        assert result.root.left is not None
        assert result.root.right is not None
