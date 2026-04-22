"""Code generated from errors/registry.json — DO NOT EDIT.
Run `make generate-errors` at the repo root to regenerate.
Source: errors/registry.json"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ErrorEntry:
    """Registry entry for a single error code."""

    code: int | str
    name: str
    message: str
    description: str
    dynamic_message: bool


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

CORE_PARSER_REGISTRY: dict[int, ErrorEntry] = {
    ERR_INVALID_CHAR_INITIAL: ErrorEntry(
        code=ERR_INVALID_CHAR_INITIAL,
        name="ERR_INVALID_CHAR_INITIAL",
        message="invalid character",
        description="Invalid character at the start of input (state INITIAL). Narrowed from the former dual-purpose ERR_UNKNOWN_STATE; the former state-dispatch fallthrough site is now an internal assertion.",
        dynamic_message=False,
    ),
    ERR_INVALID_CHAR_IN_VALUE: ErrorEntry(
        code=ERR_INVALID_CHAR_IN_VALUE,
        name="ERR_INVALID_CHAR_IN_VALUE",
        message="invalid character",
        description="Invalid character while parsing an unquoted value (in_state_value). Split off from ERR_UNKNOWN_OPERATOR (formerly errno 10).",
        dynamic_message=False,
    ),
    ERR_INVALID_CHAR_IN_KEY: ErrorEntry(
        code=ERR_INVALID_CHAR_IN_KEY,
        name="ERR_INVALID_CHAR_IN_KEY",
        message="invalid character",
        description="",
        dynamic_message=False,
    ),
    ERR_INVALID_CHAR_IN_KEY_VALUE_OPERATOR: ErrorEntry(
        code=ERR_INVALID_CHAR_IN_KEY_VALUE_OPERATOR,
        name="ERR_INVALID_CHAR_IN_KEY_VALUE_OPERATOR",
        message="invalid character",
        description="",
        dynamic_message=False,
    ),
    ERR_INVALID_CHAR_IN_PARAMETER_NAME: ErrorEntry(
        code=ERR_INVALID_CHAR_IN_PARAMETER_NAME,
        name="ERR_INVALID_CHAR_IN_PARAMETER_NAME",
        message="invalid character in parameter name",
        description="Invalid character while parsing a parameter name; covers regular-value, in-list, and function-call contexts. Consolidates sites previously split between ERR_UNKNOWN_OPERATOR (errno 10) and ERR_INVALID_FUNCTION_ARGS (errno 71) that emitted the identical message.",
        dynamic_message=False,
    ),
    ERR_UNCLOSED_STRING: ErrorEntry(
        code=ERR_UNCLOSED_STRING,
        name="ERR_UNCLOSED_STRING",
        message="unclosed string",
        description="EOF reached inside a single- or double-quoted value. Split off from the former dual-purpose ERR_EXPECTED_OPERATOR_OR_UNCLOSED_STRING (errno 28).",
        dynamic_message=False,
    ),
    ERR_EXPECTED_KEYWORD_AFTER_NOT: ErrorEntry(
        code=ERR_EXPECTED_KEYWORD_AFTER_NOT,
        name="ERR_EXPECTED_KEYWORD_AFTER_NOT",
        message="expected keyword after 'not'",
        description="Emitted when a 'not' prefix is followed by a token that is neither 'has' nor 'like'/'ilike'. Dynamic message names the expected keyword ('has' vs 'like or ilike'). Split off from the former ERR_EXPECTED_VALUE_OR_KEYWORD (errno 50).",
        dynamic_message=True,
    ),
    ERR_UNMATCHED_PAREN_IN_EXPR: ErrorEntry(
        code=ERR_UNMATCHED_PAREN_IN_EXPR,
        name="ERR_UNMATCHED_PAREN_IN_EXPR",
        message="unmatched parenthesis",
        description="",
        dynamic_message=False,
    ),
    ERR_UNKNOWN_OPERATOR: ErrorEntry(
        code=ERR_UNKNOWN_OPERATOR,
        name="ERR_UNKNOWN_OPERATOR",
        message="unknown operator",
        description="Unknown key-value operator. Emitted from 5 in_state_key_value_operator sites (==, !==, =!, =<, =>-style typos). Narrowed from the former dual-purpose ERR_INVALID_CHAR_OR_UNKNOWN_OPERATOR; invalid-character sites were split off to ERR_INVALID_CHAR_IN_VALUE (errno 2) and ERR_INVALID_CHAR_IN_PARAMETER_NAME (errno 5).",
        dynamic_message=False,
    ),
    ERR_UNMATCHED_PAREN_IN_BOOL_DELIM: ErrorEntry(
        code=ERR_UNMATCHED_PAREN_IN_BOOL_DELIM,
        name="ERR_UNMATCHED_PAREN_IN_BOOL_DELIM",
        message="unmatched parenthesis",
        description="",
        dynamic_message=False,
    ),
    ERR_INVALID_CHAR_IN_BOOL_DELIM: ErrorEntry(
        code=ERR_INVALID_CHAR_IN_BOOL_DELIM,
        name="ERR_INVALID_CHAR_IN_BOOL_DELIM",
        message="invalid character",
        description="",
        dynamic_message=False,
    ),
    ERR_UNMATCHED_PAREN_IN_EXPECT_BOOL: ErrorEntry(
        code=ERR_UNMATCHED_PAREN_IN_EXPECT_BOOL,
        name="ERR_UNMATCHED_PAREN_IN_EXPECT_BOOL",
        message="unmatched parenthesis",
        description="",
        dynamic_message=False,
    ),
    ERR_INVALID_CHAR_IN_EXPECT_BOOL: ErrorEntry(
        code=ERR_INVALID_CHAR_IN_EXPECT_BOOL,
        name="ERR_INVALID_CHAR_IN_EXPECT_BOOL",
        message="invalid character",
        description="",
        dynamic_message=False,
    ),
    ERR_EXPECTED_DELIM_AFTER_BOOL_OP: ErrorEntry(
        code=ERR_EXPECTED_DELIM_AFTER_BOOL_OP,
        name="ERR_EXPECTED_DELIM_AFTER_BOOL_OP",
        message="expected delimiter after bool operator",
        description="",
        dynamic_message=False,
    ),
    ERR_EMPTY_INPUT: ErrorEntry(
        code=ERR_EMPTY_INPUT,
        name="ERR_EMPTY_INPUT",
        message="empty input",
        description="",
        dynamic_message=False,
    ),
    ERR_UNEXPECTED_EOF: ErrorEntry(
        code=ERR_UNEXPECTED_EOF,
        name="ERR_UNEXPECTED_EOF",
        message="unexpected EOF",
        description="EOF reached in a state that cannot terminate cleanly; the message may specify context (e.g. \"unexpected EOF after 'not'\").",
        dynamic_message=True,
    ),
    ERR_UNEXPECTED_EOF_IN_KEY: ErrorEntry(
        code=ERR_UNEXPECTED_EOF_IN_KEY,
        name="ERR_UNEXPECTED_EOF_IN_KEY",
        message="unexpected EOF",
        description="",
        dynamic_message=False,
    ),
    ERR_UNMATCHED_PAREN_AT_EOF: ErrorEntry(
        code=ERR_UNMATCHED_PAREN_AT_EOF,
        name="ERR_UNMATCHED_PAREN_AT_EOF",
        message="unmatched parenthesis",
        description="",
        dynamic_message=False,
    ),
    ERR_EXPECTED_VALUE: ErrorEntry(
        code=ERR_EXPECTED_VALUE,
        name="ERR_EXPECTED_VALUE",
        message="expected value",
        description="",
        dynamic_message=False,
    ),
    ERR_EXPECTED_OPERATOR_OR_BOOL_OP: ErrorEntry(
        code=ERR_EXPECTED_OPERATOR_OR_BOOL_OP,
        name="ERR_EXPECTED_OPERATOR_OR_BOOL_OP",
        message="expected operator or boolean operator",
        description="",
        dynamic_message=False,
    ),
    ERR_EXPECTED_KEY_OR_PAREN_AFTER_NOT: ErrorEntry(
        code=ERR_EXPECTED_KEY_OR_PAREN_AFTER_NOT,
        name="ERR_EXPECTED_KEY_OR_PAREN_AFTER_NOT",
        message="expected key or ( after 'not'",
        description="",
        dynamic_message=False,
    ),
    ERR_EXPECTED_NOT_OR_IN_KEYWORD: ErrorEntry(
        code=ERR_EXPECTED_NOT_OR_IN_KEYWORD,
        name="ERR_EXPECTED_NOT_OR_IN_KEYWORD",
        message="expected 'not' or 'in' keyword",
        description="Emitted while parsing the 'not' / 'not in' prefix at 3 user-reachable sites — \"expected 'not' or 'in' keyword\", \"expected 'not' keyword\", \"expected space after 'not'\". All three share the same user fix (write a valid 'not in' prefix or drop it); dynamic_message identifies which token was wrong. The former else-branch site in expect_in_keyword is unreachable and is now an internal assertion.",
        dynamic_message=True,
    ),
    ERR_EXPECTED_LIST_START: ErrorEntry(
        code=ERR_EXPECTED_LIST_START,
        name="ERR_EXPECTED_LIST_START",
        message="expected '['",
        description="",
        dynamic_message=False,
    ),
    ERR_EXPECTED_VALUE_IN_LIST: ErrorEntry(
        code=ERR_EXPECTED_VALUE_IN_LIST,
        name="ERR_EXPECTED_VALUE_IN_LIST",
        message="expected value in list",
        description="",
        dynamic_message=False,
    ),
    ERR_UNEXPECTED_CHAR_IN_LIST_VALUE: ErrorEntry(
        code=ERR_UNEXPECTED_CHAR_IN_LIST_VALUE,
        name="ERR_UNEXPECTED_CHAR_IN_LIST_VALUE",
        message="unexpected character in list value",
        description="",
        dynamic_message=False,
    ),
    ERR_EXPECTED_COMMA_OR_LIST_END: ErrorEntry(
        code=ERR_EXPECTED_COMMA_OR_LIST_END,
        name="ERR_EXPECTED_COMMA_OR_LIST_END",
        message="expected ',' or ']'",
        description="",
        dynamic_message=False,
    ),
    ERR_EXPECTED_LIST_START_AFTER_IN: ErrorEntry(
        code=ERR_EXPECTED_LIST_START_AFTER_IN,
        name="ERR_EXPECTED_LIST_START_AFTER_IN",
        message="expected '[' after 'in'",
        description="",
        dynamic_message=False,
    ),
    ERR_EXPECTED_VALUE_AFTER_KEYWORD: ErrorEntry(
        code=ERR_EXPECTED_VALUE_AFTER_KEYWORD,
        name="ERR_EXPECTED_VALUE_AFTER_KEYWORD",
        message="expected value or keyword",
        description="Emitted for 6 sites — 'expected value after has/like/ilike' (with and without 'not' prefix). All share the same user meaning (value omitted after a keyword operator); the dynamic message identifies which keyword. The 2 former 'expected has/like keyword' sites were split off to ERR_EXPECTED_KEYWORD_AFTER_NOT (errno 7).",
        dynamic_message=True,
    ),
    ERR_NULL_NOT_ALLOWED_WITH_OPERATOR: ErrorEntry(
        code=ERR_NULL_NOT_ALLOWED_WITH_OPERATOR,
        name="ERR_NULL_NOT_ALLOWED_WITH_OPERATOR",
        message="null value cannot be used with operator",
        description="",
        dynamic_message=True,
    ),
    ERR_KEY_PARSE_FAILED: ErrorEntry(
        code=ERR_KEY_PARSE_FAILED,
        name="ERR_KEY_PARSE_FAILED",
        message="key parsing failed",
        description="Wraps a KeyParseError raised by the key parser; the surfaced message is propagated from the wrapped exception.",
        dynamic_message=True,
    ),
    ERR_UNKNOWN_FUNCTION: ErrorEntry(
        code=ERR_UNKNOWN_FUNCTION,
        name="ERR_UNKNOWN_FUNCTION",
        message="unknown function",
        description="",
        dynamic_message=True,
    ),
    ERR_INVALID_FUNCTION_ARGS: ErrorEntry(
        code=ERR_INVALID_FUNCTION_ARGS,
        name="ERR_INVALID_FUNCTION_ARGS",
        message="invalid function argument",
        description="Function-call argument syntax error. 4 remaining sites all share 'function call syntax error' semantics with contextual messages. The 'invalid character in parameter name' site was moved to ERR_INVALID_CHAR_IN_PARAMETER_NAME (errno 5) to eliminate a cross-errno message collision.",
        dynamic_message=True,
    ),
    ERR_FUNCTION_NOT_ALLOWED_WITH_OPERATOR: ErrorEntry(
        code=ERR_FUNCTION_NOT_ALLOWED_WITH_OPERATOR,
        name="ERR_FUNCTION_NOT_ALLOWED_WITH_OPERATOR",
        message="function not allowed with operator",
        description="",
        dynamic_message=True,
    ),
    ERR_INVALID_DURATION: ErrorEntry(
        code=ERR_INVALID_DURATION,
        name="ERR_INVALID_DURATION",
        message="invalid duration",
        description="",
        dynamic_message=True,
    ),
    ERR_EMPTY_PARAMETER_NAME: ErrorEntry(
        code=ERR_EMPTY_PARAMETER_NAME,
        name="ERR_EMPTY_PARAMETER_NAME",
        message="empty parameter name",
        description="",
        dynamic_message=False,
    ),
    ERR_INVALID_PARAMETER_NAME: ErrorEntry(
        code=ERR_INVALID_PARAMETER_NAME,
        name="ERR_INVALID_PARAMETER_NAME",
        message="invalid parameter name",
        description="",
        dynamic_message=False,
    ),
    ERR_PARAMETER_ZERO_INDEX: ErrorEntry(
        code=ERR_PARAMETER_ZERO_INDEX,
        name="ERR_PARAMETER_ZERO_INDEX",
        message="positional parameters are 1-indexed",
        description="",
        dynamic_message=False,
    ),
    ERR_MAX_DEPTH_EXCEEDED: ErrorEntry(
        code=ERR_MAX_DEPTH_EXCEEDED,
        name="ERR_MAX_DEPTH_EXCEEDED",
        message="maximum nesting depth exceeded",
        description="",
        dynamic_message=True,
    ),
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

COLUMNS_PARSER_REGISTRY: dict[int, ErrorEntry] = {
    COLUMNS_ERR_INVALID_CHAR_EXPECT_COLUMN: ErrorEntry(
        code=COLUMNS_ERR_INVALID_CHAR_EXPECT_COLUMN,
        name="COLUMNS_ERR_INVALID_CHAR_EXPECT_COLUMN",
        message="invalid character",
        description="",
        dynamic_message=False,
    ),
    COLUMNS_ERR_INVALID_CHAR_EXPECT_ALIAS_OPERATOR: ErrorEntry(
        code=COLUMNS_ERR_INVALID_CHAR_EXPECT_ALIAS_OPERATOR,
        name="COLUMNS_ERR_INVALID_CHAR_EXPECT_ALIAS_OPERATOR",
        message="invalid character",
        description="",
        dynamic_message=False,
    ),
    COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_OPERATOR: ErrorEntry(
        code=COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_OPERATOR,
        name="COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_OPERATOR",
        message="invalid character, expected alias operator",
        description="",
        dynamic_message=False,
    ),
    COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_DELIMITER: ErrorEntry(
        code=COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_DELIMITER,
        name="COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_DELIMITER",
        message="invalid character, expected alias delimiter",
        description="",
        dynamic_message=False,
    ),
    COLUMNS_ERR_INVALID_CHAR_IN_COLUMN: ErrorEntry(
        code=COLUMNS_ERR_INVALID_CHAR_IN_COLUMN,
        name="COLUMNS_ERR_INVALID_CHAR_IN_COLUMN",
        message="invalid character",
        description="",
        dynamic_message=False,
    ),
    COLUMNS_ERR_INVALID_TRANSFORMER_OR_RENDERER: ErrorEntry(
        code=COLUMNS_ERR_INVALID_TRANSFORMER_OR_RENDERER,
        name="COLUMNS_ERR_INVALID_TRANSFORMER_OR_RENDERER",
        message="invalid transformer or renderer",
        description="Emitted at multiple sites: 'expected transformer after operator', 'expected renderer after operator', 'invalid character, expected transformer', 'invalid character, expected renderer', 'invalid character in renderer name'.",
        dynamic_message=True,
    ),
    COLUMNS_ERR_INVALID_CHAR_AFTER_ARGS: ErrorEntry(
        code=COLUMNS_ERR_INVALID_CHAR_AFTER_ARGS,
        name="COLUMNS_ERR_INVALID_CHAR_AFTER_ARGS",
        message="invalid character",
        description="",
        dynamic_message=False,
    ),
    COLUMNS_ERR_INVALID_CHAR_IN_ARGS: ErrorEntry(
        code=COLUMNS_ERR_INVALID_CHAR_IN_ARGS,
        name="COLUMNS_ERR_INVALID_CHAR_IN_ARGS",
        message="invalid character",
        description="Emitted for 'invalid character. Expected bracket close or transformer/renderer argument delimiter'.",
        dynamic_message=True,
    ),
    COLUMNS_ERR_RENDERERS_NOT_ENABLED: ErrorEntry(
        code=COLUMNS_ERR_RENDERERS_NOT_ENABLED,
        name="COLUMNS_ERR_RENDERERS_NOT_ENABLED",
        message="renderers are not enabled",
        description="Renderer syntax encountered while the renderers capability is disabled. Narrowed from the former dual-purpose COLUMNS_ERR_RENDERERS_NOT_ENABLED_OR_NO_ALIAS; the 'renderers require an alias' site was split off to COLUMNS_ERR_RENDERER_REQUIRES_ALIAS (errno 18).",
        dynamic_message=False,
    ),
    COLUMNS_ERR_UNEXPECTED_END_OF_QUOTED_ARG: ErrorEntry(
        code=COLUMNS_ERR_UNEXPECTED_END_OF_QUOTED_ARG,
        name="COLUMNS_ERR_UNEXPECTED_END_OF_QUOTED_ARG",
        message="unexpected end of quoted argument value",
        description="",
        dynamic_message=False,
    ),
    COLUMNS_ERR_UNEXPECTED_END_OF_ALIAS_OPERATOR: ErrorEntry(
        code=COLUMNS_ERR_UNEXPECTED_END_OF_ALIAS_OPERATOR,
        name="COLUMNS_ERR_UNEXPECTED_END_OF_ALIAS_OPERATOR",
        message="unexpected end of alias. Expected alias value",
        description="",
        dynamic_message=False,
    ),
    COLUMNS_ERR_UNEXPECTED_END_EXPECTED_ALIAS_VALUE: ErrorEntry(
        code=COLUMNS_ERR_UNEXPECTED_END_EXPECTED_ALIAS_VALUE,
        name="COLUMNS_ERR_UNEXPECTED_END_EXPECTED_ALIAS_VALUE",
        message="unexpected end of alias. Expected alias value",
        description="",
        dynamic_message=False,
    ),
    COLUMNS_ERR_UNEXPECTED_END_OF_ARGS_LIST: ErrorEntry(
        code=COLUMNS_ERR_UNEXPECTED_END_OF_ARGS_LIST,
        name="COLUMNS_ERR_UNEXPECTED_END_OF_ARGS_LIST",
        message="unexpected end of arguments list",
        description="",
        dynamic_message=False,
    ),
    COLUMNS_ERR_EXPECTED_CLOSING_PAREN: ErrorEntry(
        code=COLUMNS_ERR_EXPECTED_CLOSING_PAREN,
        name="COLUMNS_ERR_EXPECTED_CLOSING_PAREN",
        message="expected closing parenthesis",
        description="",
        dynamic_message=False,
    ),
    COLUMNS_ERR_TRANSFORMERS_NOT_ENABLED: ErrorEntry(
        code=COLUMNS_ERR_TRANSFORMERS_NOT_ENABLED,
        name="COLUMNS_ERR_TRANSFORMERS_NOT_ENABLED",
        message="transformers are not enabled",
        description="",
        dynamic_message=False,
    ),
    COLUMNS_ERR_RENDERER_REQUIRES_ALIAS: ErrorEntry(
        code=COLUMNS_ERR_RENDERER_REQUIRES_ALIAS,
        name="COLUMNS_ERR_RENDERER_REQUIRES_ALIAS",
        message="renderers require an alias",
        description="A column used renderer syntax but no alias was declared. Split off from the former dual-purpose COLUMNS_ERR_RENDERERS_NOT_ENABLED_OR_NO_ALIAS (errno 11).",
        dynamic_message=False,
    ),
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

VALIDATOR_REGISTRY: dict[str, ErrorEntry] = {
    CODE_ARG_COUNT: ErrorEntry(
        code=CODE_ARG_COUNT,
        name="CODE_ARG_COUNT",
        message="transformer argument count mismatch",
        description="",
        dynamic_message=False,
    ),
    CODE_ARG_TYPE: ErrorEntry(
        code=CODE_ARG_TYPE,
        name="CODE_ARG_TYPE",
        message="transformer argument type mismatch",
        description="",
        dynamic_message=False,
    ),
    CODE_CHAIN_TYPE: ErrorEntry(
        code=CODE_CHAIN_TYPE,
        name="CODE_CHAIN_TYPE",
        message="transformer chain type mismatch",
        description="",
        dynamic_message=False,
    ),
    CODE_INVALID_AST: ErrorEntry(
        code=CODE_INVALID_AST,
        name="CODE_INVALID_AST",
        message="invalid AST",
        description="",
        dynamic_message=False,
    ),
    CODE_INVALID_COLUMN_VALUE: ErrorEntry(
        code=CODE_INVALID_COLUMN_VALUE,
        name="CODE_INVALID_COLUMN_VALUE",
        message="invalid column value",
        description="",
        dynamic_message=False,
    ),
    CODE_INVALID_DATETIME_LITERAL: ErrorEntry(
        code=CODE_INVALID_DATETIME_LITERAL,
        name="CODE_INVALID_DATETIME_LITERAL",
        message="invalid datetime literal",
        description="Emitted when a string literal compared against a Date or DateTime column cannot be parsed as iso8601. Severity (warning) is decided at the validator emission site (see Decision 8); not a registry field.",
        dynamic_message=False,
    ),
    CODE_RENDERER_ARG_COUNT: ErrorEntry(
        code=CODE_RENDERER_ARG_COUNT,
        name="CODE_RENDERER_ARG_COUNT",
        message="renderer argument count mismatch",
        description="",
        dynamic_message=False,
    ),
    CODE_RENDERER_ARG_TYPE: ErrorEntry(
        code=CODE_RENDERER_ARG_TYPE,
        name="CODE_RENDERER_ARG_TYPE",
        message="renderer argument type mismatch",
        description="",
        dynamic_message=False,
    ),
    CODE_UNKNOWN_COLUMN: ErrorEntry(
        code=CODE_UNKNOWN_COLUMN,
        name="CODE_UNKNOWN_COLUMN",
        message="unknown column",
        description="",
        dynamic_message=False,
    ),
    CODE_UNKNOWN_COLUMN_VALUE: ErrorEntry(
        code=CODE_UNKNOWN_COLUMN_VALUE,
        name="CODE_UNKNOWN_COLUMN_VALUE",
        message="unknown column value",
        description="",
        dynamic_message=False,
    ),
    CODE_UNKNOWN_RENDERER: ErrorEntry(
        code=CODE_UNKNOWN_RENDERER,
        name="CODE_UNKNOWN_RENDERER",
        message="unknown renderer",
        description="",
        dynamic_message=False,
    ),
    CODE_UNKNOWN_TRANSFORMER: ErrorEntry(
        code=CODE_UNKNOWN_TRANSFORMER,
        name="CODE_UNKNOWN_TRANSFORMER",
        message="unknown transformer",
        description="",
        dynamic_message=False,
    ),
}

# matcher diagnostic codes (string)
ERR_RE2_MISSING = "re2_missing"

MATCHER_MESSAGES: dict[str, str] = {
    ERR_RE2_MISSING: "regex matching requires the [re2] extra",
}
