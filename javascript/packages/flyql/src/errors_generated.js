// Code generated from errors/registry.json — DO NOT EDIT.
// Run `make generate-errors` at the repo root to regenerate.
// Source: errors/registry.json

// ErrorEntry: registry entry for a single error code.
export class ErrorEntry {
    constructor(code, name, message, description, dynamicMessage) {
        this.code = code
        this.name = name
        this.message = message
        this.description = description
        this.dynamicMessage = dynamicMessage
        Object.freeze(this)
    }
}

// core_parser errnos (int)
export const ERR_INVALID_CHAR_INITIAL = 1
export const ERR_INVALID_CHAR_IN_VALUE = 2
export const ERR_INVALID_CHAR_IN_KEY = 3
export const ERR_INVALID_CHAR_IN_KEY_VALUE_OPERATOR = 4
export const ERR_INVALID_CHAR_IN_PARAMETER_NAME = 5
export const ERR_UNCLOSED_STRING = 6
export const ERR_EXPECTED_KEYWORD_AFTER_NOT = 7
export const ERR_UNMATCHED_PAREN_IN_EXPR = 9
export const ERR_UNKNOWN_OPERATOR = 10
export const ERR_UNMATCHED_PAREN_IN_BOOL_DELIM = 15
export const ERR_INVALID_CHAR_IN_BOOL_DELIM = 18
export const ERR_UNMATCHED_PAREN_IN_EXPECT_BOOL = 19
export const ERR_INVALID_CHAR_IN_EXPECT_BOOL = 20
export const ERR_EXPECTED_DELIM_AFTER_BOOL_OP = 23
export const ERR_EMPTY_INPUT = 24
export const ERR_UNEXPECTED_EOF = 25
export const ERR_UNEXPECTED_EOF_IN_KEY = 26
export const ERR_UNMATCHED_PAREN_AT_EOF = 27
export const ERR_EXPECTED_VALUE = 29
export const ERR_EXPECTED_OPERATOR_OR_BOOL_OP = 32
export const ERR_EXPECTED_KEY_OR_PAREN_AFTER_NOT = 33
export const ERR_EXPECTED_NOT_OR_IN_KEYWORD = 41
export const ERR_EXPECTED_LIST_START = 42
export const ERR_EXPECTED_VALUE_IN_LIST = 43
export const ERR_UNEXPECTED_CHAR_IN_LIST_VALUE = 44
export const ERR_EXPECTED_COMMA_OR_LIST_END = 46
export const ERR_EXPECTED_LIST_START_AFTER_IN = 47
export const ERR_EXPECTED_VALUE_AFTER_KEYWORD = 50
export const ERR_NULL_NOT_ALLOWED_WITH_OPERATOR = 51
export const ERR_KEY_PARSE_FAILED = 60
export const ERR_UNKNOWN_FUNCTION = 70
export const ERR_INVALID_FUNCTION_ARGS = 71
export const ERR_FUNCTION_NOT_ALLOWED_WITH_OPERATOR = 72
export const ERR_INVALID_DURATION = 73
export const ERR_EMPTY_PARAMETER_NAME = 74
export const ERR_INVALID_PARAMETER_NAME = 75
export const ERR_PARAMETER_ZERO_INDEX = 76
export const ERR_MAX_DEPTH_EXCEEDED = 78

