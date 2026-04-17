import pytest
from flyql.core.parser import parse, Parser, ParserError
from flyql.errors_generated import ERR_MAX_DEPTH_EXCEEDED
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
    assert result.root.left.expression.key.segments == ["user-id"]
    assert result.root.left.expression.value == 123

    # Test multi-segment key with hyphens
    result = parse('data.user-identifier = "john-doe"')
    assert result.root.left.expression.key.segments == ["data", "user-identifier"]
    assert result.root.left.expression.value == "john-doe"


def _build_nested_query(depth: int) -> str:
    return "(" * depth + "a=1" + ")" * depth


@pytest.mark.parametrize("test_case", load_test_data("max_depth.json")["tests"])
def test_max_depth_fixture(test_case):
    if "literal_query" in test_case:
        query = test_case["literal_query"]
    else:
        prefix = test_case.get("query_prefix", "")
        suffix = test_case.get("query_suffix", "")
        query = prefix + _build_nested_query(test_case["depth"]) + suffix

    parser = Parser()
    cfg = test_case.get("parser_config")
    if cfg is not None and "max_depth" in cfg:
        parser.max_depth = cfg["max_depth"]

    parser.parse(query, raise_error=False)

    if test_case["expected_result"] == "error":
        assert parser.errno != 0, f"expected error for {test_case['name']}"
        expected = test_case.get("expected_error", {})
        if "errno" in expected:
            assert parser.errno == expected["errno"]
        if "message_contains" in expected:
            assert expected["message_contains"] in parser.error_text
        if "message_equals" in expected:
            assert parser.error_text == expected["message_equals"]
    else:
        assert (
            parser.errno == 0
        ), f"unexpected error for {test_case['name']}: {parser.error_text}"
        assert parser.root is not None


def test_default_max_depth_allows_128():
    parser = Parser()
    parser.parse(_build_nested_query(128))
    assert parser.root is not None


def test_default_max_depth_rejects_129():
    parser = Parser()
    with pytest.raises(ParserError) as exc_info:
        parser.parse(_build_nested_query(129))
    assert exc_info.value.errno == ERR_MAX_DEPTH_EXCEEDED
    assert "maximum nesting depth exceeded" in str(exc_info.value)


def test_default_max_depth_error_message_includes_limit():
    parser = Parser()
    with pytest.raises(ParserError) as exc_info:
        parser.parse(_build_nested_query(129))
    assert str(exc_info.value) == "maximum nesting depth exceeded (128)"


def test_zero_disables_limit():
    parser = Parser()
    parser.max_depth = 0
    parser.parse(_build_nested_query(500))
    assert parser.root is not None


def test_negative_max_depth_disables_limit():
    parser = Parser()
    parser.max_depth = -1
    parser.parse(_build_nested_query(500))
    assert parser.root is not None


def test_depth_zero_after_successful_parse():
    parser = Parser()
    parser.parse("(a=1)")
    assert parser._depth == 0


def test_depth_reset_at_top_of_parse_after_error():
    # Python's Parser.parse() does not reset instance state broadly (pre-existing
    # hazard documented in the spec). The second parse on an error-state parser
    # short-circuits on the first iteration — but the top-of-parse `_depth = 0`
    # still runs, which is all this test verifies.
    parser = Parser()
    parser.parse("(((", raise_error=False)
    assert parser.errno != 0
    parser.parse("(a=1)", raise_error=False)
    assert parser._depth == 0


def test_max_depth_error_surfaces_without_raise():
    parser = Parser()
    parser.parse(_build_nested_query(129), raise_error=False)
    assert parser.errno == ERR_MAX_DEPTH_EXCEEDED
    assert "maximum nesting depth exceeded" in parser.error_text


def test_syntax_error_takes_precedence_over_depth():
    # `==` is a syntax error at char index 3 (position-wise, before enough
    # `(` chars to exceed max_depth=2). Parsing stops on the first error
    # encountered, so the depth error never fires even though the query
    # contains 9 `(` chars that would blow past the limit.
    parser = Parser()
    parser.max_depth = 2
    parser.parse("(a== (((((((((", raise_error=False)
    assert parser.errno != 0
    assert parser.errno != ERR_MAX_DEPTH_EXCEEDED
