import json
import pytest
from pathlib import Path

from flyql.generators.clickhouse.column import Column, normalize_clickhouse_type


TESTS_DATA_DIR = (
    Path(__file__).parent.parent.parent.parent.parent
    / "tests-data"
    / "generators"
    / "clickhouse"
)


def load_columns_data():
    columns_file = TESTS_DATA_DIR / "columns.json"
    with open(columns_file) as f:
        return json.load(f)


@pytest.fixture(scope="module")
def columns_data():
    return load_columns_data()


class TestColumnFromSharedData:

    def test_load_all_columns(self, columns_data):
        for name, fd in columns_data["columns"].items():
            column = Column(
                fd["name"], fd.get("jsonstring", False), fd["type"], fd.get("values")
            )
            assert column.name == fd["name"]
            assert column.jsonstring == fd.get("jsonstring", False)
            assert column.type == fd["type"]

    def test_string_column(self, columns_data):
        fd = columns_data["columns"]["message"]
        column = Column(
            fd["name"], fd.get("jsonstring", False), fd["type"], fd.get("values")
        )
        assert column.normalized_type == "string"
        assert column.is_map is False
        assert column.is_array is False
        assert column.is_json is False

    def test_int_column(self, columns_data):
        fd = columns_data["columns"]["count"]
        column = Column(
            fd["name"], fd.get("jsonstring", False), fd["type"], fd.get("values")
        )
        assert column.normalized_type == "int"

    def test_float_column(self, columns_data):
        fd = columns_data["columns"]["price"]
        column = Column(
            fd["name"], fd.get("jsonstring", False), fd["type"], fd.get("values")
        )
        assert column.normalized_type == "float"

    def test_bool_column(self, columns_data):
        fd = columns_data["columns"]["active"]
        column = Column(
            fd["name"], fd.get("jsonstring", False), fd["type"], fd.get("values")
        )
        assert column.normalized_type == "bool"

    def test_date_column(self, columns_data):
        fd = columns_data["columns"]["created_at"]
        column = Column(
            fd["name"], fd.get("jsonstring", False), fd["type"], fd.get("values")
        )
        assert column.normalized_type == "date"

    def test_jsonstring_column(self, columns_data):
        fd = columns_data["columns"]["json_column"]
        column = Column(
            fd["name"], fd.get("jsonstring", False), fd["type"], fd.get("values")
        )
        assert column.jsonstring is True

    def test_json_column(self, columns_data):
        fd = columns_data["columns"]["new_json"]
        column = Column(
            fd["name"], fd.get("jsonstring", False), fd["type"], fd.get("values")
        )
        assert column.normalized_type == "json"
        assert column.is_json is True

    def test_array_column(self, columns_data):
        fd = columns_data["columns"]["tags"]
        column = Column(
            fd["name"], fd.get("jsonstring", False), fd["type"], fd.get("values")
        )
        assert column.normalized_type == "array"
        assert column.is_array is True
        assert column.is_map is False

    def test_map_column(self, columns_data):
        fd = columns_data["columns"]["metadata"]
        column = Column(
            fd["name"], fd.get("jsonstring", False), fd["type"], fd.get("values")
        )
        assert column.normalized_type == "map"
        assert column.is_map is True
        assert column.is_array is False

    def test_enum_column_with_values(self, columns_data):
        fd = columns_data["columns"]["enum_column"]
        column = Column(
            fd["name"], fd.get("jsonstring", False), fd["type"], fd.get("values")
        )
        assert column.values == ["value1", "value2"]


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