export const CORE_PARSER_MESSAGES = Object.freeze({
    [ERR_INVALID_CHAR_INITIAL]: 'invalid character',
    [ERR_INVALID_CHAR_IN_VALUE]: 'invalid character',
    [ERR_INVALID_CHAR_IN_KEY]: 'invalid character',
    [ERR_INVALID_CHAR_IN_KEY_VALUE_OPERATOR]: 'invalid character',
    [ERR_INVALID_CHAR_IN_PARAMETER_NAME]: 'invalid character in parameter name',
    [ERR_UNCLOSED_STRING]: 'unclosed string',
    [ERR_EXPECTED_KEYWORD_AFTER_NOT]: "expected keyword after 'not'",
    [ERR_UNMATCHED_PAREN_IN_EXPR]: 'unmatched parenthesis',
    [ERR_UNKNOWN_OPERATOR]: 'unknown operator',
    [ERR_UNMATCHED_PAREN_IN_BOOL_DELIM]: 'unmatched parenthesis',
    [ERR_INVALID_CHAR_IN_BOOL_DELIM]: 'invalid character',
    [ERR_UNMATCHED_PAREN_IN_EXPECT_BOOL]: 'unmatched parenthesis',
    [ERR_INVALID_CHAR_IN_EXPECT_BOOL]: 'invalid character',
    [ERR_EXPECTED_DELIM_AFTER_BOOL_OP]: 'expected delimiter after bool operator',
    [ERR_EMPTY_INPUT]: 'empty input',
    [ERR_UNEXPECTED_EOF]: 'unexpected EOF',
    [ERR_UNEXPECTED_EOF_IN_KEY]: 'unexpected EOF',
    [ERR_UNMATCHED_PAREN_AT_EOF]: 'unmatched parenthesis',
    [ERR_EXPECTED_VALUE]: 'expected value',
    [ERR_EXPECTED_OPERATOR_OR_BOOL_OP]: 'expected operator or boolean operator',
    [ERR_EXPECTED_KEY_OR_PAREN_AFTER_NOT]: "expected key or ( after 'not'",
    [ERR_EXPECTED_NOT_OR_IN_KEYWORD]: "expected 'not' or 'in' keyword",
    [ERR_EXPECTED_LIST_START]: "expected '['",
    [ERR_EXPECTED_VALUE_IN_LIST]: 'expected value in list',
    [ERR_UNEXPECTED_CHAR_IN_LIST_VALUE]: 'unexpected character in list value',
    [ERR_EXPECTED_COMMA_OR_LIST_END]: "expected ',' or ']'",
    [ERR_EXPECTED_LIST_START_AFTER_IN]: "expected '[' after 'in'",
    [ERR_EXPECTED_VALUE_AFTER_KEYWORD]: 'expected value or keyword',
    [ERR_NULL_NOT_ALLOWED_WITH_OPERATOR]: 'null value cannot be used with operator',
    [ERR_KEY_PARSE_FAILED]: 'key parsing failed',
    [ERR_UNKNOWN_FUNCTION]: 'unknown function',
    [ERR_INVALID_FUNCTION_ARGS]: 'invalid function argument',
    [ERR_FUNCTION_NOT_ALLOWED_WITH_OPERATOR]: 'function not allowed with operator',
    [ERR_INVALID_DURATION]: 'invalid duration',
    [ERR_EMPTY_PARAMETER_NAME]: 'empty parameter name',
    [ERR_INVALID_PARAMETER_NAME]: 'invalid parameter name',
    [ERR_PARAMETER_ZERO_INDEX]: 'positional parameters are 1-indexed',
    [ERR_MAX_DEPTH_EXCEEDED]: 'maximum nesting depth exceeded',
})

