// Code generated from errors/registry.json — DO NOT EDIT.
// Run `make generate-errors` at the repo root to regenerate.
// Source: errors/registry.json

package flyql

// core_parser errnos.
const (
	errUnknownState                     = 1
	errInvalidCharInKey                 = 3
	errInvalidCharInKeyValueOperator    = 4
	errUnmatchedParenInExpr             = 9
	errInvalidCharOrUnknownOperator     = 10
	errInvalidCharInQuotedValue         = 11
	errUnmatchedParenInBoolDelim        = 15
	errInvalidCharInBoolDelim           = 18
	errUnmatchedParenInExpectBool       = 19
	errInvalidCharInExpectBool          = 20
	errExpectedDelimAfterBoolOp         = 23
	errEmptyInput                       = 24
	errUnexpectedEof                    = 25
	errUnexpectedEofInKey               = 26
	errUnmatchedParenAtEof              = 27
	errExpectedOperatorOrUnclosedString = 28
	errExpectedValue                    = 29
	errInvalidCharInSingleQuotedKey     = 30
	errInvalidCharInDoubleQuotedKey     = 31
	errExpectedOperatorOrBoolOp         = 32
	errExpectedKeyOrParenAfterNot       = 33
	errExpectedNotOrInKeyword           = 41
	errExpectedListStart                = 42
	errExpectedValueInList              = 43
	errUnexpectedCharInListValue        = 44
	errInvalidCharInListQuotedValue     = 45
	errExpectedCommaOrListEnd           = 46
	errExpectedListStartAfterIn         = 47
	errExpectedValueOrKeyword           = 50
	errNullNotAllowedWithOperator       = 51
	errKeyParseFailed                   = 60
	errUnknownFunction                  = 70
	errInvalidFunctionArgs              = 71
	errFunctionNotAllowedWithOperator   = 72
	errInvalidDuration                  = 73
	errEmptyParameterName               = 74
	errInvalidParameterName             = 75
	errParameterZeroIndex               = 76
	errMaxDepthExceeded                 = 78
)

// coreParserMessages maps core_parser errnos to canonical messages.
var coreParserMessages = map[int]string{
	errUnknownState:                     "unknown parser state",
	errInvalidCharInKey:                 "invalid character",
	errInvalidCharInKeyValueOperator:    "invalid character",
	errUnmatchedParenInExpr:             "unmatched parenthesis",
	errInvalidCharOrUnknownOperator:     "invalid character or unknown operator",
	errInvalidCharInQuotedValue:         "invalid character",
	errUnmatchedParenInBoolDelim:        "unmatched parenthesis",
	errInvalidCharInBoolDelim:           "invalid character",
	errUnmatchedParenInExpectBool:       "unmatched parenthesis",
	errInvalidCharInExpectBool:          "invalid character",
	errExpectedDelimAfterBoolOp:         "expected delimiter after bool operator",
	errEmptyInput:                       "empty input",
	errUnexpectedEof:                    "unexpected EOF",
	errUnexpectedEofInKey:               "unexpected EOF",
	errUnmatchedParenAtEof:              "unmatched parenthesis",
	errExpectedOperatorOrUnclosedString: "expected operator or unclosed string",
	errExpectedValue:                    "expected value",
	errInvalidCharInSingleQuotedKey:     "invalid character in quoted key",
	errInvalidCharInDoubleQuotedKey:     "invalid character in quoted key",
	errExpectedOperatorOrBoolOp:         "expected operator or boolean operator",
	errExpectedKeyOrParenAfterNot:       "expected key or ( after 'not'",
	errExpectedNotOrInKeyword:           "expected 'not' or 'in' keyword",
	errExpectedListStart:                "expected '['",
	errExpectedValueInList:              "expected value in list",
	errUnexpectedCharInListValue:        "unexpected character in list value",
	errInvalidCharInListQuotedValue:     "invalid character in quoted value",
	errExpectedCommaOrListEnd:           "expected ',' or ']'",
	errExpectedListStartAfterIn:         "expected '[' after 'in'",
	errExpectedValueOrKeyword:           "expected value or keyword",
	errNullNotAllowedWithOperator:       "null value cannot be used with operator",
	errKeyParseFailed:                   "key parsing failed",
	errUnknownFunction:                  "unknown function",
	errInvalidFunctionArgs:              "invalid function argument",
	errFunctionNotAllowedWithOperator:   "function not allowed with operator",
	errInvalidDuration:                  "invalid duration",
	errEmptyParameterName:               "empty parameter name",
	errInvalidParameterName:             "invalid parameter name",
	errParameterZeroIndex:               "positional parameters are 1-indexed",
	errMaxDepthExceeded:                 "maximum nesting depth exceeded",
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
