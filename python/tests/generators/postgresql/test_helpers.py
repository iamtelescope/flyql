"""PostgreSQL-dialect helper unit tests (validate_operation, validate_in_list_types)."""

import pytest

from flyql.core.constants import Operator
from flyql.core.exceptions import FlyqlError
from flyql.flyql_type import Type
from flyql.generators.postgresql.helpers import (
    get_value_type,
    validate_in_list_types,
    validate_operation,
)


class TestGetValueType:
    @pytest.mark.parametrize(
        "value,expected",
        [
            (True, "bool"),
            (False, "bool"),
            (42, "int"),
            (3.14, "float"),
            ("hello", "string"),
            (None, ""),
            ([1, 2], ""),
        ],
    )
    def test_types(self, value, expected):
        assert get_value_type(value) == expected


class TestValidateOperation:
    def test_unknown_column_type_passes(self):
        validate_operation("any", None, Operator.EQUALS.value)
        validate_operation("any", Type.Unknown, Operator.EQUALS.value)

    def test_string_gt_int_forbidden(self):
        with pytest.raises(FlyqlError):
            validate_operation(5, Type.String, Operator.GREATER_THAN.value)

    def test_string_equals_int_allowed(self):
        validate_operation(5, Type.String, Operator.EQUALS.value)

    def test_int_regex_string_forbidden(self):
        with pytest.raises(FlyqlError):
            validate_operation("pattern", Type.Int, Operator.REGEX.value)

    def test_bool_gt_bool_forbidden(self):
        with pytest.raises(FlyqlError):
            validate_operation(True, Type.Bool, Operator.GREATER_THAN.value)

    def test_date_equals_string_allowed(self):
        validate_operation("2026-01-01", Type.Date, Operator.EQUALS.value)


class TestValidateInListTypes:
    def test_empty_list_ok(self):
        validate_in_list_types([], Type.String)

    def test_unknown_column_type_passes(self):
        validate_in_list_types(["a", 1, True], None)
        validate_in_list_types(["a", 1, True], Type.Unknown)

    def test_string_column_with_string_values(self):
        validate_in_list_types(["a", "b"], Type.String)

    def test_string_column_with_int_rejected(self):
        with pytest.raises(FlyqlError):
            validate_in_list_types(["a", 1], Type.String)

    def test_int_column_accepts_int_and_float(self):
        validate_in_list_types([1, 2.5], Type.Int)

    def test_int_column_rejects_string(self):
        with pytest.raises(FlyqlError):
            validate_in_list_types([1, "x"], Type.Int)

    def test_bool_column_accepts_int(self):
        validate_in_list_types([True, 1, False], Type.Bool)