export const CORE_PARSER_REGISTRY = Object.freeze({
    [ERR_INVALID_CHAR_INITIAL]: new ErrorEntry(
        ERR_INVALID_CHAR_INITIAL,
        'ERR_INVALID_CHAR_INITIAL',
        'invalid character',
        'Invalid character at the start of input (state INITIAL). Narrowed from the former dual-purpose ERR_UNKNOWN_STATE; the former state-dispatch fallthrough site is now an internal assertion.',
        false,
    ),
    [ERR_INVALID_CHAR_IN_VALUE]: new ErrorEntry(
        ERR_INVALID_CHAR_IN_VALUE,
        'ERR_INVALID_CHAR_IN_VALUE',
        'invalid character',
        'Invalid character while parsing an unquoted value (in_state_value). Split off from ERR_UNKNOWN_OPERATOR (formerly errno 10).',
        false,
    ),
    [ERR_INVALID_CHAR_IN_KEY]: new ErrorEntry(
        ERR_INVALID_CHAR_IN_KEY,
        'ERR_INVALID_CHAR_IN_KEY',
        'invalid character',
        '',
        false,
    ),
    [ERR_INVALID_CHAR_IN_KEY_VALUE_OPERATOR]: new ErrorEntry(
        ERR_INVALID_CHAR_IN_KEY_VALUE_OPERATOR,
        'ERR_INVALID_CHAR_IN_KEY_VALUE_OPERATOR',
        'invalid character',
        '',
        false,
    ),
    [ERR_INVALID_CHAR_IN_PARAMETER_NAME]: new ErrorEntry(
        ERR_INVALID_CHAR_IN_PARAMETER_NAME,
        'ERR_INVALID_CHAR_IN_PARAMETER_NAME',
        'invalid character in parameter name',
        'Invalid character while parsing a parameter name; covers regular-value, in-list, and function-call contexts. Consolidates sites previously split between ERR_UNKNOWN_OPERATOR (errno 10) and ERR_INVALID_FUNCTION_ARGS (errno 71) that emitted the identical message.',
        false,
    ),
    [ERR_UNCLOSED_STRING]: new ErrorEntry(
        ERR_UNCLOSED_STRING,
        'ERR_UNCLOSED_STRING',
        'unclosed string',
        'EOF reached inside a single- or double-quoted value. Split off from the former dual-purpose ERR_EXPECTED_OPERATOR_OR_UNCLOSED_STRING (errno 28).',
        false,
    ),
    [ERR_EXPECTED_KEYWORD_AFTER_NOT]: new ErrorEntry(
        ERR_EXPECTED_KEYWORD_AFTER_NOT,
        'ERR_EXPECTED_KEYWORD_AFTER_NOT',
        "expected keyword after 'not'",
        "Emitted when a 'not' prefix is followed by a token that is neither 'has' nor 'like'/'ilike'. Dynamic message names the expected keyword ('has' vs 'like or ilike'). Split off from the former ERR_EXPECTED_VALUE_OR_KEYWORD (errno 50).",
        true,
    ),
    [ERR_UNMATCHED_PAREN_IN_EXPR]: new ErrorEntry(
        ERR_UNMATCHED_PAREN_IN_EXPR,
        'ERR_UNMATCHED_PAREN_IN_EXPR',
        'unmatched parenthesis',
        '',
        false,
    ),
    [ERR_UNKNOWN_OPERATOR]: new ErrorEntry(
        ERR_UNKNOWN_OPERATOR,
        'ERR_UNKNOWN_OPERATOR',
        'unknown operator',
        'Unknown key-value operator. Emitted from 5 in_state_key_value_operator sites (==, !==, =!, =<, =>-style typos). Narrowed from the former dual-purpose ERR_INVALID_CHAR_OR_UNKNOWN_OPERATOR; invalid-character sites were split off to ERR_INVALID_CHAR_IN_VALUE (errno 2) and ERR_INVALID_CHAR_IN_PARAMETER_NAME (errno 5).',
        false,
    ),
    [ERR_UNMATCHED_PAREN_IN_BOOL_DELIM]: new ErrorEntry(
        ERR_UNMATCHED_PAREN_IN_BOOL_DELIM,
        'ERR_UNMATCHED_PAREN_IN_BOOL_DELIM',
        'unmatched parenthesis',
        '',
        false,
    ),
    [ERR_INVALID_CHAR_IN_BOOL_DELIM]: new ErrorEntry(
        ERR_INVALID_CHAR_IN_BOOL_DELIM,
        'ERR_INVALID_CHAR_IN_BOOL_DELIM',
        'invalid character',
        '',
        false,
    ),
    [ERR_UNMATCHED_PAREN_IN_EXPECT_BOOL]: new ErrorEntry(
        ERR_UNMATCHED_PAREN_IN_EXPECT_BOOL,
        'ERR_UNMATCHED_PAREN_IN_EXPECT_BOOL',
        'unmatched parenthesis',
        '',
        false,
    ),
    [ERR_INVALID_CHAR_IN_EXPECT_BOOL]: new ErrorEntry(
        ERR_INVALID_CHAR_IN_EXPECT_BOOL,
        'ERR_INVALID_CHAR_IN_EXPECT_BOOL',
        'invalid character',
        '',
        false,
    ),
    [ERR_EXPECTED_DELIM_AFTER_BOOL_OP]: new ErrorEntry(
        ERR_EXPECTED_DELIM_AFTER_BOOL_OP,
        'ERR_EXPECTED_DELIM_AFTER_BOOL_OP',
        'expected delimiter after bool operator',
        '',
        false,
    ),
    [ERR_EMPTY_INPUT]: new ErrorEntry(ERR_EMPTY_INPUT, 'ERR_EMPTY_INPUT', 'empty input', '', false),
    [ERR_UNEXPECTED_EOF]: new ErrorEntry(
        ERR_UNEXPECTED_EOF,
        'ERR_UNEXPECTED_EOF',
        'unexpected EOF',
        'EOF reached in a state that cannot terminate cleanly; the message may specify context (e.g. "unexpected EOF after \'not\'").',
        true,
    ),
    [ERR_UNEXPECTED_EOF_IN_KEY]: new ErrorEntry(
        ERR_UNEXPECTED_EOF_IN_KEY,
        'ERR_UNEXPECTED_EOF_IN_KEY',
        'unexpected EOF',
        '',
        false,
    ),
    [ERR_UNMATCHED_PAREN_AT_EOF]: new ErrorEntry(
        ERR_UNMATCHED_PAREN_AT_EOF,
        'ERR_UNMATCHED_PAREN_AT_EOF',
        'unmatched parenthesis',
        '',
        false,
    ),
    [ERR_EXPECTED_VALUE]: new ErrorEntry(ERR_EXPECTED_VALUE, 'ERR_EXPECTED_VALUE', 'expected value', '', false),
    [ERR_EXPECTED_OPERATOR_OR_BOOL_OP]: new ErrorEntry(
        ERR_EXPECTED_OPERATOR_OR_BOOL_OP,
        'ERR_EXPECTED_OPERATOR_OR_BOOL_OP',
        'expected operator or boolean operator',
        '',
        false,
    ),
    [ERR_EXPECTED_KEY_OR_PAREN_AFTER_NOT]: new ErrorEntry(
        ERR_EXPECTED_KEY_OR_PAREN_AFTER_NOT,
        'ERR_EXPECTED_KEY_OR_PAREN_AFTER_NOT',
        "expected key or ( after 'not'",
        '',
        false,
    ),
    [ERR_EXPECTED_NOT_OR_IN_KEYWORD]: new ErrorEntry(
        ERR_EXPECTED_NOT_OR_IN_KEYWORD,
        'ERR_EXPECTED_NOT_OR_IN_KEYWORD',
        "expected 'not' or 'in' keyword",
        "Emitted while parsing the 'not' / 'not in' prefix at 3 user-reachable sites — \"expected 'not' or 'in' keyword\", \"expected 'not' keyword\", \"expected space after 'not'\". All three share the same user fix (write a valid 'not in' prefix or drop it); dynamic_message identifies which token was wrong. The former else-branch site in expect_in_keyword is unreachable and is now an internal assertion.",
        true,
    ),
    [ERR_EXPECTED_LIST_START]: new ErrorEntry(
        ERR_EXPECTED_LIST_START,
        'ERR_EXPECTED_LIST_START',
        "expected '['",
        '',
        false,
    ),
    [ERR_EXPECTED_VALUE_IN_LIST]: new ErrorEntry(
        ERR_EXPECTED_VALUE_IN_LIST,
        'ERR_EXPECTED_VALUE_IN_LIST',
        'expected value in list',
        '',
        false,
    ),
    [ERR_UNEXPECTED_CHAR_IN_LIST_VALUE]: new ErrorEntry(
        ERR_UNEXPECTED_CHAR_IN_LIST_VALUE,
        'ERR_UNEXPECTED_CHAR_IN_LIST_VALUE',
        'unexpected character in list value',
        '',
        false,
    ),
    [ERR_EXPECTED_COMMA_OR_LIST_END]: new ErrorEntry(
        ERR_EXPECTED_COMMA_OR_LIST_END,
        'ERR_EXPECTED_COMMA_OR_LIST_END',
        "expected ',' or ']'",
        '',
        false,
    ),
    [ERR_EXPECTED_LIST_START_AFTER_IN]: new ErrorEntry(
        ERR_EXPECTED_LIST_START_AFTER_IN,
        'ERR_EXPECTED_LIST_START_AFTER_IN',
        "expected '[' after 'in'",
        '',
        false,
    ),
    [ERR_EXPECTED_VALUE_AFTER_KEYWORD]: new ErrorEntry(
        ERR_EXPECTED_VALUE_AFTER_KEYWORD,
        'ERR_EXPECTED_VALUE_AFTER_KEYWORD',
        'expected value or keyword',
        "Emitted for 6 sites — 'expected value after has/like/ilike' (with and without 'not' prefix). All share the same user meaning (value omitted after a keyword operator); the dynamic message identifies which keyword. The 2 former 'expected has/like keyword' sites were split off to ERR_EXPECTED_KEYWORD_AFTER_NOT (errno 7).",
        true,
    ),
    [ERR_NULL_NOT_ALLOWED_WITH_OPERATOR]: new ErrorEntry(
        ERR_NULL_NOT_ALLOWED_WITH_OPERATOR,
        'ERR_NULL_NOT_ALLOWED_WITH_OPERATOR',
        'null value cannot be used with operator',
        '',
        true,
    ),
    [ERR_KEY_PARSE_FAILED]: new ErrorEntry(
        ERR_KEY_PARSE_FAILED,
        'ERR_KEY_PARSE_FAILED',
        'key parsing failed',
        'Wraps a KeyParseError raised by the key parser; the surfaced message is propagated from the wrapped exception.',
        true,
    ),
    [ERR_UNKNOWN_FUNCTION]: new ErrorEntry(ERR_UNKNOWN_FUNCTION, 'ERR_UNKNOWN_FUNCTION', 'unknown function', '', true),
    [ERR_INVALID_FUNCTION_ARGS]: new ErrorEntry(
        ERR_INVALID_FUNCTION_ARGS,
        'ERR_INVALID_FUNCTION_ARGS',
        'invalid function argument',
        "Function-call argument syntax error. 4 remaining sites all share 'function call syntax error' semantics with contextual messages. The 'invalid character in parameter name' site was moved to ERR_INVALID_CHAR_IN_PARAMETER_NAME (errno 5) to eliminate a cross-errno message collision.",
        true,
    ),
    [ERR_FUNCTION_NOT_ALLOWED_WITH_OPERATOR]: new ErrorEntry(
        ERR_FUNCTION_NOT_ALLOWED_WITH_OPERATOR,
        'ERR_FUNCTION_NOT_ALLOWED_WITH_OPERATOR',
        'function not allowed with operator',
        '',
        true,
    ),
    [ERR_INVALID_DURATION]: new ErrorEntry(ERR_INVALID_DURATION, 'ERR_INVALID_DURATION', 'invalid duration', '', true),
    [ERR_EMPTY_PARAMETER_NAME]: new ErrorEntry(
        ERR_EMPTY_PARAMETER_NAME,
        'ERR_EMPTY_PARAMETER_NAME',
        'empty parameter name',
        '',
        false,
    ),
    [ERR_INVALID_PARAMETER_NAME]: new ErrorEntry(
        ERR_INVALID_PARAMETER_NAME,
        'ERR_INVALID_PARAMETER_NAME',
        'invalid parameter name',
        '',
        false,
    ),
    [ERR_PARAMETER_ZERO_INDEX]: new ErrorEntry(
        ERR_PARAMETER_ZERO_INDEX,
        'ERR_PARAMETER_ZERO_INDEX',
        'positional parameters are 1-indexed',
        '',
        false,
    ),
    [ERR_MAX_DEPTH_EXCEEDED]: new ErrorEntry(
        ERR_MAX_DEPTH_EXCEEDED,
        'ERR_MAX_DEPTH_EXCEEDED',
        'maximum nesting depth exceeded',
        '',
        true,
    ),
})

