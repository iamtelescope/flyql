import json
import pytest
from pathlib import Path

from flyql.core.parser import parse
from flyql.generators.postgresql.column import Column
from flyql.generators.postgresql.generator import to_sql_where, to_sql_select

TESTS_DATA_DIR = (
    Path(__file__).parent.parent.parent.parent.parent
    / "tests-data"
    / "generators"
    / "postgresql"
)


def load_columns():
    columns_file = TESTS_DATA_DIR / "columns.json"
    with open(columns_file) as f:
        data = json.load(f)

    columns = {}
    for name, fd in data["columns"].items():
        col = Column(
            fd["name"],
            fd.get("jsonstring", False),
            fd["type"],
            fd.get("values"),
        )
        if fd.get("raw_identifier"):
            col.with_raw_identifier(fd["raw_identifier"])
        columns[name] = col
    return columns


def load_test_file(filename):
    test_file = TESTS_DATA_DIR / filename
    with open(test_file) as f:
        return json.load(f)


@pytest.fixture(scope="module")
def columns():
    return load_columns()


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


def to_sql_select_test_cases(filename):
    tf = load_test_file(filename)
    for tc in tf["tests"]:
        yield pytest.param(
            tc["input"],
            tc["expected_result"],
            tc.get("expected_sql"),
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
        columns,
        input_query,
        expected_result,
        expected_sql,
        expected_sql_contains,
        expected_error_contains,
    ):
        result = parse(input_query)
        if expected_result == "error":
            with pytest.raises(Exception) as exc_info:
                to_sql_where(result.root, columns)
            if expected_error_contains:
                assert expected_error_contains in str(exc_info.value)
            return
        sql = to_sql_where(result.root, columns)
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
        columns,
        input_query,
        expected_result,
        expected_sql,
        expected_sql_contains,
        expected_error_contains,
    ):
        result = parse(input_query)
        if expected_result == "error":
            with pytest.raises(Exception) as exc_info:
                to_sql_where(result.root, columns)
            if expected_error_contains:
                assert expected_error_contains in str(exc_info.value)
            return
        sql = to_sql_where(result.root, columns)
        if expected_sql:
            assert (
                sql == expected_sql
            ), f"SQL mismatch: got {sql!r}, want {expected_sql!r}"
        if expected_sql_contains:
            for substr in expected_sql_contains:
                assert substr in sql, f"SQL {sql!r} does not contain {substr!r}"


class TestJsonColumns:
    @pytest.mark.parametrize(
        "input_query,expected_result,expected_sql,expected_sql_contains,expected_error_contains",
        list(generate_test_cases("json_columns.json")),
    )
    def test_json_columns(
        self,
        columns,
        input_query,
        expected_result,
        expected_sql,
        expected_sql_contains,
        expected_error_contains,
    ):
        result = parse(input_query)
        if expected_result == "error":
            with pytest.raises(Exception) as exc_info:
                to_sql_where(result.root, columns)
            if expected_error_contains:
                assert expected_error_contains in str(exc_info.value)
            return
        sql = to_sql_where(result.root, columns)
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
        columns,
        input_query,
        expected_result,
        expected_sql,
        expected_sql_contains,
        expected_error_contains,
    ):
        result = parse(input_query)
        if expected_result == "error":
            with pytest.raises(Exception) as exc_info:
                to_sql_where(result.root, columns)
            if expected_error_contains:
                assert expected_error_contains in str(exc_info.value)
            return
        sql = to_sql_where(result.root, columns)
        if expected_sql:
            assert (
                sql == expected_sql
            ), f"SQL mismatch: got {sql!r}, want {expected_sql!r}"
        if expected_sql_contains:
            for substr in expected_sql_contains:
                assert substr in sql, f"SQL {sql!r} does not contain {substr!r}"


class TestHas:
    @pytest.mark.parametrize(
        "input_query,expected_result,expected_sql,expected_sql_contains,expected_error_contains",
        list(generate_test_cases("has.json")),
    )
    def test_has(
        self,
        columns,
        input_query,
        expected_result,
        expected_sql,
        expected_sql_contains,
        expected_error_contains,
    ):
        result = parse(input_query)
        if expected_result == "error":
            with pytest.raises(Exception) as exc_info:
                to_sql_where(result.root, columns)
            if expected_error_contains:
                assert expected_error_contains in str(exc_info.value)
            return
        sql = to_sql_where(result.root, columns)
        if expected_sql:
            assert (
                sql == expected_sql
            ), f"SQL mismatch: got {sql!r}, want {expected_sql!r}"
        if expected_sql_contains:
            for substr in expected_sql_contains:
                assert substr in sql, f"SQL {sql!r} does not contain {substr!r}"


