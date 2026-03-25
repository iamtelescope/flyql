import pytest
from flyql.columns import parse, ParserError
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
_modifiers_data = load_test_data("modifiers.json")
_errors_data = load_test_data("errors.json")


@pytest.mark.parametrize("test_case", _basic_data["tests"])
def test_basic_parsing(test_case):
    run_test_case(test_case, _basic_data.get("default_capabilities"))


@pytest.mark.parametrize("test_case", _modifiers_data["tests"])
def test_modifiers_parsing(test_case):
    run_test_case(test_case, _modifiers_data.get("default_capabilities"))


@pytest.mark.parametrize("test_case", _errors_data["tests"])
def test_errors(test_case):
    run_test_case(test_case, _errors_data.get("default_capabilities"))