// columns_parser errnos (int)
export const COLUMNS_ERR_INVALID_CHAR_EXPECT_COLUMN = 2
export const COLUMNS_ERR_INVALID_CHAR_EXPECT_ALIAS_OPERATOR = 3
export const COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_OPERATOR = 4
export const COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_DELIMITER = 5
export const COLUMNS_ERR_INVALID_CHAR_IN_COLUMN = 6
export const COLUMNS_ERR_INVALID_TRANSFORMER_OR_RENDERER = 7
export const COLUMNS_ERR_INVALID_CHAR_AFTER_ARGS = 8
export const COLUMNS_ERR_INVALID_CHAR_IN_ARGS = 9
export const COLUMNS_ERR_RENDERERS_NOT_ENABLED = 11
export const COLUMNS_ERR_UNEXPECTED_END_OF_QUOTED_ARG = 12
export const COLUMNS_ERR_UNEXPECTED_END_OF_ALIAS_OPERATOR = 13
export const COLUMNS_ERR_UNEXPECTED_END_EXPECTED_ALIAS_VALUE = 14
export const COLUMNS_ERR_UNEXPECTED_END_OF_ARGS_LIST = 15
export const COLUMNS_ERR_EXPECTED_CLOSING_PAREN = 16
export const COLUMNS_ERR_TRANSFORMERS_NOT_ENABLED = 17
export const COLUMNS_ERR_RENDERER_REQUIRES_ALIAS = 18

