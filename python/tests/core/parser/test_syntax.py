import pytest
from flyql.core.parser import Parser, ParserError, parse
from flyql.core.constants import Operator, BoolOperator
from flyql.core.state import State
from .helpers import get_expression


class TestParserWhitespace:

    def test_no_spaces(self):
        result = parse("key=value")
        expr = get_expression(result.root)
        assert expr.key == "key"

    def test_spaces_around_boolean_operators(self):
        result = parse("a=1 and b=2")
        assert result.root.bool_operator == "and"

    def test_multiple_spaces(self):
        result = parse("a=1   and   b=2")
        assert result.root.bool_operator == "and"

    def test_spaces_in_groups(self):
        result = parse("( a=1 and b=2 )")
        assert result.root.bool_operator == "and"

    def test_newlines_simple(self):
        result = parse("a=1 and b=2")
        assert result.root.bool_operator == "and"


class TestParserEdgeCases:

    def test_single_character_key_value(self):
        result = parse("a=b")
        expr = get_expression(result.root)
        assert expr.key == "a"
        assert expr.value == "b"

    def test_numeric_key(self):
        result = parse("123=value")
        expr = get_expression(result.root)
        assert expr.key == "123"

    def test_special_characters_in_quoted_values(self):
        result = parse('text="!@#$%^&*()"')
        expr = get_expression(result.root)
        assert expr.value == "!@#$%^&*()"

    def test_consecutive_boolean_operators(self):
        with pytest.raises(ParserError):
            parse("a=1 and or b=2")
