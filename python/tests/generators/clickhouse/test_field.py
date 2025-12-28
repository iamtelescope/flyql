import json
import pytest
from pathlib import Path

from flyql.generators.clickhouse.field import Field, normalize_clickhouse_type


TESTS_DATA_DIR = (
    Path(__file__).parent.parent.parent.parent.parent
    / "tests-data"
    / "generators"
    / "clickhouse"
)


def load_fields_data():
    fields_file = TESTS_DATA_DIR / "fields.json"
    with open(fields_file) as f:
        return json.load(f)


@pytest.fixture(scope="module")
def fields_data():
    return load_fields_data()


class TestFieldFromSharedData:

    def test_load_all_fields(self, fields_data):
        for name, fd in fields_data["fields"].items():
            field = Field(
                fd["name"], fd.get("jsonstring", False), fd["type"], fd.get("values")
            )
            assert field.name == fd["name"]
            assert field.jsonstring == fd.get("jsonstring", False)
            assert field.type == fd["type"]

    def test_string_field(self, fields_data):
        fd = fields_data["fields"]["message"]
        field = Field(
            fd["name"], fd.get("jsonstring", False), fd["type"], fd.get("values")
        )
        assert field.normalized_type == "string"
        assert field.is_map is False
        assert field.is_array is False
        assert field.is_json is False

    def test_int_field(self, fields_data):
        fd = fields_data["fields"]["count"]
        field = Field(
            fd["name"], fd.get("jsonstring", False), fd["type"], fd.get("values")
        )
        assert field.normalized_type == "int"

    def test_float_field(self, fields_data):
        fd = fields_data["fields"]["price"]
        field = Field(
            fd["name"], fd.get("jsonstring", False), fd["type"], fd.get("values")
        )
        assert field.normalized_type == "float"

    def test_bool_field(self, fields_data):
        fd = fields_data["fields"]["active"]
        field = Field(
            fd["name"], fd.get("jsonstring", False), fd["type"], fd.get("values")
        )
        assert field.normalized_type == "bool"

    def test_date_field(self, fields_data):
        fd = fields_data["fields"]["created_at"]
        field = Field(
            fd["name"], fd.get("jsonstring", False), fd["type"], fd.get("values")
        )
        assert field.normalized_type == "date"

    def test_jsonstring_field(self, fields_data):
        fd = fields_data["fields"]["json_field"]
        field = Field(
            fd["name"], fd.get("jsonstring", False), fd["type"], fd.get("values")
        )
        assert field.jsonstring is True

    def test_json_field(self, fields_data):
        fd = fields_data["fields"]["new_json"]
        field = Field(
            fd["name"], fd.get("jsonstring", False), fd["type"], fd.get("values")
        )
        assert field.normalized_type == "json"
        assert field.is_json is True

    def test_array_field(self, fields_data):
        fd = fields_data["fields"]["tags"]
        field = Field(
            fd["name"], fd.get("jsonstring", False), fd["type"], fd.get("values")
        )
        assert field.normalized_type == "array"
        assert field.is_array is True
        assert field.is_map is False

    def test_map_field(self, fields_data):
        fd = fields_data["fields"]["metadata"]
        field = Field(
            fd["name"], fd.get("jsonstring", False), fd["type"], fd.get("values")
        )
        assert field.normalized_type == "map"
        assert field.is_map is True
        assert field.is_array is False

    def test_enum_field_with_values(self, fields_data):
        fd = fields_data["fields"]["enum_field"]
        field = Field(
            fd["name"], fd.get("jsonstring", False), fd["type"], fd.get("values")
        )
        assert field.values == ["value1", "value2"]


class TestNormalizeClickhouseType:

    @pytest.mark.parametrize(
        "input_type,expected",
        [
            ("String", "string"),
            ("Nullable(String)", "string"),
            ("LowCardinality(String)", "string"),
            ("Int64", "int"),
            ("UInt32", "int"),
            ("Nullable(Int8)", "int"),
            ("Float64", "float"),
            ("Decimal(10,2)", "float"),
            ("Bool", "bool"),
            ("Date", "date"),
            ("DateTime64(3)", "date"),
            ("Array(String)", "array"),
            ("Map(String, Int64)", "map"),
            ("JSON", "json"),
            ("UnknownType", None),
        ],
    )
    def test_normalize_type(self, input_type, expected):
        result = normalize_clickhouse_type(input_type)
        assert result == expected