export const COLUMNS_PARSER_MESSAGES = Object.freeze({
    [COLUMNS_ERR_INVALID_CHAR_EXPECT_COLUMN]: 'invalid character',
    [COLUMNS_ERR_INVALID_CHAR_EXPECT_ALIAS_OPERATOR]: 'invalid character',
    [COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_OPERATOR]: 'invalid character, expected alias operator',
    [COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_DELIMITER]: 'invalid character, expected alias delimiter',
    [COLUMNS_ERR_INVALID_CHAR_IN_COLUMN]: 'invalid character',
    [COLUMNS_ERR_INVALID_TRANSFORMER_OR_RENDERER]: 'invalid transformer or renderer',
    [COLUMNS_ERR_INVALID_CHAR_AFTER_ARGS]: 'invalid character',
    [COLUMNS_ERR_INVALID_CHAR_IN_ARGS]: 'invalid character',
    [COLUMNS_ERR_RENDERERS_NOT_ENABLED]: 'renderers are not enabled',
    [COLUMNS_ERR_UNEXPECTED_END_OF_QUOTED_ARG]: 'unexpected end of quoted argument value',
    [COLUMNS_ERR_UNEXPECTED_END_OF_ALIAS_OPERATOR]: 'unexpected end of alias. Expected alias value',
    [COLUMNS_ERR_UNEXPECTED_END_EXPECTED_ALIAS_VALUE]: 'unexpected end of alias. Expected alias value',
    [COLUMNS_ERR_UNEXPECTED_END_OF_ARGS_LIST]: 'unexpected end of arguments list',
    [COLUMNS_ERR_EXPECTED_CLOSING_PAREN]: 'expected closing parenthesis',
    [COLUMNS_ERR_TRANSFORMERS_NOT_ENABLED]: 'transformers are not enabled',
    [COLUMNS_ERR_RENDERER_REQUIRES_ALIAS]: 'renderers require an alias',
})

