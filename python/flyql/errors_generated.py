"""Code generated from errors/registry.json — DO NOT EDIT.
Run `make generate-errors` at the repo root to regenerate.
Source: errors/registry.json"""

from __future__ import annotations

# core_parser errnos (int)
ERR_INVALID_CHAR_INITIAL = 1
ERR_INVALID_CHAR_IN_VALUE = 2
ERR_INVALID_CHAR_IN_KEY = 3
ERR_INVALID_CHAR_IN_KEY_VALUE_OPERATOR = 4
ERR_INVALID_CHAR_IN_PARAMETER_NAME = 5
ERR_UNCLOSED_STRING = 6
ERR_EXPECTED_KEYWORD_AFTER_NOT = 7
ERR_UNMATCHED_PAREN_IN_EXPR = 9
ERR_UNKNOWN_OPERATOR = 10
ERR_UNMATCHED_PAREN_IN_BOOL_DELIM = 15
ERR_INVALID_CHAR_IN_BOOL_DELIM = 18
ERR_UNMATCHED_PAREN_IN_EXPECT_BOOL = 19
ERR_INVALID_CHAR_IN_EXPECT_BOOL = 20
ERR_EXPECTED_DELIM_AFTER_BOOL_OP = 23
ERR_EMPTY_INPUT = 24
ERR_UNEXPECTED_EOF = 25
ERR_UNEXPECTED_EOF_IN_KEY = 26
ERR_UNMATCHED_PAREN_AT_EOF = 27
ERR_EXPECTED_VALUE = 29
ERR_EXPECTED_OPERATOR_OR_BOOL_OP = 32
ERR_EXPECTED_KEY_OR_PAREN_AFTER_NOT = 33
ERR_EXPECTED_NOT_OR_IN_KEYWORD = 41
ERR_EXPECTED_LIST_START = 42
ERR_EXPECTED_VALUE_IN_LIST = 43
ERR_UNEXPECTED_CHAR_IN_LIST_VALUE = 44
ERR_EXPECTED_COMMA_OR_LIST_END = 46
ERR_EXPECTED_LIST_START_AFTER_IN = 47
ERR_EXPECTED_VALUE_AFTER_KEYWORD = 50
ERR_NULL_NOT_ALLOWED_WITH_OPERATOR = 51
ERR_KEY_PARSE_FAILED = 60
ERR_UNKNOWN_FUNCTION = 70
ERR_INVALID_FUNCTION_ARGS = 71
ERR_FUNCTION_NOT_ALLOWED_WITH_OPERATOR = 72
ERR_INVALID_DURATION = 73
ERR_EMPTY_PARAMETER_NAME = 74
ERR_INVALID_PARAMETER_NAME = 75
ERR_PARAMETER_ZERO_INDEX = 76
ERR_MAX_DEPTH_EXCEEDED = 78

CORE_PARSER_MESSAGES: dict[int, str] = {
    ERR_INVALID_CHAR_INITIAL: "invalid character",
    ERR_INVALID_CHAR_IN_VALUE: "invalid character",
    ERR_INVALID_CHAR_IN_KEY: "invalid character",
    ERR_INVALID_CHAR_IN_KEY_VALUE_OPERATOR: "invalid character",
    ERR_INVALID_CHAR_IN_PARAMETER_NAME: "invalid character in parameter name",
    ERR_UNCLOSED_STRING: "unclosed string",
    ERR_EXPECTED_KEYWORD_AFTER_NOT: "expected keyword after 'not'",
    ERR_UNMATCHED_PAREN_IN_EXPR: "unmatched parenthesis",
    ERR_UNKNOWN_OPERATOR: "unknown operator",
    ERR_UNMATCHED_PAREN_IN_BOOL_DELIM: "unmatched parenthesis",
    ERR_INVALID_CHAR_IN_BOOL_DELIM: "invalid character",
    ERR_UNMATCHED_PAREN_IN_EXPECT_BOOL: "unmatched parenthesis",
    ERR_INVALID_CHAR_IN_EXPECT_BOOL: "invalid character",
    ERR_EXPECTED_DELIM_AFTER_BOOL_OP: "expected delimiter after bool operator",
    ERR_EMPTY_INPUT: "empty input",
    ERR_UNEXPECTED_EOF: "unexpected EOF",
    ERR_UNEXPECTED_EOF_IN_KEY: "unexpected EOF",
    ERR_UNMATCHED_PAREN_AT_EOF: "unmatched parenthesis",
    ERR_EXPECTED_VALUE: "expected value",
    ERR_EXPECTED_OPERATOR_OR_BOOL_OP: "expected operator or boolean operator",
    ERR_EXPECTED_KEY_OR_PAREN_AFTER_NOT: "expected key or ( after 'not'",
    ERR_EXPECTED_NOT_OR_IN_KEYWORD: "expected 'not' or 'in' keyword",
    ERR_EXPECTED_LIST_START: "expected '['",
    ERR_EXPECTED_VALUE_IN_LIST: "expected value in list",
    ERR_UNEXPECTED_CHAR_IN_LIST_VALUE: "unexpected character in list value",
    ERR_EXPECTED_COMMA_OR_LIST_END: "expected ',' or ']'",
    ERR_EXPECTED_LIST_START_AFTER_IN: "expected '[' after 'in'",
    ERR_EXPECTED_VALUE_AFTER_KEYWORD: "expected value or keyword",
    ERR_NULL_NOT_ALLOWED_WITH_OPERATOR: "null value cannot be used with operator",
    ERR_KEY_PARSE_FAILED: "key parsing failed",
    ERR_UNKNOWN_FUNCTION: "unknown function",
    ERR_INVALID_FUNCTION_ARGS: "invalid function argument",
    ERR_FUNCTION_NOT_ALLOWED_WITH_OPERATOR: "function not allowed with operator",
    ERR_INVALID_DURATION: "invalid duration",
    ERR_EMPTY_PARAMETER_NAME: "empty parameter name",
    ERR_INVALID_PARAMETER_NAME: "invalid parameter name",
    ERR_PARAMETER_ZERO_INDEX: "positional parameters are 1-indexed",
    ERR_MAX_DEPTH_EXCEEDED: "maximum nesting depth exceeded",
}