class TestIn:
    @pytest.mark.parametrize(
        "input_query,expected_result,expected_sql,expected_sql_contains,expected_error_contains",
        list(generate_test_cases("in.json")),
    )
    def test_in(
        self,
        columns,
        input_query,
        expected_result,
        expected_sql,
        expected_sql_contains,
        expected_error_contains,
    ):
        result = parse(input_query)
        if expected_result == "error":
            with pytest.raises(Exception) as exc_info:
                to_sql_where(result.root, columns)
            if expected_error_contains:
                assert expected_error_contains in str(exc_info.value)
            return
        sql = to_sql_where(result.root, columns)
        if expected_sql:
            assert (
                sql == expected_sql
            ), f"SQL mismatch: got {sql!r}, want {expected_sql!r}"
        if expected_sql_contains:
            for substr in expected_sql_contains:
                assert substr in sql, f"SQL {sql!r} does not contain {substr!r}"


class TestTruthy:
    @pytest.mark.parametrize(
        "input_query,expected_result,expected_sql,expected_sql_contains,expected_error_contains",
        list(generate_test_cases("truthy.json")),
    )
    def test_truthy(
        self,
        columns,
        input_query,
        expected_result,
        expected_sql,
        expected_sql_contains,
        expected_error_contains,
    ):
        result = parse(input_query)
        if expected_result == "error":
            with pytest.raises(Exception) as exc_info:
                to_sql_where(result.root, columns)
            if expected_error_contains:
                assert expected_error_contains in str(exc_info.value)
            return
        sql = to_sql_where(result.root, columns)
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
        columns,
        input_query,
        expected_result,
        expected_sql,
        expected_sql_contains,
        expected_error_contains,
    ):
        result = parse(input_query)
        if expected_result == "error":
            with pytest.raises(Exception) as exc_info:
                to_sql_where(result.root, columns)
            if expected_error_contains:
                assert expected_error_contains in str(exc_info.value)
            return
        sql = to_sql_where(result.root, columns)
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
        columns,
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
                    assert expected_error_contains in str(e)
                return
            raise
        if expected_result == "error":
            with pytest.raises(Exception) as exc_info:
                to_sql_where(result.root, columns)
            if expected_error_contains:
                assert expected_error_contains in str(exc_info.value)
            return
        sql = to_sql_where(result.root, columns)
        if expected_sql:
            assert (
                sql == expected_sql
            ), f"SQL mismatch: got {sql!r}, want {expected_sql!r}"
        if expected_sql_contains:
            for substr in expected_sql_contains:
                assert substr in sql, f"SQL {sql!r} does not contain {substr!r}"


class TestSelectBasic:
    @pytest.mark.parametrize(
        "input_text,expected_result,expected_sql,expected_error_contains",
        list(to_sql_select_test_cases("select_basic.json")),
    )
    def test_select_basic(
        self,
        columns,
        input_text,
        expected_result,
        expected_sql,
        expected_error_contains,
    ):
        if expected_result == "error":
            with pytest.raises(Exception) as exc_info:
                to_sql_select(input_text, columns)
            if expected_error_contains:
                for substr in expected_error_contains:
                    assert substr.lower() in str(exc_info.value).lower()
            return
        result = to_sql_select(input_text, columns)
        if expected_sql:
            assert (
                result.sql == expected_sql
            ), f"SQL mismatch: got {result.sql!r}, want {expected_sql!r}"


class TestSelectComposite:
    @pytest.mark.parametrize(
        "input_text,expected_result,expected_sql,expected_error_contains",
        list(to_sql_select_test_cases("select_composite.json")),
    )
    def test_select_composite(
        self,
        columns,
        input_text,
        expected_result,
        expected_sql,
        expected_error_contains,
    ):
        if expected_result == "error":
            with pytest.raises(Exception) as exc_info:
                to_sql_select(input_text, columns)
            if expected_error_contains:
                for substr in expected_error_contains:
                    assert substr.lower() in str(exc_info.value).lower()
            return
        result = to_sql_select(input_text, columns)
        if expected_sql:
            assert (
                result.sql == expected_sql
            ), f"SQL mismatch: got {result.sql!r}, want {expected_sql!r}"


