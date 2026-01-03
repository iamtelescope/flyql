import pytest
from flyql.columns import parse, ParserError
from .helpers import (
    load_test_data,
    compare_columns,
    format_column_mismatch_message,
)


def run_test_case(test_case):
    if test_case["expected_result"] == "error":
        with pytest.raises(ParserError) as exc_info:
            parse(test_case["input"])

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
        result = parse(test_case["input"])
        expected = test_case["expected_columns"]
        assert compare_columns(result, expected), format_column_mismatch_message(
            test_case["name"], test_case["input"], expected, result
        )


@pytest.mark.parametrize("test_case", load_test_data("basic.json")["tests"])
def test_basic_parsing(test_case):
    run_test_case(test_case)


@pytest.mark.parametrize("test_case", load_test_data("modifiers.json")["tests"])
def test_modifiers_parsing(test_case):
    run_test_case(test_case)


@pytest.mark.parametrize("test_case", load_test_data("errors.json")["tests"])
def test_errors(test_case):
    run_test_case(test_case)
