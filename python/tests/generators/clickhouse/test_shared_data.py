import json
import pytest
from pathlib import Path

from flyql.core.parser import parse
from flyql.generators.clickhouse.field import Field
from flyql.generators.clickhouse.generator import to_sql


TESTS_DATA_DIR = (
    Path(__file__).parent.parent.parent.parent.parent
    / "tests-data"
    / "generators"
    / "clickhouse"
)


def load_fields():
    fields_file = TESTS_DATA_DIR / "fields.json"
    with open(fields_file) as f:
        data = json.load(f)

    fields = {}
    for name, fd in data["fields"].items():
        fields[name] = Field(
            fd["name"], fd.get("jsonstring", False), fd["type"], fd.get("values")
        )
    return fields


def load_test_file(filename):
    test_file = TESTS_DATA_DIR / filename
    with open(test_file) as f:
        return json.load(f)


@pytest.fixture(scope="module")
def fields():
    return load_fields()


def generate_test_cases(filename):
    tf = load_test_file(filename)
    for tc in tf["tests"]:
        yield pytest.param(
            tc["input"],
            tc["expected_result"],
            tc.get("expected_sql"),
            tc.get("expected_sql_contains"),
            tc.get("expected_error_contains"),
            id=tc["name"],
        )


class TestBasic:
    @pytest.mark.parametrize(
        "input_query,expected_result,expected_sql,expected_sql_contains,expected_error_contains",
        list(generate_test_cases("basic.json")),
    )
    def test_basic(
        self,
        fields,
        input_query,
        expected_result,
        expected_sql,
        expected_sql_contains,
        expected_error_contains,
    ):
        result = parse(input_query)

        if expected_result == "error":
            with pytest.raises(Exception) as exc_info:
                to_sql(result.root, fields)
            if expected_error_contains:
                assert expected_error_contains in str(exc_info.value)
            return

        sql = to_sql(result.root, fields)

        if expected_sql:
            assert (
                sql == expected_sql
            ), f"SQL mismatch: got {sql!r}, want {expected_sql!r}"

        if expected_sql_contains:
            for substr in expected_sql_contains:
                assert substr in sql, f"SQL {sql!r} does not contain {substr!r}"


class TestBoolean:
    @pytest.mark.parametrize(
        "input_query,expected_result,expected_sql,expected_sql_contains,expected_error_contains",
        list(generate_test_cases("boolean.json")),
    )
    def test_boolean(
        self,
        fields,
        input_query,
        expected_result,
        expected_sql,
        expected_sql_contains,
        expected_error_contains,
    ):
        result = parse(input_query)

        if expected_result == "error":
            with pytest.raises(Exception) as exc_info:
                to_sql(result.root, fields)
            if expected_error_contains:
                assert expected_error_contains in str(exc_info.value)
            return

        sql = to_sql(result.root, fields)

        if expected_sql:
            assert (
                sql == expected_sql
            ), f"SQL mismatch: got {sql!r}, want {expected_sql!r}"

        if expected_sql_contains:
            for substr in expected_sql_contains:
                assert substr in sql, f"SQL {sql!r} does not contain {substr!r}"


class TestJSONFields:
    @pytest.mark.parametrize(
        "input_query,expected_result,expected_sql,expected_sql_contains,expected_error_contains",
        list(generate_test_cases("json_fields.json")),
    )
    def test_json_fields(
        self,
        fields,
        input_query,
        expected_result,
        expected_sql,
        expected_sql_contains,
        expected_error_contains,
    ):
        result = parse(input_query)

        if expected_result == "error":
            with pytest.raises(Exception) as exc_info:
                to_sql(result.root, fields)
            if expected_error_contains:
                assert expected_error_contains in str(exc_info.value)
            return

        sql = to_sql(result.root, fields)

        if expected_sql:
            assert (
                sql == expected_sql
            ), f"SQL mismatch: got {sql!r}, want {expected_sql!r}"

        if expected_sql_contains:
            for substr in expected_sql_contains:
                assert substr in sql, f"SQL {sql!r} does not contain {substr!r}"


