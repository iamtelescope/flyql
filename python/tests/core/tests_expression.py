import pytest

from flyql.core.expression import Expression
from flyql.core.constants import VALID_KEY_VALUE_OPERATORS
from flyql.core.exceptions import FlyqlError


def test_valid_init():
    for op in VALID_KEY_VALUE_OPERATORS:
        e = Expression(key="a", operator=op, value="b", value_is_string=None)
        assert str(e) == f"a{op}b"


def test_invalid_operator_init():
    with pytest.raises(FlyqlError):
        Expression(
            key="a", operator="invalid_operator", value="b", value_is_string=None
        )


def test_invalid_key_init():
    with pytest.raises(FlyqlError):
        Expression(key="", operator="=", value="b", value_is_string=None)


def test_empty_value_is_allowed():
    e = Expression(key="a", operator="=", value="", value_is_string=None)
    assert e.value == ""


def test_string_value():
    e = Expression(key="name", operator="=", value="test", value_is_string=True)
    assert e.value == "test"
    assert isinstance(e.value, str)


def test_numeric_value_conversion():
    e = Expression(key="count", operator="=", value="123", value_is_string=False)
    assert e.value == 123.0
    assert isinstance(e.value, float)

    e = Expression(key="price", operator="=", value="12.34", value_is_string=False)
    assert e.value == 12.34
    assert isinstance(e.value, float)


def test_non_numeric_value_stays_string():
    e = Expression(key="name", operator="=", value="abc", value_is_string=False)
    assert e.value == "abc"
    assert isinstance(e.value, str)


def test_none_value_is_string_defaults_to_conversion():
    e = Expression(key="count", operator="=", value="123", value_is_string=None)
    assert e.value == 123.0
    assert isinstance(e.value, float)

    e = Expression(key="name", operator="=", value="abc", value_is_string=None)
    assert e.value == "abc"
    assert isinstance(e.value, str)
