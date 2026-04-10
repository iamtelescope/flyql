import pytest

from flyql.literal import LiteralKind


class TestLiteralKind:
    @pytest.mark.parametrize(
        "member, expected_value",
        [
            (LiteralKind.INTEGER, "integer"),
            (LiteralKind.BIGINT, "bigint"),
            (LiteralKind.FLOAT, "float"),
            (LiteralKind.STRING, "string"),
            (LiteralKind.BOOLEAN, "boolean"),
            (LiteralKind.NULL, "null"),
            (LiteralKind.ARRAY, "array"),
            (LiteralKind.COLUMN, "column"),
            (LiteralKind.FUNCTION, "function"),
            (LiteralKind.PARAMETER, "parameter"),
        ],
    )
    def test_literal_kind_values(
        self, member: LiteralKind, expected_value: str
    ) -> None:
        assert member.value == expected_value

    def test_literal_kind_count(self) -> None:
        assert len(LiteralKind) == 10

    @pytest.mark.parametrize(
        "member, expected_value",
        [
            (LiteralKind.INTEGER, "integer"),
            (LiteralKind.BIGINT, "bigint"),
            (LiteralKind.FLOAT, "float"),
            (LiteralKind.STRING, "string"),
            (LiteralKind.BOOLEAN, "boolean"),
            (LiteralKind.NULL, "null"),
            (LiteralKind.ARRAY, "array"),
            (LiteralKind.COLUMN, "column"),
        ],
    )
    def test_literal_kind_string_comparison(
        self, member: LiteralKind, expected_value: str
    ) -> None:
        assert member == expected_value

    def test_literal_kind_is_str_enum(self) -> None:
        assert issubclass(LiteralKind, str)

    def test_import_from_package(self) -> None:
        from flyql import LiteralKind as VT

        assert VT is LiteralKind
