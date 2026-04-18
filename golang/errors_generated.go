// Code generated from errors/registry.json — DO NOT EDIT.
// Run `make generate-errors` at the repo root to regenerate.
// Source: errors/registry.json

package flyql

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

// Validator diagnostic codes (excluding renderer codes which live in package columns).
const (
	CodeArgCount           = "arg_count"
	CodeArgType            = "arg_type"
	CodeChainType          = "chain_type"
	CodeInvalidAST         = "invalid_ast"
	CodeInvalidColumnValue = "invalid_column_value"
	CodeUnknownColumn      = "unknown_column"
	CodeUnknownColumnValue = "unknown_column_value"
	CodeUnknownTransformer = "unknown_transformer"
)

// validatorMessages maps non-renderer validator codes to canonical messages.
var validatorMessages = map[string]string{
	CodeArgCount:           "transformer argument count mismatch",
	CodeArgType:            "transformer argument type mismatch",
	CodeChainType:          "transformer chain type mismatch",
	CodeInvalidAST:         "invalid AST",
	CodeInvalidColumnValue: "invalid column value",
	CodeUnknownColumn:      "unknown column",
	CodeUnknownColumnValue: "unknown column value",
	CodeUnknownTransformer: "unknown transformer",
}

// matcher diagnostic codes (string). Python-only in practice; shipped in all languages for registry parity.
const (
	errRe2Missing = "re2_missing"
)

// matcherMessages maps matcher codes to canonical messages.
var matcherMessages = map[string]string{
	errRe2Missing: "regex matching requires the [re2] extra",
}
