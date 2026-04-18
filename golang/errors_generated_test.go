// Code generated from errors/registry.json — DO NOT EDIT.
// Run `make generate-errors` at the repo root to regenerate.
// Source: errors/registry.json

package flyql

var generatedCoreParserConstants = map[string]int{
	"ERR_INVALID_CHAR_INITIAL":               errInvalidCharInitial,
	"ERR_INVALID_CHAR_IN_VALUE":              errInvalidCharInValue,
	"ERR_INVALID_CHAR_IN_KEY":                errInvalidCharInKey,
	"ERR_INVALID_CHAR_IN_KEY_VALUE_OPERATOR": errInvalidCharInKeyValueOperator,
	"ERR_INVALID_CHAR_IN_PARAMETER_NAME":     errInvalidCharInParameterName,
	"ERR_UNCLOSED_STRING":                    errUnclosedString,
	"ERR_EXPECTED_KEYWORD_AFTER_NOT":         errExpectedKeywordAfterNot,
	"ERR_UNMATCHED_PAREN_IN_EXPR":            errUnmatchedParenInExpr,
	"ERR_UNKNOWN_OPERATOR":                   errUnknownOperator,
	"ERR_UNMATCHED_PAREN_IN_BOOL_DELIM":      errUnmatchedParenInBoolDelim,
	"ERR_INVALID_CHAR_IN_BOOL_DELIM":         errInvalidCharInBoolDelim,
	"ERR_UNMATCHED_PAREN_IN_EXPECT_BOOL":     errUnmatchedParenInExpectBool,
	"ERR_INVALID_CHAR_IN_EXPECT_BOOL":        errInvalidCharInExpectBool,
	"ERR_EXPECTED_DELIM_AFTER_BOOL_OP":       errExpectedDelimAfterBoolOp,
	"ERR_EMPTY_INPUT":                        errEmptyInput,
	"ERR_UNEXPECTED_EOF":                     errUnexpectedEof,
	"ERR_UNEXPECTED_EOF_IN_KEY":              errUnexpectedEofInKey,
	"ERR_UNMATCHED_PAREN_AT_EOF":             errUnmatchedParenAtEof,
	"ERR_EXPECTED_VALUE":                     errExpectedValue,
	"ERR_EXPECTED_OPERATOR_OR_BOOL_OP":       errExpectedOperatorOrBoolOp,
	"ERR_EXPECTED_KEY_OR_PAREN_AFTER_NOT":    errExpectedKeyOrParenAfterNot,
	"ERR_EXPECTED_NOT_OR_IN_KEYWORD":         errExpectedNotOrInKeyword,
	"ERR_EXPECTED_LIST_START":                errExpectedListStart,
	"ERR_EXPECTED_VALUE_IN_LIST":             errExpectedValueInList,
	"ERR_UNEXPECTED_CHAR_IN_LIST_VALUE":      errUnexpectedCharInListValue,
	"ERR_EXPECTED_COMMA_OR_LIST_END":         errExpectedCommaOrListEnd,
	"ERR_EXPECTED_LIST_START_AFTER_IN":       errExpectedListStartAfterIn,
	"ERR_EXPECTED_VALUE_AFTER_KEYWORD":       errExpectedValueAfterKeyword,
	"ERR_NULL_NOT_ALLOWED_WITH_OPERATOR":     errNullNotAllowedWithOperator,
	"ERR_KEY_PARSE_FAILED":                   errKeyParseFailed,
	"ERR_UNKNOWN_FUNCTION":                   errUnknownFunction,
	"ERR_INVALID_FUNCTION_ARGS":              errInvalidFunctionArgs,
	"ERR_FUNCTION_NOT_ALLOWED_WITH_OPERATOR": errFunctionNotAllowedWithOperator,
	"ERR_INVALID_DURATION":                   errInvalidDuration,
	"ERR_EMPTY_PARAMETER_NAME":               errEmptyParameterName,
	"ERR_INVALID_PARAMETER_NAME":             errInvalidParameterName,
	"ERR_PARAMETER_ZERO_INDEX":               errParameterZeroIndex,
	"ERR_MAX_DEPTH_EXCEEDED":                 errMaxDepthExceeded,
}

