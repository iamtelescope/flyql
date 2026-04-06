import pytest

from flyql.types import ValueType


class TestValueType:
    @pytest.mark.parametrize(
        "member, expected_value",
        [
            (ValueType.INTEGER, "integer"),
            (ValueType.BIGINT, "bigint"),
            (ValueType.FLOAT, "float"),
            (ValueType.STRING, "string"),
            (ValueType.BOOLEAN, "boolean"),
            (ValueType.NULL, "null"),
            (ValueType.ARRAY, "array"),
            (ValueType.COLUMN, "column"),
        ],
    )
    def test_value_type_values(self, member: ValueType, expected_value: str) -> None:
        assert member.value == expected_value

    def test_value_type_count(self) -> None:
        assert len(ValueType) == 8

    @pytest.mark.parametrize(
        "member, expected_value",
        [
            (ValueType.INTEGER, "integer"),
            (ValueType.BIGINT, "bigint"),
            (ValueType.FLOAT, "float"),
            (ValueType.STRING, "string"),
            (ValueType.BOOLEAN, "boolean"),
            (ValueType.NULL, "null"),
            (ValueType.ARRAY, "array"),
            (ValueType.COLUMN, "column"),
        ],
    )
    def test_value_type_string_comparison(
        self, member: ValueType, expected_value: str
    ) -> None:
        assert member == expected_value

    def test_value_type_is_str_enum(self) -> None:
        assert issubclass(ValueType, str)

    def test_import_from_package(self) -> None:
        from flyql import ValueType as VT

        assert VT is ValueType
