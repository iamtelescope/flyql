import pytest
from flyql.core.exceptions import FlyqlError
from flyql.generators.clickhouse.generator import (
    escape_param,
    is_number,
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
        assert escape_param(True) == "true"
        assert escape_param(False) == "false"

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