var generatedCoreParserMessages = map[string]string{
	"ERR_INVALID_CHAR_INITIAL":               "invalid character",
	"ERR_INVALID_CHAR_IN_VALUE":              "invalid character",
	"ERR_INVALID_CHAR_IN_KEY":                "invalid character",
	"ERR_INVALID_CHAR_IN_KEY_VALUE_OPERATOR": "invalid character",
	"ERR_INVALID_CHAR_IN_PARAMETER_NAME":     "invalid character in parameter name",
	"ERR_UNCLOSED_STRING":                    "unclosed string",
	"ERR_EXPECTED_KEYWORD_AFTER_NOT":         "expected keyword after 'not'",
	"ERR_UNMATCHED_PAREN_IN_EXPR":            "unmatched parenthesis",
	"ERR_UNKNOWN_OPERATOR":                   "unknown operator",
	"ERR_UNMATCHED_PAREN_IN_BOOL_DELIM":      "unmatched parenthesis",
	"ERR_INVALID_CHAR_IN_BOOL_DELIM":         "invalid character",
	"ERR_UNMATCHED_PAREN_IN_EXPECT_BOOL":     "unmatched parenthesis",
	"ERR_INVALID_CHAR_IN_EXPECT_BOOL":        "invalid character",
	"ERR_EXPECTED_DELIM_AFTER_BOOL_OP":       "expected delimiter after bool operator",
	"ERR_EMPTY_INPUT":                        "empty input",
	"ERR_UNEXPECTED_EOF":                     "unexpected EOF",
	"ERR_UNEXPECTED_EOF_IN_KEY":              "unexpected EOF",
	"ERR_UNMATCHED_PAREN_AT_EOF":             "unmatched parenthesis",
	"ERR_EXPECTED_VALUE":                     "expected value",
	"ERR_EXPECTED_OPERATOR_OR_BOOL_OP":       "expected operator or boolean operator",
	"ERR_EXPECTED_KEY_OR_PAREN_AFTER_NOT":    "expected key or ( after 'not'",
	"ERR_EXPECTED_NOT_OR_IN_KEYWORD":         "expected 'not' or 'in' keyword",
	"ERR_EXPECTED_LIST_START":                "expected '['",
	"ERR_EXPECTED_VALUE_IN_LIST":             "expected value in list",
	"ERR_UNEXPECTED_CHAR_IN_LIST_VALUE":      "unexpected character in list value",
	"ERR_EXPECTED_COMMA_OR_LIST_END":         "expected ',' or ']'",
	"ERR_EXPECTED_LIST_START_AFTER_IN":       "expected '[' after 'in'",
	"ERR_EXPECTED_VALUE_AFTER_KEYWORD":       "expected value or keyword",
	"ERR_NULL_NOT_ALLOWED_WITH_OPERATOR":     "null value cannot be used with operator",
	"ERR_KEY_PARSE_FAILED":                   "key parsing failed",
	"ERR_UNKNOWN_FUNCTION":                   "unknown function",
	"ERR_INVALID_FUNCTION_ARGS":              "invalid function argument",
	"ERR_FUNCTION_NOT_ALLOWED_WITH_OPERATOR": "function not allowed with operator",
	"ERR_INVALID_DURATION":                   "invalid duration",
	"ERR_EMPTY_PARAMETER_NAME":               "empty parameter name",
	"ERR_INVALID_PARAMETER_NAME":             "invalid parameter name",
	"ERR_PARAMETER_ZERO_INDEX":               "positional parameters are 1-indexed",
	"ERR_MAX_DEPTH_EXCEEDED":                 "maximum nesting depth exceeded",
}

var generatedValidatorConstants = map[string]string{
	"CODE_ARG_COUNT":            CodeArgCount,
	"CODE_ARG_TYPE":             CodeArgType,
	"CODE_CHAIN_TYPE":           CodeChainType,
	"CODE_INVALID_AST":          CodeInvalidAST,
	"CODE_INVALID_COLUMN_VALUE": CodeInvalidColumnValue,
	"CODE_UNKNOWN_COLUMN":       CodeUnknownColumn,
	"CODE_UNKNOWN_COLUMN_VALUE": CodeUnknownColumnValue,
	"CODE_UNKNOWN_TRANSFORMER":  CodeUnknownTransformer,
}

var generatedValidatorMessages = map[string]string{
	"CODE_ARG_COUNT":            "transformer argument count mismatch",
	"CODE_ARG_TYPE":             "transformer argument type mismatch",
	"CODE_CHAIN_TYPE":           "transformer chain type mismatch",
	"CODE_INVALID_AST":          "invalid AST",
	"CODE_INVALID_COLUMN_VALUE": "invalid column value",
	"CODE_UNKNOWN_COLUMN":       "unknown column",
	"CODE_UNKNOWN_COLUMN_VALUE": "unknown column value",
	"CODE_UNKNOWN_TRANSFORMER":  "unknown transformer",
}

var generatedMatcherConstants = map[string]string{
	"ERR_RE2_MISSING": errRe2Missing,
}

var generatedMatcherMessages = map[string]string{
	"ERR_RE2_MISSING": "regex matching requires the [re2] extra",
}