class TestMapArray:
    @pytest.mark.parametrize(
        "input_query,expected_result,expected_sql,expected_sql_contains,expected_error_contains",
        list(generate_test_cases("map_array.json")),
    )
    def test_map_array(
        self,
        fields,
        input_query,
        expected_result,
        expected_sql,
        expected_sql_contains,
        expected_error_contains,
    ):
        result = parse(input_query)

        if expected_result == "error":
            with pytest.raises(Exception) as exc_info:
                to_sql(result.root, fields)
            if expected_error_contains:
                assert expected_error_contains in str(exc_info.value)
            return

        sql = to_sql(result.root, fields)

        if expected_sql:
            assert (
                sql == expected_sql
            ), f"SQL mismatch: got {sql!r}, want {expected_sql!r}"

        if expected_sql_contains:
            for substr in expected_sql_contains:
                assert substr in sql, f"SQL {sql!r} does not contain {substr!r}"


class TestErrors:
    @pytest.mark.parametrize(
        "input_query,expected_result,expected_sql,expected_sql_contains,expected_error_contains",
        list(generate_test_cases("errors.json")),
    )
    def test_errors(
        self,
        fields,
        input_query,
        expected_result,
        expected_sql,
        expected_sql_contains,
        expected_error_contains,
    ):
        try:
            result = parse(input_query)
        except Exception as e:
            if expected_result == "error":
                if expected_error_contains:
                    assert expected_error_contains in str(
                        e
                    ), f"Error {str(e)!r} does not contain {expected_error_contains!r}"
                return
            raise

        if expected_result == "error":
            with pytest.raises(Exception) as exc_info:
                to_sql(result.root, fields)
            if expected_error_contains:
                assert expected_error_contains in str(
                    exc_info.value
                ), f"Error {str(exc_info.value)!r} does not contain {expected_error_contains!r}"
            return

        sql = to_sql(result.root, fields)

        if expected_sql:
            assert (
                sql == expected_sql
            ), f"SQL mismatch: got {sql!r}, want {expected_sql!r}"


class TestTruthy:
    @pytest.mark.parametrize(
        "input_query,expected_result,expected_sql,expected_sql_contains,expected_error_contains",
        list(generate_test_cases("truthy.json")),
    )
    def test_truthy(
        self,
        fields,
        input_query,
        expected_result,
        expected_sql,
        expected_sql_contains,
        expected_error_contains,
    ):
        result = parse(input_query)

        if expected_result == "error":
            with pytest.raises(Exception) as exc_info:
                to_sql(result.root, fields)
            if expected_error_contains:
                assert expected_error_contains in str(exc_info.value)
            return

        sql = to_sql(result.root, fields)

        if expected_sql:
            assert (
                sql == expected_sql
            ), f"SQL mismatch: got {sql!r}, want {expected_sql!r}"

        if expected_sql_contains:
            for substr in expected_sql_contains:
                assert substr in sql, f"SQL {sql!r} does not contain {substr!r}"


class TestNot:
    @pytest.mark.parametrize(
        "input_query,expected_result,expected_sql,expected_sql_contains,expected_error_contains",
        list(generate_test_cases("not.json")),
    )
    def test_not(
        self,
        fields,
        input_query,
        expected_result,
        expected_sql,
        expected_sql_contains,
        expected_error_contains,
    ):
        result = parse(input_query)

        if expected_result == "error":
            with pytest.raises(Exception) as exc_info:
                to_sql(result.root, fields)
            if expected_error_contains:
                assert expected_error_contains in str(exc_info.value)
            return

        sql = to_sql(result.root, fields)

        if expected_sql:
            assert (
                sql == expected_sql
            ), f"SQL mismatch: got {sql!r}, want {expected_sql!r}"

        if expected_sql_contains:
            for substr in expected_sql_contains:
                assert substr in sql, f"SQL {sql!r} does not contain {substr!r}"