# columns_parser errnos (int)
COLUMNS_ERR_INVALID_CHAR_EXPECT_COLUMN = 2
COLUMNS_ERR_INVALID_CHAR_EXPECT_ALIAS_OPERATOR = 3
COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_OPERATOR = 4
COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_DELIMITER = 5
COLUMNS_ERR_INVALID_CHAR_IN_COLUMN = 6
COLUMNS_ERR_INVALID_TRANSFORMER_OR_RENDERER = 7
COLUMNS_ERR_INVALID_CHAR_AFTER_ARGS = 8
COLUMNS_ERR_INVALID_CHAR_IN_ARGS = 9
COLUMNS_ERR_RENDERERS_NOT_ENABLED = 11
COLUMNS_ERR_UNEXPECTED_END_OF_QUOTED_ARG = 12
COLUMNS_ERR_UNEXPECTED_END_OF_ALIAS_OPERATOR = 13
COLUMNS_ERR_UNEXPECTED_END_EXPECTED_ALIAS_VALUE = 14
COLUMNS_ERR_UNEXPECTED_END_OF_ARGS_LIST = 15
COLUMNS_ERR_EXPECTED_CLOSING_PAREN = 16
COLUMNS_ERR_TRANSFORMERS_NOT_ENABLED = 17
COLUMNS_ERR_RENDERER_REQUIRES_ALIAS = 18

COLUMNS_PARSER_MESSAGES: dict[int, str] = {
    COLUMNS_ERR_INVALID_CHAR_EXPECT_COLUMN: "invalid character",
    COLUMNS_ERR_INVALID_CHAR_EXPECT_ALIAS_OPERATOR: "invalid character",
    COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_OPERATOR: "invalid character, expected alias operator",
    COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_DELIMITER: "invalid character, expected alias delimiter",
    COLUMNS_ERR_INVALID_CHAR_IN_COLUMN: "invalid character",
    COLUMNS_ERR_INVALID_TRANSFORMER_OR_RENDERER: "invalid transformer or renderer",
    COLUMNS_ERR_INVALID_CHAR_AFTER_ARGS: "invalid character",
    COLUMNS_ERR_INVALID_CHAR_IN_ARGS: "invalid character",
    COLUMNS_ERR_RENDERERS_NOT_ENABLED: "renderers are not enabled",
    COLUMNS_ERR_UNEXPECTED_END_OF_QUOTED_ARG: "unexpected end of quoted argument value",
    COLUMNS_ERR_UNEXPECTED_END_OF_ALIAS_OPERATOR: "unexpected end of alias. Expected alias value",
    COLUMNS_ERR_UNEXPECTED_END_EXPECTED_ALIAS_VALUE: "unexpected end of alias. Expected alias value",
    COLUMNS_ERR_UNEXPECTED_END_OF_ARGS_LIST: "unexpected end of arguments list",
    COLUMNS_ERR_EXPECTED_CLOSING_PAREN: "expected closing parenthesis",
    COLUMNS_ERR_TRANSFORMERS_NOT_ENABLED: "transformers are not enabled",
    COLUMNS_ERR_RENDERER_REQUIRES_ALIAS: "renderers require an alias",
}

# validator diagnostic codes (string)
CODE_ARG_COUNT = "arg_count"
CODE_ARG_TYPE = "arg_type"
CODE_CHAIN_TYPE = "chain_type"
CODE_INVALID_AST = "invalid_ast"
CODE_INVALID_COLUMN_VALUE = "invalid_column_value"
CODE_INVALID_DATETIME_LITERAL = "invalid_datetime_literal"
CODE_RENDERER_ARG_COUNT = "renderer_arg_count"
CODE_RENDERER_ARG_TYPE = "renderer_arg_type"
CODE_UNKNOWN_COLUMN = "unknown_column"
CODE_UNKNOWN_COLUMN_VALUE = "unknown_column_value"
CODE_UNKNOWN_RENDERER = "unknown_renderer"
CODE_UNKNOWN_TRANSFORMER = "unknown_transformer"

VALIDATOR_MESSAGES: dict[str, str] = {
    CODE_ARG_COUNT: "transformer argument count mismatch",
    CODE_ARG_TYPE: "transformer argument type mismatch",
    CODE_CHAIN_TYPE: "transformer chain type mismatch",
    CODE_INVALID_AST: "invalid AST",
    CODE_INVALID_COLUMN_VALUE: "invalid column value",
    CODE_INVALID_DATETIME_LITERAL: "invalid datetime literal",
    CODE_RENDERER_ARG_COUNT: "renderer argument count mismatch",
    CODE_RENDERER_ARG_TYPE: "renderer argument type mismatch",
    CODE_UNKNOWN_COLUMN: "unknown column",
    CODE_UNKNOWN_COLUMN_VALUE: "unknown column value",
    CODE_UNKNOWN_RENDERER: "unknown renderer",
    CODE_UNKNOWN_TRANSFORMER: "unknown transformer",
}

# matcher diagnostic codes (string)
ERR_RE2_MISSING = "re2_missing"

MATCHER_MESSAGES: dict[str, str] = {
    ERR_RE2_MISSING: "regex matching requires the [re2] extra",
}