export const COLUMNS_PARSER_REGISTRY = Object.freeze({
    [COLUMNS_ERR_INVALID_CHAR_EXPECT_COLUMN]: new ErrorEntry(
        COLUMNS_ERR_INVALID_CHAR_EXPECT_COLUMN,
        'COLUMNS_ERR_INVALID_CHAR_EXPECT_COLUMN',
        'invalid character',
        '',
        false,
    ),
    [COLUMNS_ERR_INVALID_CHAR_EXPECT_ALIAS_OPERATOR]: new ErrorEntry(
        COLUMNS_ERR_INVALID_CHAR_EXPECT_ALIAS_OPERATOR,
        'COLUMNS_ERR_INVALID_CHAR_EXPECT_ALIAS_OPERATOR',
        'invalid character',
        '',
        false,
    ),
    [COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_OPERATOR]: new ErrorEntry(
        COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_OPERATOR,
        'COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_OPERATOR',
        'invalid character, expected alias operator',
        '',
        false,
    ),
    [COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_DELIMITER]: new ErrorEntry(
        COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_DELIMITER,
        'COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_DELIMITER',
        'invalid character, expected alias delimiter',
        '',
        false,
    ),
    [COLUMNS_ERR_INVALID_CHAR_IN_COLUMN]: new ErrorEntry(
        COLUMNS_ERR_INVALID_CHAR_IN_COLUMN,
        'COLUMNS_ERR_INVALID_CHAR_IN_COLUMN',
        'invalid character',
        '',
        false,
    ),
    [COLUMNS_ERR_INVALID_TRANSFORMER_OR_RENDERER]: new ErrorEntry(
        COLUMNS_ERR_INVALID_TRANSFORMER_OR_RENDERER,
        'COLUMNS_ERR_INVALID_TRANSFORMER_OR_RENDERER',
        'invalid transformer or renderer',
        "Emitted at multiple sites: 'expected transformer after operator', 'expected renderer after operator', 'invalid character, expected transformer', 'invalid character, expected renderer', 'invalid character in renderer name'.",
        true,
    ),
    [COLUMNS_ERR_INVALID_CHAR_AFTER_ARGS]: new ErrorEntry(
        COLUMNS_ERR_INVALID_CHAR_AFTER_ARGS,
        'COLUMNS_ERR_INVALID_CHAR_AFTER_ARGS',
        'invalid character',
        '',
        false,
    ),
    [COLUMNS_ERR_INVALID_CHAR_IN_ARGS]: new ErrorEntry(
        COLUMNS_ERR_INVALID_CHAR_IN_ARGS,
        'COLUMNS_ERR_INVALID_CHAR_IN_ARGS',
        'invalid character',
        "Emitted for 'invalid character. Expected bracket close or transformer/renderer argument delimiter'.",
        true,
    ),
    [COLUMNS_ERR_RENDERERS_NOT_ENABLED]: new ErrorEntry(
        COLUMNS_ERR_RENDERERS_NOT_ENABLED,
        'COLUMNS_ERR_RENDERERS_NOT_ENABLED',
        'renderers are not enabled',
        "Renderer syntax encountered while the renderers capability is disabled. Narrowed from the former dual-purpose COLUMNS_ERR_RENDERERS_NOT_ENABLED_OR_NO_ALIAS; the 'renderers require an alias' site was split off to COLUMNS_ERR_RENDERER_REQUIRES_ALIAS (errno 18).",
        false,
    ),
    [COLUMNS_ERR_UNEXPECTED_END_OF_QUOTED_ARG]: new ErrorEntry(
        COLUMNS_ERR_UNEXPECTED_END_OF_QUOTED_ARG,
        'COLUMNS_ERR_UNEXPECTED_END_OF_QUOTED_ARG',
        'unexpected end of quoted argument value',
        '',
        false,
    ),
    [COLUMNS_ERR_UNEXPECTED_END_OF_ALIAS_OPERATOR]: new ErrorEntry(
        COLUMNS_ERR_UNEXPECTED_END_OF_ALIAS_OPERATOR,
        'COLUMNS_ERR_UNEXPECTED_END_OF_ALIAS_OPERATOR',
        'unexpected end of alias. Expected alias value',
        '',
        false,
    ),
    [COLUMNS_ERR_UNEXPECTED_END_EXPECTED_ALIAS_VALUE]: new ErrorEntry(
        COLUMNS_ERR_UNEXPECTED_END_EXPECTED_ALIAS_VALUE,
        'COLUMNS_ERR_UNEXPECTED_END_EXPECTED_ALIAS_VALUE',
        'unexpected end of alias. Expected alias value',
        '',
        false,
    ),
    [COLUMNS_ERR_UNEXPECTED_END_OF_ARGS_LIST]: new ErrorEntry(
        COLUMNS_ERR_UNEXPECTED_END_OF_ARGS_LIST,
        'COLUMNS_ERR_UNEXPECTED_END_OF_ARGS_LIST',
        'unexpected end of arguments list',
        '',
        false,
    ),
    [COLUMNS_ERR_EXPECTED_CLOSING_PAREN]: new ErrorEntry(
        COLUMNS_ERR_EXPECTED_CLOSING_PAREN,
        'COLUMNS_ERR_EXPECTED_CLOSING_PAREN',
        'expected closing parenthesis',
        '',
        false,
    ),
    [COLUMNS_ERR_TRANSFORMERS_NOT_ENABLED]: new ErrorEntry(
        COLUMNS_ERR_TRANSFORMERS_NOT_ENABLED,
        'COLUMNS_ERR_TRANSFORMERS_NOT_ENABLED',
        'transformers are not enabled',
        '',
        false,
    ),
    [COLUMNS_ERR_RENDERER_REQUIRES_ALIAS]: new ErrorEntry(
        COLUMNS_ERR_RENDERER_REQUIRES_ALIAS,
        'COLUMNS_ERR_RENDERER_REQUIRES_ALIAS',
        'renderers require an alias',
        'A column used renderer syntax but no alias was declared. Split off from the former dual-purpose COLUMNS_ERR_RENDERERS_NOT_ENABLED_OR_NO_ALIAS (errno 11).',
        false,
    ),
})

