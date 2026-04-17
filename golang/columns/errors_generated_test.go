// Code generated from errors/registry.json — DO NOT EDIT.
// Run `make generate-errors` at the repo root to regenerate.
// Source: errors/registry.json

package columns

var generatedColumnsParserConstants = map[string]int{
	"COLUMNS_ERR_INVALID_CHAR_EXPECT_COLUMN":            columnsErrInvalidCharExpectColumn,
	"COLUMNS_ERR_INVALID_CHAR_EXPECT_ALIAS_OPERATOR":    columnsErrInvalidCharExpectAliasOperator,
	"COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_OPERATOR":  columnsErrInvalidCharExpectedAliasOperator,
	"COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_DELIMITER": columnsErrInvalidCharExpectedAliasDelimiter,
	"COLUMNS_ERR_INVALID_CHAR_IN_COLUMN":                columnsErrInvalidCharInColumn,
	"COLUMNS_ERR_INVALID_TRANSFORMER_OR_RENDERER":       columnsErrInvalidTransformerOrRenderer,
	"COLUMNS_ERR_INVALID_CHAR_AFTER_ARGS":               columnsErrInvalidCharAfterArgs,
	"COLUMNS_ERR_INVALID_CHAR_IN_ARGS":                  columnsErrInvalidCharInArgs,
	"COLUMNS_ERR_RENDERERS_NOT_ENABLED":                 columnsErrRenderersNotEnabled,
	"COLUMNS_ERR_UNEXPECTED_END_OF_QUOTED_ARG":          columnsErrUnexpectedEndOfQuotedArg,
	"COLUMNS_ERR_UNEXPECTED_END_OF_ALIAS_OPERATOR":      columnsErrUnexpectedEndOfAliasOperator,
	"COLUMNS_ERR_UNEXPECTED_END_EXPECTED_ALIAS_VALUE":   columnsErrUnexpectedEndExpectedAliasValue,
	"COLUMNS_ERR_UNEXPECTED_END_OF_ARGS_LIST":           columnsErrUnexpectedEndOfArgsList,
	"COLUMNS_ERR_EXPECTED_CLOSING_PAREN":                columnsErrExpectedClosingParen,
	"COLUMNS_ERR_TRANSFORMERS_NOT_ENABLED":              columnsErrTransformersNotEnabled,
	"COLUMNS_ERR_RENDERER_REQUIRES_ALIAS":               columnsErrRendererRequiresAlias,
}

var generatedColumnsParserMessages = map[string]string{
	"COLUMNS_ERR_INVALID_CHAR_EXPECT_COLUMN":            "invalid character",
	"COLUMNS_ERR_INVALID_CHAR_EXPECT_ALIAS_OPERATOR":    "invalid character",
	"COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_OPERATOR":  "invalid character, expected alias operator",
	"COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_DELIMITER": "invalid character, expected alias delimiter",
	"COLUMNS_ERR_INVALID_CHAR_IN_COLUMN":                "invalid character",
	"COLUMNS_ERR_INVALID_TRANSFORMER_OR_RENDERER":       "invalid transformer or renderer",
	"COLUMNS_ERR_INVALID_CHAR_AFTER_ARGS":               "invalid character",
	"COLUMNS_ERR_INVALID_CHAR_IN_ARGS":                  "invalid character",
	"COLUMNS_ERR_RENDERERS_NOT_ENABLED":                 "renderers are not enabled",
	"COLUMNS_ERR_UNEXPECTED_END_OF_QUOTED_ARG":          "unexpected end of quoted argument value",
	"COLUMNS_ERR_UNEXPECTED_END_OF_ALIAS_OPERATOR":      "unexpected end of alias. Expected alias value",
	"COLUMNS_ERR_UNEXPECTED_END_EXPECTED_ALIAS_VALUE":   "unexpected end of alias. Expected alias value",
	"COLUMNS_ERR_UNEXPECTED_END_OF_ARGS_LIST":           "unexpected end of arguments list",
	"COLUMNS_ERR_EXPECTED_CLOSING_PAREN":                "expected closing parenthesis",
	"COLUMNS_ERR_TRANSFORMERS_NOT_ENABLED":              "transformers are not enabled",
	"COLUMNS_ERR_RENDERER_REQUIRES_ALIAS":               "renderers require an alias",
}

var generatedRendererValidatorConstants = map[string]string{
	"CODE_RENDERER_ARG_COUNT": CodeRendererArgCount,
	"CODE_RENDERER_ARG_TYPE":  CodeRendererArgType,
	"CODE_UNKNOWN_RENDERER":   CodeUnknownRenderer,
}

var generatedRendererValidatorMessages = map[string]string{
	"CODE_RENDERER_ARG_COUNT": "renderer argument count mismatch",
	"CODE_RENDERER_ARG_TYPE":  "renderer argument type mismatch",
	"CODE_UNKNOWN_RENDERER":   "unknown renderer",
}
