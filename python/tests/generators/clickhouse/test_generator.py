import pytest
from flyql.core.exceptions import FlyqlError
from flyql.generators.clickhouse.generator import (
    escape_param,
    is_number,
    prepare_like_pattern_value,
)


class TestEscapeParam:

    def test_escape_string(self):
        assert escape_param("hello") == "'hello'"
        assert escape_param("test'quote") == "'test\\'quote'"
        assert escape_param("test\\backslash") == "'test\\\\backslash'"
        assert escape_param("test\nNewline") == "'test\\nNewline'"

    def test_escape_none(self):
        assert escape_param(None) == "NULL"

    def test_escape_numbers(self):
        assert escape_param(123) == "123"
        assert escape_param(12.34) == "12.34"
        assert escape_param(True) == "True"
        assert escape_param(False) == "False"

    def test_escape_unknown_type_raises_error(self):
        class CustomType:
            pass

        with pytest.raises(FlyqlError, match="unsupported type"):
            escape_param(CustomType())


class TestIsNumber:

    def test_is_number_string(self):
        assert is_number("123") is True
        assert is_number("12.34") is True
        assert is_number("-5") is True
        assert is_number("hello") is False
        assert is_number("") is False

    def test_is_number_actual_numbers(self):
        assert is_number(123) is True
        assert is_number(12.34) is True
        assert is_number(-5) is True

    def test_is_number_other_types(self):
        assert is_number(None) is False
        assert is_number([]) is False


class TestPrepareLikePattern:

    def test_no_pattern(self):
        pattern_found, result = prepare_like_pattern_value("hello")
        assert pattern_found is False
        assert result == "hello"

    def test_star_pattern(self):
        pattern_found, result = prepare_like_pattern_value("hello*")
        assert pattern_found is True
        assert result == "hello%"

    def test_multiple_stars(self):
        pattern_found, result = prepare_like_pattern_value("*hello*world*")
        assert pattern_found is True
        assert result == "%hello%world%"

    def test_escaped_star(self):
        pattern_found, result = prepare_like_pattern_value("hello\\*world")
        assert pattern_found is False
        assert result == "hello\\*world"

    def test_percent_escaping(self):
        pattern_found, result = prepare_like_pattern_value("hello%world")
        assert pattern_found is True
        assert result == "hello\\%world"