class TestSelectErrors:
    @pytest.mark.parametrize(
        "input_text,expected_result,expected_sql,expected_error_contains",
        list(to_sql_select_test_cases("select_errors.json")),
    )
    def test_select_errors(
        self,
        columns,
        input_text,
        expected_result,
        expected_sql,
        expected_error_contains,
    ):
        if expected_result == "error":
            with pytest.raises(Exception) as exc_info:
                to_sql_select(input_text, columns)
            if expected_error_contains:
                for substr in expected_error_contains:
                    assert substr.lower() in str(exc_info.value).lower()
            return
        result = to_sql_select(input_text, columns)
        if expected_sql:
            assert (
                result.sql == expected_sql
            ), f"SQL mismatch: got {result.sql!r}, want {expected_sql!r}"


class TestTransformers:
    @pytest.mark.parametrize(
        "input_query,expected_result,expected_sql,expected_sql_contains,expected_error_contains",
        list(generate_test_cases("transformers.json")),
    )
    def test_transformers(
        self,
        columns,
        input_query,
        expected_result,
        expected_sql,
        expected_sql_contains,
        expected_error_contains,
    ):
        result = parse(input_query)

        if expected_result == "error":
            with pytest.raises(Exception) as exc_info:
                to_sql_where(result.root, columns)
            if expected_error_contains:
                assert expected_error_contains in str(exc_info.value)
            return

        sql = to_sql_where(result.root, columns)

        if expected_sql:
            assert (
                sql == expected_sql
            ), f"SQL mismatch: got {sql!r}, want {expected_sql!r}"

        if expected_sql_contains:
            for substr in expected_sql_contains:
                assert substr in sql, f"SQL {sql!r} does not contain {substr!r}"


class TestLike:
    @pytest.mark.parametrize(
        "input_query,expected_result,expected_sql,expected_sql_contains,expected_error_contains",
        list(generate_test_cases("like.json")),
    )
    def test_like(
        self,
        columns,
        input_query,
        expected_result,
        expected_sql,
        expected_sql_contains,
        expected_error_contains,
    ):
        result = parse(input_query)
        if expected_result == "error":
            with pytest.raises(Exception) as exc_info:
                to_sql_where(result.root, columns)
            if expected_error_contains:
                assert expected_error_contains in str(exc_info.value)
            return
        sql = to_sql_where(result.root, columns)
        if expected_sql:
            assert (
                sql == expected_sql
            ), f"SQL mismatch: got {sql!r}, want {expected_sql!r}"
        if expected_sql_contains:
            for substr in expected_sql_contains:
                assert substr in sql, f"SQL {sql!r} does not contain {substr!r}"


class TestTypes:
    @pytest.mark.parametrize(
        "input_query,expected_result,expected_sql,expected_sql_contains,expected_error_contains",
        list(generate_test_cases("types.json")),
    )
    def test_types(
        self,
        columns,
        input_query,
        expected_result,
        expected_sql,
        expected_sql_contains,
        expected_error_contains,
    ):
        result = parse(input_query)

        if expected_result == "error":
            with pytest.raises(Exception) as exc_info:
                to_sql_where(result.root, columns)
            if expected_error_contains:
                assert expected_error_contains in str(exc_info.value)
            return

        sql = to_sql_where(result.root, columns)

        if expected_sql:
            assert (
                sql == expected_sql
            ), f"SQL mismatch: got {sql!r}, want {expected_sql!r}"


class TestColumnRef:
    @pytest.mark.parametrize(
        "input_query,expected_result,expected_sql,expected_sql_contains,expected_error_contains",
        list(generate_test_cases("column_ref.json")),
    )
    def test_column_ref(
        self,
        columns,
        input_query,
        expected_result,
        expected_sql,
        expected_sql_contains,
        expected_error_contains,
    ):
        result = parse(input_query)

        if expected_result == "error":
            with pytest.raises(Exception) as exc_info:
                to_sql_where(result.root, columns)
            if expected_error_contains:
                assert expected_error_contains in str(exc_info.value)
            return

        sql = to_sql_where(result.root, columns)

        if expected_sql:
            assert (
                sql == expected_sql
            ), f"SQL mismatch: got {sql!r}, want {expected_sql!r}"

        if expected_sql_contains:
            if isinstance(expected_sql_contains, str):
                assert (
                    expected_sql_contains in sql
                ), f"SQL {sql!r} does not contain {expected_sql_contains!r}"
            else:
                for substr in expected_sql_contains:
                    assert substr in sql, f"SQL {sql!r} does not contain {substr!r}"
