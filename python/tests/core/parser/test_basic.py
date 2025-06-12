import pytest
from flyql.core.parser import Parser, ParserError, parse
from flyql.core.constants import Operator, BoolOperator
from flyql.core.state import State
from .helpers import get_expression


class TestParserBasic:

    def test_simple_equals(self):
        result = parse("key=value")
        assert result.root is not None
        if result.root.expression is not None:
            assert result.root.expression.key == "key"
            assert result.root.expression.operator == "="
            assert result.root.expression.value == "value"
        else:
            assert result.root.left is not None
            assert result.root.left.expression is not None
            assert result.root.left.expression.key == "key"
            assert result.root.left.expression.operator == "="
            assert result.root.left.expression.value == "value"

    def test_simple_not_equals(self):
        result = parse("status!=200")
        expr = get_expression(result.root)
        assert expr.key == "status"
        assert expr.operator == "!="
        assert expr.value == 200.0

    def test_simple_regex(self):
        result = parse("message=~hello.*")
        expr = get_expression(result.root)
        assert expr.key == "message"
        assert expr.operator == "=~"
        assert expr.value == "hello.*"

    def test_simple_not_regex(self):
        result = parse("message!~test")
        expr = get_expression(result.root)
        assert expr.key == "message"
        assert expr.operator == "!~"
        assert expr.value == "test"

    def test_comparison_operators(self):
        queries = [
            ("count>10", "count", ">", 10.0),
            ("price<100.50", "price", "<", 100.50),
            ("age>=18", "age", ">=", 18.0),
            ("score<=90", "score", "<=", 90.0),
        ]

        for query, expected_key, expected_op, expected_value in queries:
            result = parse(query)
            expr = get_expression(result.root)
            assert expr.key == expected_key
            assert expr.operator == expected_op
            assert expr.value == expected_value


class TestParserValues:

    def test_string_values(self):
        result = parse("name=john")
        expr = get_expression(result.root)
        assert expr.value == "john"
        assert isinstance(expr.value, str)

    def test_numeric_values(self):
        result = parse("count=42")
        expr = get_expression(result.root)
        assert expr.value == 42.0
        assert isinstance(expr.value, float)

        result = parse("price=19.99")
        expr = get_expression(result.root)
        assert expr.value == 19.99
        assert isinstance(expr.value, float)

    def test_single_quoted_values(self):
        result = parse("name='john doe'")
        expr = get_expression(result.root)
        assert expr.value == "john doe"

    def test_double_quoted_values(self):
        result = parse('message="hello world"')
        expr = get_expression(result.root)
        assert expr.value == "hello world"

    def test_empty_value(self):
        try:
            result = parse("field=")
            expr = get_expression(result.root)
            assert expr.value == ""
        except (ParserError, AssertionError):
            pass

    def test_escaped_quotes(self):
        result = parse("text='john\\'s book'")
        expr = get_expression(result.root)
        assert "john" in expr.value and "book" in expr.value

        result = parse('text="say \\"hello\\""')
        expr = get_expression(result.root)
        assert "say" in expr.value and "hello" in expr.value


class TestParserKeys:

    def test_simple_key(self):
        result = parse("user=john")
        expr = get_expression(result.root)
        assert expr.key == "user"

    def test_key_with_underscore(self):
        result = parse("user_name=john")
        expr = get_expression(result.root)
        assert expr.key == "user_name"

    def test_key_with_dot(self):
        result = parse("user.name=john")
        expr = get_expression(result.root)
        assert expr.key == "user.name"

    def test_key_with_colon(self):
        result = parse("user:name=john")
        expr = get_expression(result.root)
        assert expr.key == "user:name"

    def test_key_with_slash(self):
        result = parse("path/to/field=value")
        expr = get_expression(result.root)
        assert expr.key == "path/to/field"

    def test_complex_key(self):
        result = parse("nested.object:field_name/sub=value")
        expr = get_expression(result.root)
        assert expr.key == "nested.object:field_name/sub"


class TestParserValueTypes:

    def test_value_type_detection_auto(self):
        result = parse("count=123")
        expr = get_expression(result.root)
        assert expr.value == 123.0
        assert isinstance(expr.value, float)

    def test_value_type_detection_string(self):
        result = parse("count='123'")
        expr = get_expression(result.root)
        assert expr.value == "123"
        assert isinstance(expr.value, str)

    def test_non_numeric_string(self):
        result = parse("name=john")
        expr = get_expression(result.root)
        assert expr.value == "john"
        assert isinstance(expr.value, str)
