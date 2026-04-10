import pytest

from flyql.flyql_type import Type
from flyql.generators.starrocks.column import Column, normalize_starrocks_type


@pytest.mark.parametrize(
    "input_type,expected",
    [
        ("String", Type.String),
        ("VARCHAR(255)", Type.String),
        ("CHAR(10)", Type.String),
        ("TINYINT", Type.Int),
        ("BIGINT(20)", Type.Int),
        ("Decimal(10,2)", Type.Float),
        ("Bool", Type.Bool),
        ("Boolean", Type.Bool),
        ("DateTime", Type.Date),
        ("Array<String>", Type.Array),
        ("Map<String, Int>", Type.Map),
        # SR catch-all "special" types collapse into Unknown.
        ("Bitmap", Type.Unknown),
        ("UnknownType", Type.Unknown),
        ("", Type.Unknown),
    ],
)
def test_normalize_starrocks_type(input_type: str, expected: Type) -> None:
    assert normalize_starrocks_type(input_type) == expected


class TestField:
    def test_field_creation_basic(self) -> None:
        field = Column("test_field", False, "String")
        assert field.name == "test_field"
        assert field.jsonstring is False
        assert field.raw_type == "String"
        assert field.values == []
        assert field.flyql_type == Type.String

    def test_field_creation_with_values(self) -> None:
        values = ["value1", "value2"]
        field = Column("enum_field", False, "Enum8", values)
        assert field.values == values

    def test_field_creation_map(self) -> None:
        field = Column("map_field", False, "Map<String, Int>")
        assert field.flyql_type == Type.Map

    def test_field_creation_array(self) -> None:
        field = Column("array_field", False, "Array<String>")
        assert field.flyql_type == Type.Array

    def test_field_creation_json_field(self) -> None:
        field = Column("json_field", True, "String")
        assert field.jsonstring is True
        assert field.flyql_type == Type.String

    def test_field_creation_int_types(self) -> None:
        for int_type in ["Int", "BIGINT", "tinyint", "SmallInt"]:
            field = Column("int_field", False, int_type)
            assert field.flyql_type == Type.Int

    def test_field_creation_float_types(self) -> None:
        for float_type in ["float", "Decimal(10,2)", "DOUBLE"]:
            field = Column("float_field", False, float_type)
            assert field.flyql_type == Type.Float

    def test_field_creation_json(self) -> None:
        field = Column("json_field", False, "JSON")
        assert field.flyql_type == Type.JSON

    def test_field_creation_json_with_params(self) -> None:
        field = Column("json_field", False, "JSON(a.b UInt32)")
        assert field.flyql_type == Type.JSON

    def test_field_values_empty_list(self) -> None:
        field = Column("test", False, "String", [])
        assert field.values == []

    def test_field_creation_unknown_type(self) -> None:
        field = Column("unknown_field", False, "SomeUnknownType")
        assert field.flyql_type == Type.Unknown