// validator diagnostic codes (string)
export const CODE_ARG_COUNT = 'arg_count'
export const CODE_ARG_TYPE = 'arg_type'
export const CODE_CHAIN_TYPE = 'chain_type'
export const CODE_INVALID_AST = 'invalid_ast'
export const CODE_INVALID_COLUMN_VALUE = 'invalid_column_value'
export const CODE_INVALID_DATETIME_LITERAL = 'invalid_datetime_literal'
export const CODE_RENDERER_ARG_COUNT = 'renderer_arg_count'
export const CODE_RENDERER_ARG_TYPE = 'renderer_arg_type'
export const CODE_UNKNOWN_COLUMN = 'unknown_column'
export const CODE_UNKNOWN_COLUMN_VALUE = 'unknown_column_value'
export const CODE_UNKNOWN_RENDERER = 'unknown_renderer'
export const CODE_UNKNOWN_TRANSFORMER = 'unknown_transformer'

export const VALIDATOR_MESSAGES = Object.freeze({
    [CODE_ARG_COUNT]: 'transformer argument count mismatch',
    [CODE_ARG_TYPE]: 'transformer argument type mismatch',
    [CODE_CHAIN_TYPE]: 'transformer chain type mismatch',
    [CODE_INVALID_AST]: 'invalid AST',
    [CODE_INVALID_COLUMN_VALUE]: 'invalid column value',
    [CODE_INVALID_DATETIME_LITERAL]: 'invalid datetime literal',
    [CODE_RENDERER_ARG_COUNT]: 'renderer argument count mismatch',
    [CODE_RENDERER_ARG_TYPE]: 'renderer argument type mismatch',
    [CODE_UNKNOWN_COLUMN]: 'unknown column',
    [CODE_UNKNOWN_COLUMN_VALUE]: 'unknown column value',
    [CODE_UNKNOWN_RENDERER]: 'unknown renderer',
    [CODE_UNKNOWN_TRANSFORMER]: 'unknown transformer',
})

