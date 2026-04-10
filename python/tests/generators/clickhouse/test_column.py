import json
import pytest
from pathlib import Path

from flyql.flyql_type import Type
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


def _make(fd):
    return Column(fd["name"], fd.get("jsonstring", False), fd["type"], fd.get("values"))


class TestColumnFromSharedData:
    def test_load_all_columns(self, columns_data):
        for name, fd in columns_data["columns"].items():
            column = _make(fd)
            assert column.name == fd["name"]
            assert column.jsonstring == fd.get("jsonstring", False)
            assert column.raw_type == fd["type"]

    def test_string_column(self, columns_data):
        column = _make(columns_data["columns"]["message"])
        assert column.flyql_type == Type.String

    def test_int_column(self, columns_data):
        column = _make(columns_data["columns"]["count"])
        assert column.flyql_type == Type.Int

    def test_float_column(self, columns_data):
        column = _make(columns_data["columns"]["price"])
        assert column.flyql_type == Type.Float

    def test_bool_column(self, columns_data):
        column = _make(columns_data["columns"]["active"])
        assert column.flyql_type == Type.Bool

    def test_date_column(self, columns_data):
        column = _make(columns_data["columns"]["created_at"])
        assert column.flyql_type == Type.Date

    def test_jsonstring_column(self, columns_data):
        column = _make(columns_data["columns"]["json_column"])
        assert column.jsonstring is True

    def test_json_column(self, columns_data):
        column = _make(columns_data["columns"]["new_json"])
        assert column.flyql_type == Type.JSON

    def test_array_column(self, columns_data):
        column = _make(columns_data["columns"]["tags"])
        assert column.flyql_type == Type.Array

    def test_map_column(self, columns_data):
        column = _make(columns_data["columns"]["metadata"])
        assert column.flyql_type == Type.Map

    def test_enum_column_with_values(self, columns_data):
        column = _make(columns_data["columns"]["enum_column"])
        assert column.values == ["value1", "value2"]


class TestNormalizeClickhouseType:
    @pytest.mark.parametrize(
        "input_type,expected",
        [
            ("String", Type.String),
            ("Nullable(String)", Type.String),
            ("LowCardinality(String)", Type.String),
            ("Int64", Type.Int),
            ("UInt32", Type.Int),
            ("Nullable(Int8)", Type.Int),
            ("Float64", Type.Float),
            ("Decimal(10,2)", Type.Float),
            ("Bool", Type.Bool),
            ("Date", Type.Date),
            ("DateTime64(3)", Type.Date),
            ("Array(String)", Type.Array),
            ("Map(String, Int64)", Type.Map),
            ("JSON", Type.JSON),
            ("UnknownType", Type.Unknown),
        ],
    )
    def test_normalize_type(self, input_type, expected):
        assert normalize_clickhouse_type(input_type) == expected

    def test_wrapper_with_many_spaces(self):
        spaces = " " * 10000
        input_type = f"Nullable({spaces}String{spaces})"
        assert normalize_clickhouse_type(input_type) == Type.String

    def test_nested_wrapper(self):
        assert normalize_clickhouse_type("Nullable(DateTime64(3))") == Type.Date
