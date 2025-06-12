import pytest
from flyql.core.parser import Parser, ParserError, parse
from flyql.core.constants import Operator, BoolOperator
from flyql.core.state import State


class TestParserErrors:

    def test_empty_input(self):
        with pytest.raises(ParserError) as exc_info:
            parse("")
        assert exc_info.value.errno in [24, 25, 26]

    def test_invalid_character_in_key(self):
        with pytest.raises(ParserError) as exc_info:
            parse("ke@y=value")
        assert exc_info.value.errno == 3

    def test_invalid_operator(self):
        with pytest.raises(ParserError) as exc_info:
            parse("key==value")
        assert exc_info.value.errno == 10

    def test_unmatched_parentheses_open(self):
        with pytest.raises(ParserError) as exc_info:
            parse("(key=value")
        assert "unmatched parenthesis" in str(exc_info.value)

    def test_unmatched_parentheses_close(self):
        with pytest.raises(ParserError) as exc_info:
            parse("key=value)")
        assert "unmatched parenthesis" in str(exc_info.value)

    def test_invalid_boolean_operator(self):
        with pytest.raises(ParserError) as exc_info:
            parse("a=1 invalid b=2")
        assert exc_info.value.errno == 20

    def test_missing_boolean_operator_delimiter(self):
        with pytest.raises(ParserError) as exc_info:
            parse("a=1 andb=2")
        assert "expected delimiter after bool operator" in str(exc_info.value)
        assert exc_info.value.errno == 23

    def test_unexpected_delimiter_in_key(self):
        with pytest.raises(ParserError) as exc_info:
            parse("ke y=value")
        assert "unexpected delimiter in key" in str(exc_info.value)
        assert exc_info.value.errno == 2

    def test_unexpected_delimiter_in_operator(self):
        with pytest.raises(ParserError) as exc_info:
            parse("key= =value")
        assert "unexpected delimiter in operator" in str(exc_info.value)
        assert exc_info.value.errno == 4

    def test_only_whitespace(self):
        with pytest.raises(ParserError) as exc_info:
            parse("   ")
        assert exc_info.value.errno in [24, 26]
