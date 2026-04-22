// Code generated from errors/registry.json — DO NOT EDIT.
// Run `make generate-errors` at the repo root to regenerate.
// Source: errors/registry.json

package flyql

// ErrorEntry is the registry entry for a single error code. The Code
// field is `any` because validator codes are strings and parser codes
// are ints; consumers type-assert as needed.
type ErrorEntry struct {
	Code           any
	Name           string
	Message        string
	Description    string
	DynamicMessage bool
}

// core_parser errnos.
const (
	errInvalidCharInitial             = 1
	errInvalidCharInValue             = 2
	errInvalidCharInKey               = 3
	errInvalidCharInKeyValueOperator  = 4
	errInvalidCharInParameterName     = 5
	errUnclosedString                 = 6
	errExpectedKeywordAfterNot        = 7
	errUnmatchedParenInExpr           = 9
	errUnknownOperator                = 10
	errUnmatchedParenInBoolDelim      = 15
	errInvalidCharInBoolDelim         = 18
	errUnmatchedParenInExpectBool     = 19
	errInvalidCharInExpectBool        = 20
	errExpectedDelimAfterBoolOp       = 23
	errEmptyInput                     = 24
	errUnexpectedEof                  = 25
	errUnexpectedEofInKey             = 26
	errUnmatchedParenAtEof            = 27
	errExpectedValue                  = 29
	errExpectedOperatorOrBoolOp       = 32
	errExpectedKeyOrParenAfterNot     = 33
	errExpectedNotOrInKeyword         = 41
	errExpectedListStart              = 42
	errExpectedValueInList            = 43
	errUnexpectedCharInListValue      = 44
	errExpectedCommaOrListEnd         = 46
	errExpectedListStartAfterIn       = 47
	errExpectedValueAfterKeyword      = 50
	errNullNotAllowedWithOperator     = 51
	errKeyParseFailed                 = 60
	errUnknownFunction                = 70
	errInvalidFunctionArgs            = 71
	errFunctionNotAllowedWithOperator = 72
	errInvalidDuration                = 73
	errEmptyParameterName             = 74
	errInvalidParameterName           = 75
	errParameterZeroIndex             = 76
	errMaxDepthExceeded               = 78
)

// coreParserMessages maps core_parser errnos to canonical messages.
var coreParserMessages = map[int]string{
	errInvalidCharInitial:             "invalid character",
	errInvalidCharInValue:             "invalid character",
	errInvalidCharInKey:               "invalid character",
	errInvalidCharInKeyValueOperator:  "invalid character",
	errInvalidCharInParameterName:     "invalid character in parameter name",
	errUnclosedString:                 "unclosed string",
	errExpectedKeywordAfterNot:        "expected keyword after 'not'",
	errUnmatchedParenInExpr:           "unmatched parenthesis",
	errUnknownOperator:                "unknown operator",
	errUnmatchedParenInBoolDelim:      "unmatched parenthesis",
	errInvalidCharInBoolDelim:         "invalid character",
	errUnmatchedParenInExpectBool:     "unmatched parenthesis",
	errInvalidCharInExpectBool:        "invalid character",
	errExpectedDelimAfterBoolOp:       "expected delimiter after bool operator",
	errEmptyInput:                     "empty input",
	errUnexpectedEof:                  "unexpected EOF",
	errUnexpectedEofInKey:             "unexpected EOF",
	errUnmatchedParenAtEof:            "unmatched parenthesis",
	errExpectedValue:                  "expected value",
	errExpectedOperatorOrBoolOp:       "expected operator or boolean operator",
	errExpectedKeyOrParenAfterNot:     "expected key or ( after 'not'",
	errExpectedNotOrInKeyword:         "expected 'not' or 'in' keyword",
	errExpectedListStart:              "expected '['",
	errExpectedValueInList:            "expected value in list",
	errUnexpectedCharInListValue:      "unexpected character in list value",
	errExpectedCommaOrListEnd:         "expected ',' or ']'",
	errExpectedListStartAfterIn:       "expected '[' after 'in'",
	errExpectedValueAfterKeyword:      "expected value or keyword",
	errNullNotAllowedWithOperator:     "null value cannot be used with operator",
	errKeyParseFailed:                 "key parsing failed",
	errUnknownFunction:                "unknown function",
	errInvalidFunctionArgs:            "invalid function argument",
	errFunctionNotAllowedWithOperator: "function not allowed with operator",
	errInvalidDuration:                "invalid duration",
	errEmptyParameterName:             "empty parameter name",
	errInvalidParameterName:           "invalid parameter name",
	errParameterZeroIndex:             "positional parameters are 1-indexed",
	errMaxDepthExceeded:               "maximum nesting depth exceeded",
}

