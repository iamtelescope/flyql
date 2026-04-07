import pytest
from flyql.columns import parse, ParserError
from flyql.core.range import Range
from .helpers import (
    load_test_data,
    compare_columns,
    format_column_mismatch_message,
)


def run_test_case(test_case, suite_capabilities=None):
    tc_caps = test_case.get("capabilities")
    capabilities = tc_caps if tc_caps is not None else suite_capabilities
    if test_case["expected_result"] == "error":
        with pytest.raises(ParserError) as exc_info:
            parse(test_case["input"], capabilities=capabilities)

        if "expected_error" in test_case:
            expected_error = test_case["expected_error"]
            if "errno" in expected_error:
                assert (
                    exc_info.value.errno == expected_error["errno"]
                ), f"Expected errno {expected_error['errno']}, got {exc_info.value.errno}"
            if (
                "message_contains" in expected_error
                and expected_error["message_contains"]
            ):
                assert expected_error["message_contains"] in str(exc_info.value), (
                    f"Expected message to contain '{expected_error['message_contains']}', "
                    f"got '{str(exc_info.value)}'"
                )
    else:
        result = parse(test_case["input"], capabilities=capabilities)
        expected = test_case["expected_columns"]
        assert compare_columns(result, expected), format_column_mismatch_message(
            test_case["name"], test_case["input"], expected, result
        )


_basic_data = load_test_data("basic.json")
_transformers_data = load_test_data("transformers.json")
_errors_data = load_test_data("errors.json")


@pytest.mark.parametrize("test_case", _basic_data["tests"])
def test_basic_parsing(test_case):
    run_test_case(test_case, _basic_data.get("default_capabilities"))


@pytest.mark.parametrize("test_case", _transformers_data["tests"])
def test_transformers_parsing(test_case):
    run_test_case(test_case, _transformers_data.get("default_capabilities"))


@pytest.mark.parametrize("test_case", _errors_data["tests"])
def test_errors(test_case):
    run_test_case(test_case, _errors_data.get("default_capabilities"))


def test_single_column_name_range():
    result = parse("level", capabilities={"transformers": True})
    assert result[0].name_range == Range(0, 5)


def test_multiple_columns_name_ranges():
    result = parse("level, service", capabilities={"transformers": True})
    assert result[0].name_range == Range(0, 5)
    assert result[1].name_range == Range(7, 14)


def test_column_with_transformer_ranges():
    result = parse("level|upper", capabilities={"transformers": True})
    assert result[0].name_range == Range(0, 5)
    assert len(result[0].transformer_ranges) == 1
    assert result[0].transformer_ranges[0]["name_range"] == Range(6, 11)


def test_transformer_argument_ranges():
    result = parse('level|split(",")', capabilities={"transformers": True})
    assert result[0].transformer_ranges[0]["name_range"] == Range(6, 11)
    assert len(result[0].transformer_ranges[0]["argument_ranges"]) == 1
    assert result[0].transformer_ranges[0]["argument_ranges"][0] == Range(12, 15)


def test_chained_transformers_ranges():
    result = parse("level|upper|len", capabilities={"transformers": True})
    assert result[0].name_range == Range(0, 5)
    assert len(result[0].transformer_ranges) == 2
    assert result[0].transformer_ranges[0]["name_range"] == Range(6, 11)
    assert result[0].transformer_ranges[1]["name_range"] == Range(12, 15)


def test_column_with_alias_name_range():
    result = parse("level as lvl", capabilities={"transformers": True})
    assert result[0].name_range == Range(0, 5)
