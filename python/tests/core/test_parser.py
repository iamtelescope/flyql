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


@pytest.mark.parametrize("test_case", load_test_data("truthy.json")["tests"])
def test_truthy_parsing(test_case):
    run_test_case(test_case)


@pytest.mark.parametrize("test_case", load_test_data("not.json")["tests"])
def test_not_parsing(test_case):
    run_test_case(test_case)


@pytest.mark.parametrize("test_case", load_test_data("int64.json")["tests"])
def test_int64_parsing(test_case):
    run_test_case(test_case)


@pytest.mark.parametrize("test_case", load_test_data("has.json")["tests"])
def test_has_parsing(test_case):
    run_test_case(test_case)


@pytest.mark.parametrize(
    "test_case", load_test_data("escaped_quotes_in_values.json")["tests"]
)
def test_escaped_quotes_in_values_parsing(test_case):
    run_test_case(test_case)


@pytest.mark.parametrize("test_case", load_test_data("types.json")["tests"])
def test_types_parsing(test_case):
    run_test_case(test_case)


@pytest.mark.parametrize("test_case", load_test_data("like.json")["tests"])
def test_like_parsing(test_case):
    run_test_case(test_case)


@pytest.mark.parametrize("test_case", load_test_data("null_errors.json")["tests"])
def test_null_errors_parsing(test_case):
    run_test_case(test_case)


@pytest.mark.parametrize("test_case", load_test_data("functions.json")["tests"])
def test_functions_parsing(test_case):
    run_test_case(test_case)


@pytest.mark.parametrize("test_case", load_test_data("parameters.json")["tests"])
def test_parameters_parsing(test_case):
    run_test_case(test_case)


@pytest.mark.parametrize("test_case", load_test_data("precedence.json")["tests"])
def test_precedence_parsing(test_case):
    run_test_case(test_case)


@pytest.mark.parametrize("test_case", load_test_data("precedence.json")["tests"])
def test_precedence_raw_ast_shape(test_case):
    """Assert precedence.json cases pass on RAW ast_to_dict (no normalization).
    Guards against the normalization helper masking parser bugs."""
    result = parse(test_case["input"])
    actual_raw = ast_to_dict(result.root)
    expected_ast = test_case["expected_ast"]
    assert actual_raw == expected_ast, format_ast_mismatch_message(
        test_case["name"], test_case["input"], expected_ast, actual_raw
    )


@pytest.mark.parametrize("test_case", load_test_data("precedence.json")["tests"])
def test_normalize_idempotent_on_canonical_trees(test_case):
    """normalize_ast_for_comparison must be a byte-for-byte no-op on
    canonical precedence-correct parser output. If this fails, either the
    parser produces non-canonical trees (bug in Task 2) or the helper
    flattens/reshapes more than it should (bug in Task 4 audit)."""
    result = parse(test_case["input"])
    raw = ast_to_dict(result.root)
    normalized = normalize_ast_for_comparison(raw)
    assert normalized == raw, (
        f"normalize_ast_for_comparison is not idempotent on "
        f"{test_case['name']}\nraw: {raw}\nnorm: {normalized}"
    )


def test_unquoted_hyphen_keys():
    """Test that unquoted keys with hyphens are parsed correctly"""
    # Test simple hyphenated key
    result = parse("user-id = 123")
    assert result.errno == 0
    assert result.root.left.expression.key.segments == ["user-id"]
    assert result.root.left.expression.value == 123

    # Test multi-segment key with hyphens
    result = parse('data.user-identifier = "john-doe"')
    assert result.errno == 0
    assert result.root.left.expression.key.segments == ["data", "user-identifier"]
    assert result.root.left.expression.value == "john-doe"
