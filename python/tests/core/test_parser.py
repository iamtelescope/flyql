import pytest
from flyql.core.parser import parse, ParserError
from .helpers import (
    load_test_data,
    ast_to_dict,
    compare_ast,
    format_ast_mismatch_message,
    normalize_ast_for_comparison,
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
            if "message_contains" in expected_error:
                assert expected_error["message_contains"] in str(exc_info.value), (
                    f"Expected message to contain '{expected_error['message_contains']}', "
                    f"got '{str(exc_info.value)}'"
                )
    else:
        result = parse(test_case["input"])
        actual_ast = normalize_ast_for_comparison(ast_to_dict(result.root))
        expected_ast = test_case["expected_ast"]

        assert compare_ast(actual_ast, expected_ast), format_ast_mismatch_message(
            test_case["name"], test_case["input"], expected_ast, actual_ast
        )


@pytest.mark.parametrize("test_case", load_test_data("basic.json")["tests"])
def test_basic_parsing(test_case):
    run_test_case(test_case)


@pytest.mark.parametrize("test_case", load_test_data("boolean.json")["tests"])
def test_boolean_parsing(test_case):
    run_test_case(test_case)


@pytest.mark.parametrize("test_case", load_test_data("complex.json")["tests"])
def test_complex_parsing(test_case):
    run_test_case(test_case)


@pytest.mark.parametrize("test_case", load_test_data("syntax.json")["tests"])
def test_syntax_parsing(test_case):
    run_test_case(test_case)


@pytest.mark.parametrize("test_case", load_test_data("whitespace.json")["tests"])
def test_whitespace_parsing(test_case):
    run_test_case(test_case)


@pytest.mark.parametrize("test_case", load_test_data("errors.json")["tests"])
def test_errors_parsing(test_case):
    run_test_case(test_case)


@pytest.mark.parametrize("test_case", load_test_data("quoted_keys.json")["tests"])
def test_quoted_keys_parsing(test_case):
    run_test_case(test_case)


def test_unquoted_hyphen_keys():
    """Test that unquoted keys with hyphens are parsed correctly"""
    # Test simple hyphenated key
    result = parse("user-id = 123")
    assert result.errno == 0
    assert result.root.left.expression.key.segments == ["user-id"]
    assert result.root.left.expression.value == 123

    # Test multi-segment key with hyphens
    result = parse('data:user-identifier = "john-doe"')
    assert result.errno == 0
    assert result.root.left.expression.key.segments == ["data", "user-identifier"]
    assert result.root.left.expression.value == "john-doe"