// coreParserRegistry maps core_parser errnos to ErrorEntry records.
var coreParserRegistry = map[int]ErrorEntry{
	errInvalidCharInitial:             {Code: errInvalidCharInitial, Name: "ERR_INVALID_CHAR_INITIAL", Message: "invalid character", Description: "Invalid character at the start of input (state INITIAL). Narrowed from the former dual-purpose ERR_UNKNOWN_STATE; the former state-dispatch fallthrough site is now an internal assertion.", DynamicMessage: false},
	errInvalidCharInValue:             {Code: errInvalidCharInValue, Name: "ERR_INVALID_CHAR_IN_VALUE", Message: "invalid character", Description: "Invalid character while parsing an unquoted value (in_state_value). Split off from ERR_UNKNOWN_OPERATOR (formerly errno 10).", DynamicMessage: false},
	errInvalidCharInKey:               {Code: errInvalidCharInKey, Name: "ERR_INVALID_CHAR_IN_KEY", Message: "invalid character", Description: "", DynamicMessage: false},
	errInvalidCharInKeyValueOperator:  {Code: errInvalidCharInKeyValueOperator, Name: "ERR_INVALID_CHAR_IN_KEY_VALUE_OPERATOR", Message: "invalid character", Description: "", DynamicMessage: false},
	errInvalidCharInParameterName:     {Code: errInvalidCharInParameterName, Name: "ERR_INVALID_CHAR_IN_PARAMETER_NAME", Message: "invalid character in parameter name", Description: "Invalid character while parsing a parameter name; covers regular-value, in-list, and function-call contexts. Consolidates sites previously split between ERR_UNKNOWN_OPERATOR (errno 10) and ERR_INVALID_FUNCTION_ARGS (errno 71) that emitted the identical message.", DynamicMessage: false},
	errUnclosedString:                 {Code: errUnclosedString, Name: "ERR_UNCLOSED_STRING", Message: "unclosed string", Description: "EOF reached inside a single- or double-quoted value. Split off from the former dual-purpose ERR_EXPECTED_OPERATOR_OR_UNCLOSED_STRING (errno 28).", DynamicMessage: false},
	errExpectedKeywordAfterNot:        {Code: errExpectedKeywordAfterNot, Name: "ERR_EXPECTED_KEYWORD_AFTER_NOT", Message: "expected keyword after 'not'", Description: "Emitted when a 'not' prefix is followed by a token that is neither 'has' nor 'like'/'ilike'. Dynamic message names the expected keyword ('has' vs 'like or ilike'). Split off from the former ERR_EXPECTED_VALUE_OR_KEYWORD (errno 50).", DynamicMessage: true},
	errUnmatchedParenInExpr:           {Code: errUnmatchedParenInExpr, Name: "ERR_UNMATCHED_PAREN_IN_EXPR", Message: "unmatched parenthesis", Description: "", DynamicMessage: false},
	errUnknownOperator:                {Code: errUnknownOperator, Name: "ERR_UNKNOWN_OPERATOR", Message: "unknown operator", Description: "Unknown key-value operator. Emitted from 5 in_state_key_value_operator sites (==, !==, =!, =<, =>-style typos). Narrowed from the former dual-purpose ERR_INVALID_CHAR_OR_UNKNOWN_OPERATOR; invalid-character sites were split off to ERR_INVALID_CHAR_IN_VALUE (errno 2) and ERR_INVALID_CHAR_IN_PARAMETER_NAME (errno 5).", DynamicMessage: false},
	errUnmatchedParenInBoolDelim:      {Code: errUnmatchedParenInBoolDelim, Name: "ERR_UNMATCHED_PAREN_IN_BOOL_DELIM", Message: "unmatched parenthesis", Description: "", DynamicMessage: false},
	errInvalidCharInBoolDelim:         {Code: errInvalidCharInBoolDelim, Name: "ERR_INVALID_CHAR_IN_BOOL_DELIM", Message: "invalid character", Description: "", DynamicMessage: false},
	errUnmatchedParenInExpectBool:     {Code: errUnmatchedParenInExpectBool, Name: "ERR_UNMATCHED_PAREN_IN_EXPECT_BOOL", Message: "unmatched parenthesis", Description: "", DynamicMessage: false},
	errInvalidCharInExpectBool:        {Code: errInvalidCharInExpectBool, Name: "ERR_INVALID_CHAR_IN_EXPECT_BOOL", Message: "invalid character", Description: "", DynamicMessage: false},
	errExpectedDelimAfterBoolOp:       {Code: errExpectedDelimAfterBoolOp, Name: "ERR_EXPECTED_DELIM_AFTER_BOOL_OP", Message: "expected delimiter after bool operator", Description: "", DynamicMessage: false},
	errEmptyInput:                     {Code: errEmptyInput, Name: "ERR_EMPTY_INPUT", Message: "empty input", Description: "", DynamicMessage: false},
	errUnexpectedEof:                  {Code: errUnexpectedEof, Name: "ERR_UNEXPECTED_EOF", Message: "unexpected EOF", Description: "EOF reached in a state that cannot terminate cleanly; the message may specify context (e.g. \"unexpected EOF after 'not'\").", DynamicMessage: true},
	errUnexpectedEofInKey:             {Code: errUnexpectedEofInKey, Name: "ERR_UNEXPECTED_EOF_IN_KEY", Message: "unexpected EOF", Description: "", DynamicMessage: false},
	errUnmatchedParenAtEof:            {Code: errUnmatchedParenAtEof, Name: "ERR_UNMATCHED_PAREN_AT_EOF", Message: "unmatched parenthesis", Description: "", DynamicMessage: false},
	errExpectedValue:                  {Code: errExpectedValue, Name: "ERR_EXPECTED_VALUE", Message: "expected value", Description: "", DynamicMessage: false},
	errExpectedOperatorOrBoolOp:       {Code: errExpectedOperatorOrBoolOp, Name: "ERR_EXPECTED_OPERATOR_OR_BOOL_OP", Message: "expected operator or boolean operator", Description: "", DynamicMessage: false},
	errExpectedKeyOrParenAfterNot:     {Code: errExpectedKeyOrParenAfterNot, Name: "ERR_EXPECTED_KEY_OR_PAREN_AFTER_NOT", Message: "expected key or ( after 'not'", Description: "", DynamicMessage: false},
	errExpectedNotOrInKeyword:         {Code: errExpectedNotOrInKeyword, Name: "ERR_EXPECTED_NOT_OR_IN_KEYWORD", Message: "expected 'not' or 'in' keyword", Description: "Emitted while parsing the 'not' / 'not in' prefix at 3 user-reachable sites — \"expected 'not' or 'in' keyword\", \"expected 'not' keyword\", \"expected space after 'not'\". All three share the same user fix (write a valid 'not in' prefix or drop it); dynamic_message identifies which token was wrong. The former else-branch site in expect_in_keyword is unreachable and is now an internal assertion.", DynamicMessage: true},
	errExpectedListStart:              {Code: errExpectedListStart, Name: "ERR_EXPECTED_LIST_START", Message: "expected '['", Description: "", DynamicMessage: false},
	errExpectedValueInList:            {Code: errExpectedValueInList, Name: "ERR_EXPECTED_VALUE_IN_LIST", Message: "expected value in list", Description: "", DynamicMessage: false},
	errUnexpectedCharInListValue:      {Code: errUnexpectedCharInListValue, Name: "ERR_UNEXPECTED_CHAR_IN_LIST_VALUE", Message: "unexpected character in list value", Description: "", DynamicMessage: false},
	errExpectedCommaOrListEnd:         {Code: errExpectedCommaOrListEnd, Name: "ERR_EXPECTED_COMMA_OR_LIST_END", Message: "expected ',' or ']'", Description: "", DynamicMessage: false},
	errExpectedListStartAfterIn:       {Code: errExpectedListStartAfterIn, Name: "ERR_EXPECTED_LIST_START_AFTER_IN", Message: "expected '[' after 'in'", Description: "", DynamicMessage: false},
	errExpectedValueAfterKeyword:      {Code: errExpectedValueAfterKeyword, Name: "ERR_EXPECTED_VALUE_AFTER_KEYWORD", Message: "expected value or keyword", Description: "Emitted for 6 sites — 'expected value after has/like/ilike' (with and without 'not' prefix). All share the same user meaning (value omitted after a keyword operator); the dynamic message identifies which keyword. The 2 former 'expected has/like keyword' sites were split off to ERR_EXPECTED_KEYWORD_AFTER_NOT (errno 7).", DynamicMessage: true},
	errNullNotAllowedWithOperator:     {Code: errNullNotAllowedWithOperator, Name: "ERR_NULL_NOT_ALLOWED_WITH_OPERATOR", Message: "null value cannot be used with operator", Description: "", DynamicMessage: true},
	errKeyParseFailed:                 {Code: errKeyParseFailed, Name: "ERR_KEY_PARSE_FAILED", Message: "key parsing failed", Description: "Wraps a KeyParseError raised by the key parser; the surfaced message is propagated from the wrapped exception.", DynamicMessage: true},
	errUnknownFunction:                {Code: errUnknownFunction, Name: "ERR_UNKNOWN_FUNCTION", Message: "unknown function", Description: "", DynamicMessage: true},
	errInvalidFunctionArgs:            {Code: errInvalidFunctionArgs, Name: "ERR_INVALID_FUNCTION_ARGS", Message: "invalid function argument", Description: "Function-call argument syntax error. 4 remaining sites all share 'function call syntax error' semantics with contextual messages. The 'invalid character in parameter name' site was moved to ERR_INVALID_CHAR_IN_PARAMETER_NAME (errno 5) to eliminate a cross-errno message collision.", DynamicMessage: true},
	errFunctionNotAllowedWithOperator: {Code: errFunctionNotAllowedWithOperator, Name: "ERR_FUNCTION_NOT_ALLOWED_WITH_OPERATOR", Message: "function not allowed with operator", Description: "", DynamicMessage: true},
	errInvalidDuration:                {Code: errInvalidDuration, Name: "ERR_INVALID_DURATION", Message: "invalid duration", Description: "", DynamicMessage: true},
	errEmptyParameterName:             {Code: errEmptyParameterName, Name: "ERR_EMPTY_PARAMETER_NAME", Message: "empty parameter name", Description: "", DynamicMessage: false},
	errInvalidParameterName:           {Code: errInvalidParameterName, Name: "ERR_INVALID_PARAMETER_NAME", Message: "invalid parameter name", Description: "", DynamicMessage: false},
	errParameterZeroIndex:             {Code: errParameterZeroIndex, Name: "ERR_PARAMETER_ZERO_INDEX", Message: "positional parameters are 1-indexed", Description: "", DynamicMessage: false},
	errMaxDepthExceeded:               {Code: errMaxDepthExceeded, Name: "ERR_MAX_DEPTH_EXCEEDED", Message: "maximum nesting depth exceeded", Description: "", DynamicMessage: true},
}

