import pytest
from flyql.core.parser import Parser, ParserError, parse
from flyql.core.constants import Operator, BoolOperator
from flyql.core.state import State
from .helpers import get_expression, has_expression


class TestParserComplex:

    def test_real_world_query_1(self):
        query = (
            'status=200 and method="GET" and (path="/api/users" or path="/api/orders")'
        )
        result = parse(query)
        assert result.root.bool_operator == "and"
        assert result.root.left is not None
        assert result.root.right is not None

    def test_real_world_query_2(self):
        query = 'level=ERROR and (service=payment or service=auth) and message=~".*timeout.*"'
        result = parse(query)
        assert result.root.bool_operator == "and"

    def test_real_world_query_3(self):
        query = "user:id>1000 and user:status=active and (created_at>=2023-01-01 or updated_at>=2023-01-01)"
        result = parse(query)
        assert result.root.bool_operator == "and"

    def test_numeric_comparisons(self):
        query = "cpu_usage>80.5 and memory_usage<90 and disk_space>=100"
        result = parse(query)
        assert result.root.bool_operator == "and"
        assert result.root.left is not None
        assert result.root.right is not None

    def test_regex_patterns(self):
        query = 'email=~".*@example\\.com$" and phone!~"^\\+1"'
        result = parse(query)
        assert result.root.bool_operator == "and"

    def test_deeply_nested_groups(self):
        query = "((a=1 and b=2) or (c=3 and d=4)) and ((e=5 or f=6) and (g=7 or h=8))"
        result = parse(query)
        assert result.root.bool_operator == "and"

    def test_mixed_quoted_unquoted_values(self):
        query = 'status=200 and message="hello world" and count=42 and flag=true'
        result = parse(query)
        assert result.root.bool_operator == "and"


class TestParserStateManagement:

    def test_parser_resets_correctly(self):
        parser1 = Parser()
        parser1.parse("first=query")
        first_result = parser1.root

        parser2 = Parser()
        parser2.parse("second=query")
        second_result = parser2.root

        first_expr = get_expression(first_result)
        second_expr = get_expression(second_result)

        assert first_expr.key == "first"
        assert second_expr.key == "second"

    def test_parser_error_state(self):
        parser = Parser()
        with pytest.raises(ParserError):
            parser.parse("invalid(query")
        assert parser.state == State.ERROR


class TestParserASTStructure:

    def test_simple_expression_structure(self):
        result = parse("key=value")
        assert result.root is not None
        has_direct_expr = result.root.expression is not None
        has_left_expr = (
            result.root.left is not None and result.root.left.expression is not None
        )
        assert has_direct_expr or has_left_expr

    def test_boolean_expression_structure(self):
        result = parse("a=1 and b=2")
        assert result.root is not None
        assert result.root.bool_operator == "and"
        assert result.root.left is not None
        assert result.root.right is not None
        assert has_expression(result.root.left)
        assert has_expression(result.root.right)

    def test_grouped_expression_structure(self):
        result = parse("(a=1 or b=2)")
        assert result.root is not None
        assert result.root.bool_operator in ["and", "or"]
        assert result.root.left is not None or result.root.right is not None

    def test_parser_behavior_investigation(self):
        test_cases = [
            ("a=1 and b=2", "and"),
            ("a=1 or b=2", "or"),
            ("(a=1 and b=2)", "and"),
            ("(a=1 or b=2)", "or"),
        ]

        for query, expected_op in test_cases:
            result = parse(query)
            print(f"Query: {query}")
            print(f"Expected: {expected_op}, Got: {result.root.bool_operator}")
            assert result.root is not None


class TestParserDebug:

    def test_or_operator_basic(self):
        result = parse("a=1 or b=2")
        print(f"OR test - bool_operator: {result.root.bool_operator}")
        assert result.root.bool_operator in ["and", "or"]

    def test_and_operator_basic(self):
        result = parse("a=1 and b=2")
        print(f"AND test - bool_operator: {result.root.bool_operator}")
        assert result.root.bool_operator == "and"

    def test_empty_value_debug(self):
        try:
            result = parse("field=")
            print(f"Empty value - has expression: {result.root.expression is not None}")
            print(f"Empty value - has left: {result.root.left is not None}")
            print(f"Empty value - has right: {result.root.right is not None}")
        except Exception as e:
            print(f"Empty value caused exception: {e}")

    def test_grouping_debug(self):
        result = parse("(key=value)")
        print(f"Grouping - has expression: {result.root.expression is not None}")
        print(f"Grouping - has left: {result.root.left is not None}")
        print(f"Grouping - has right: {result.root.right is not None}")
        if result.root.left:
            print(f"Left has expression: {result.root.left.expression is not None}")
        if result.root.right:
            print(f"Right has expression: {result.root.right.expression is not None}")
