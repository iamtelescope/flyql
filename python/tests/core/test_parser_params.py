import pytest
from flyql.core.parser import Parser, ParserError, parse
from flyql.core.state import State


class TestRaiseErrorParameter:

    def test_raise_error_true_throws_exception(self):
        parser = Parser()
        with pytest.raises(ParserError):
            parser.parse("invalid@input", raise_error=True)

    def test_raise_error_false_no_exception(self):
        parser = Parser()
        parser.parse("invalid@input", raise_error=False)
        assert parser.state == State.ERROR
        assert parser.errno > 0

    def test_raise_error_false_empty_input(self):
        parser = Parser()
        parser.parse("", raise_error=False)
        assert parser.state == State.ERROR
        assert parser.errno == 24


class TestIgnoreLastCharParameter:

    def test_ignore_last_char_false_validates_final_state(self):
        parser = Parser()
        with pytest.raises(ParserError) as exc_info:
            parser.parse("key", raise_error=True, ignore_last_char=False)
        assert exc_info.value.errno == 25

    def test_ignore_last_char_true_skips_validation(self):
        parser = Parser()
        parser.parse("key", raise_error=True, ignore_last_char=True)
        assert parser.state == State.KEY
        assert parser.key == "key"

    def test_ignore_last_char_true_empty_input(self):
        parser = Parser()
        parser.parse("", raise_error=True, ignore_last_char=True)
        assert parser.state == State.INITIAL

    def test_ignore_last_char_true_incomplete_operator(self):
        parser = Parser()
        parser.parse("key=", raise_error=True, ignore_last_char=True)
        assert parser.state == State.KEY_VALUE_OPERATOR
        assert parser.key_value_operator == "="


class TestParameterCombinations:

    def test_both_false(self):
        parser = Parser()
        parser.parse("key", raise_error=False, ignore_last_char=False)
        assert parser.state == State.ERROR
        assert parser.errno == 25

    def test_both_true(self):
        parser = Parser()
        with pytest.raises(ParserError):
            parser.parse("invalid@", raise_error=True, ignore_last_char=True)


class TestParseFunctionParameters:

    def test_parse_function_with_parameters(self):
        parser = parse("invalid@", raise_error=False, ignore_last_char=True)
        assert parser.state == State.ERROR

    def test_parse_function_defaults(self):
        with pytest.raises(ParserError):
            parse("invalid@")


class TestIncrementalParsing:

    def test_incomplete_states(self):
        test_cases = [
            ("k", State.KEY),
            ("key ", State.EXPECT_OPERATOR),
            ("key =", State.KEY_VALUE_OPERATOR),
            ("key=v", State.VALUE),
        ]

        for input_text, expected_state in test_cases:
            parser = Parser()
            parser.parse(input_text, raise_error=True, ignore_last_char=True)
            assert parser.state == expected_state