// Validator diagnostic codes (excluding renderer codes which live in package columns).
const (
	CodeArgCount               = "arg_count"
	CodeArgType                = "arg_type"
	CodeChainType              = "chain_type"
	CodeInvalidAST             = "invalid_ast"
	CodeInvalidColumnValue     = "invalid_column_value"
	CodeInvalidDatetimeLiteral = "invalid_datetime_literal"
	CodeUnknownColumn          = "unknown_column"
	CodeUnknownColumnValue     = "unknown_column_value"
	CodeUnknownTransformer     = "unknown_transformer"
)

// validatorMessages maps non-renderer validator codes to canonical messages.
var validatorMessages = map[string]string{
	CodeArgCount:               "transformer argument count mismatch",
	CodeArgType:                "transformer argument type mismatch",
	CodeChainType:              "transformer chain type mismatch",
	CodeInvalidAST:             "invalid AST",
	CodeInvalidColumnValue:     "invalid column value",
	CodeInvalidDatetimeLiteral: "invalid datetime literal",
	CodeUnknownColumn:          "unknown column",
	CodeUnknownColumnValue:     "unknown column value",
	CodeUnknownTransformer:     "unknown transformer",
}

// validatorRegistry maps non-renderer validator codes to ErrorEntry records.
var validatorRegistry = map[string]ErrorEntry{
	CodeArgCount:               {Code: CodeArgCount, Name: "CODE_ARG_COUNT", Message: "transformer argument count mismatch", Description: "", DynamicMessage: false},
	CodeArgType:                {Code: CodeArgType, Name: "CODE_ARG_TYPE", Message: "transformer argument type mismatch", Description: "", DynamicMessage: false},
	CodeChainType:              {Code: CodeChainType, Name: "CODE_CHAIN_TYPE", Message: "transformer chain type mismatch", Description: "", DynamicMessage: false},
	CodeInvalidAST:             {Code: CodeInvalidAST, Name: "CODE_INVALID_AST", Message: "invalid AST", Description: "", DynamicMessage: false},
	CodeInvalidColumnValue:     {Code: CodeInvalidColumnValue, Name: "CODE_INVALID_COLUMN_VALUE", Message: "invalid column value", Description: "", DynamicMessage: false},
	CodeInvalidDatetimeLiteral: {Code: CodeInvalidDatetimeLiteral, Name: "CODE_INVALID_DATETIME_LITERAL", Message: "invalid datetime literal", Description: "Emitted when a string literal compared against a Date or DateTime column cannot be parsed as iso8601. Severity (warning) is decided at the validator emission site (see Decision 8); not a registry field.", DynamicMessage: false},
	CodeUnknownColumn:          {Code: CodeUnknownColumn, Name: "CODE_UNKNOWN_COLUMN", Message: "unknown column", Description: "", DynamicMessage: false},
	CodeUnknownColumnValue:     {Code: CodeUnknownColumnValue, Name: "CODE_UNKNOWN_COLUMN_VALUE", Message: "unknown column value", Description: "", DynamicMessage: false},
	CodeUnknownTransformer:     {Code: CodeUnknownTransformer, Name: "CODE_UNKNOWN_TRANSFORMER", Message: "unknown transformer", Description: "", DynamicMessage: false},
}

// matcher diagnostic codes (string). Python-only in practice; shipped in all languages for registry parity.
const (
	errRe2Missing = "re2_missing"
)

// matcherMessages maps matcher codes to canonical messages.
var matcherMessages = map[string]string{
	errRe2Missing: "regex matching requires the [re2] extra",
}
