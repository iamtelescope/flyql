import pytest

from flyql.core.expression import Expression
from flyql.core.constants import VALID_KEY_VALUE_OPERATORS
from flyql.core.exceptions import FlyqlError
from flyql.core.key import Key


def test_valid_init():
    for op in VALID_KEY_VALUE_OPERATORS:
        key = Key(["a"])
        e = Expression(key=key, operator=op, value="b", value_is_string=None)
        assert str(e) == f"a{op}b"


def test_invalid_operator_init():
    with pytest.raises(FlyqlError):
        Expression(
            key=Key(["a"]), operator="invalid_operator", value="b", value_is_string=None
        )


def test_invalid_key_init():
    with pytest.raises(FlyqlError):
        Expression(key=Key([]), operator="=", value="b", value_is_string=None)


def test_empty_value_is_allowed():
    e = Expression(key=Key(["a"]), operator="=", value="", value_is_string=None)
    assert e.value == ""


def test_string_value():
    e = Expression(key=Key(["name"]), operator="=", value="test", value_is_string=True)
    assert e.value == "test"
    assert isinstance(e.value, str)


def test_numeric_value_conversion():
    e = Expression(key=Key(["count"]), operator="=", value="123", value_is_string=False)
    assert e.value == 123
    assert isinstance(e.value, int)

    e = Expression(
        key=Key(["price"]), operator="=", value="12.34", value_is_string=False
    )
    assert e.value == 12.34
    assert isinstance(e.value, float)


def test_non_numeric_value_stays_string():
    e = Expression(key=Key(["name"]), operator="=", value="abc", value_is_string=False)
    assert e.value == "abc"
    assert isinstance(e.value, str)


def test_none_value_is_string_defaults_to_conversion():
    e = Expression(key=Key(["count"]), operator="=", value="123", value_is_string=None)
    assert e.value == 123
    assert isinstance(e.value, int)

    e = Expression(key=Key(["name"]), operator="=", value="abc", value_is_string=None)
    assert e.value == "abc"
    assert isinstance(e.value, str)