export const VALIDATOR_REGISTRY = Object.freeze({
    [CODE_ARG_COUNT]: new ErrorEntry(
        CODE_ARG_COUNT,
        'CODE_ARG_COUNT',
        'transformer argument count mismatch',
        '',
        false,
    ),
    [CODE_ARG_TYPE]: new ErrorEntry(CODE_ARG_TYPE, 'CODE_ARG_TYPE', 'transformer argument type mismatch', '', false),
    [CODE_CHAIN_TYPE]: new ErrorEntry(CODE_CHAIN_TYPE, 'CODE_CHAIN_TYPE', 'transformer chain type mismatch', '', false),
    [CODE_INVALID_AST]: new ErrorEntry(CODE_INVALID_AST, 'CODE_INVALID_AST', 'invalid AST', '', false),
    [CODE_INVALID_COLUMN_VALUE]: new ErrorEntry(
        CODE_INVALID_COLUMN_VALUE,
        'CODE_INVALID_COLUMN_VALUE',
        'invalid column value',
        '',
        false,
    ),
    [CODE_INVALID_DATETIME_LITERAL]: new ErrorEntry(
        CODE_INVALID_DATETIME_LITERAL,
        'CODE_INVALID_DATETIME_LITERAL',
        'invalid datetime literal',
        'Emitted when a string literal compared against a Date or DateTime column cannot be parsed as iso8601. Severity (warning) is decided at the validator emission site (see Decision 8); not a registry field.',
        false,
    ),
    [CODE_RENDERER_ARG_COUNT]: new ErrorEntry(
        CODE_RENDERER_ARG_COUNT,
        'CODE_RENDERER_ARG_COUNT',
        'renderer argument count mismatch',
        '',
        false,
    ),
    [CODE_RENDERER_ARG_TYPE]: new ErrorEntry(
        CODE_RENDERER_ARG_TYPE,
        'CODE_RENDERER_ARG_TYPE',
        'renderer argument type mismatch',
        '',
        false,
    ),
    [CODE_UNKNOWN_COLUMN]: new ErrorEntry(CODE_UNKNOWN_COLUMN, 'CODE_UNKNOWN_COLUMN', 'unknown column', '', false),
    [CODE_UNKNOWN_COLUMN_VALUE]: new ErrorEntry(
        CODE_UNKNOWN_COLUMN_VALUE,
        'CODE_UNKNOWN_COLUMN_VALUE',
        'unknown column value',
        '',
        false,
    ),
    [CODE_UNKNOWN_RENDERER]: new ErrorEntry(
        CODE_UNKNOWN_RENDERER,
        'CODE_UNKNOWN_RENDERER',
        'unknown renderer',
        '',
        false,
    ),
    [CODE_UNKNOWN_TRANSFORMER]: new ErrorEntry(
        CODE_UNKNOWN_TRANSFORMER,
        'CODE_UNKNOWN_TRANSFORMER',
        'unknown transformer',
        '',
        false,
    ),
})

// matcher diagnostic codes (string)
export const ERR_RE2_MISSING = 're2_missing'

export const MATCHER_MESSAGES = Object.freeze({
    [ERR_RE2_MISSING]: 'regex matching requires the [re2] extra',
})
