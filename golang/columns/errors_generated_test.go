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

var generatedColumnsParserRegistry = map[string]ErrorEntry{
	"COLUMNS_ERR_INVALID_CHAR_EXPECT_COLUMN":            {Code: columnsErrInvalidCharExpectColumn, Name: "COLUMNS_ERR_INVALID_CHAR_EXPECT_COLUMN", Message: "invalid character", Description: "", DynamicMessage: false},
	"COLUMNS_ERR_INVALID_CHAR_EXPECT_ALIAS_OPERATOR":    {Code: columnsErrInvalidCharExpectAliasOperator, Name: "COLUMNS_ERR_INVALID_CHAR_EXPECT_ALIAS_OPERATOR", Message: "invalid character", Description: "", DynamicMessage: false},
	"COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_OPERATOR":  {Code: columnsErrInvalidCharExpectedAliasOperator, Name: "COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_OPERATOR", Message: "invalid character, expected alias operator", Description: "", DynamicMessage: false},
	"COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_DELIMITER": {Code: columnsErrInvalidCharExpectedAliasDelimiter, Name: "COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_DELIMITER", Message: "invalid character, expected alias delimiter", Description: "", DynamicMessage: false},
	"COLUMNS_ERR_INVALID_CHAR_IN_COLUMN":                {Code: columnsErrInvalidCharInColumn, Name: "COLUMNS_ERR_INVALID_CHAR_IN_COLUMN", Message: "invalid character", Description: "", DynamicMessage: false},
	"COLUMNS_ERR_INVALID_TRANSFORMER_OR_RENDERER":       {Code: columnsErrInvalidTransformerOrRenderer, Name: "COLUMNS_ERR_INVALID_TRANSFORMER_OR_RENDERER", Message: "invalid transformer or renderer", Description: "Emitted at multiple sites: 'expected transformer after operator', 'expected renderer after operator', 'invalid character, expected transformer', 'invalid character, expected renderer', 'invalid character in renderer name'.", DynamicMessage: true},
	"COLUMNS_ERR_INVALID_CHAR_AFTER_ARGS":               {Code: columnsErrInvalidCharAfterArgs, Name: "COLUMNS_ERR_INVALID_CHAR_AFTER_ARGS", Message: "invalid character", Description: "", DynamicMessage: false},
	"COLUMNS_ERR_INVALID_CHAR_IN_ARGS":                  {Code: columnsErrInvalidCharInArgs, Name: "COLUMNS_ERR_INVALID_CHAR_IN_ARGS", Message: "invalid character", Description: "Emitted for 'invalid character. Expected bracket close or transformer/renderer argument delimiter'.", DynamicMessage: true},
	"COLUMNS_ERR_RENDERERS_NOT_ENABLED":                 {Code: columnsErrRenderersNotEnabled, Name: "COLUMNS_ERR_RENDERERS_NOT_ENABLED", Message: "renderers are not enabled", Description: "Renderer syntax encountered while the renderers capability is disabled. Narrowed from the former dual-purpose COLUMNS_ERR_RENDERERS_NOT_ENABLED_OR_NO_ALIAS; the 'renderers require an alias' site was split off to COLUMNS_ERR_RENDERER_REQUIRES_ALIAS (errno 18).", DynamicMessage: false},
	"COLUMNS_ERR_UNEXPECTED_END_OF_QUOTED_ARG":          {Code: columnsErrUnexpectedEndOfQuotedArg, Name: "COLUMNS_ERR_UNEXPECTED_END_OF_QUOTED_ARG", Message: "unexpected end of quoted argument value", Description: "", DynamicMessage: false},
	"COLUMNS_ERR_UNEXPECTED_END_OF_ALIAS_OPERATOR":      {Code: columnsErrUnexpectedEndOfAliasOperator, Name: "COLUMNS_ERR_UNEXPECTED_END_OF_ALIAS_OPERATOR", Message: "unexpected end of alias. Expected alias value", Description: "", DynamicMessage: false},
	"COLUMNS_ERR_UNEXPECTED_END_EXPECTED_ALIAS_VALUE":   {Code: columnsErrUnexpectedEndExpectedAliasValue, Name: "COLUMNS_ERR_UNEXPECTED_END_EXPECTED_ALIAS_VALUE", Message: "unexpected end of alias. Expected alias value", Description: "", DynamicMessage: false},
	"COLUMNS_ERR_UNEXPECTED_END_OF_ARGS_LIST":           {Code: columnsErrUnexpectedEndOfArgsList, Name: "COLUMNS_ERR_UNEXPECTED_END_OF_ARGS_LIST", Message: "unexpected end of arguments list", Description: "", DynamicMessage: false},
	"COLUMNS_ERR_EXPECTED_CLOSING_PAREN":                {Code: columnsErrExpectedClosingParen, Name: "COLUMNS_ERR_EXPECTED_CLOSING_PAREN", Message: "expected closing parenthesis", Description: "", DynamicMessage: false},
	"COLUMNS_ERR_TRANSFORMERS_NOT_ENABLED":              {Code: columnsErrTransformersNotEnabled, Name: "COLUMNS_ERR_TRANSFORMERS_NOT_ENABLED", Message: "transformers are not enabled", Description: "", DynamicMessage: false},
	"COLUMNS_ERR_RENDERER_REQUIRES_ALIAS":               {Code: columnsErrRendererRequiresAlias, Name: "COLUMNS_ERR_RENDERER_REQUIRES_ALIAS", Message: "renderers require an alias", Description: "A column used renderer syntax but no alias was declared. Split off from the former dual-purpose COLUMNS_ERR_RENDERERS_NOT_ENABLED_OR_NO_ALIAS (errno 11).", DynamicMessage: false},
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

var generatedRendererValidatorRegistry = map[string]ErrorEntry{
	"CODE_RENDERER_ARG_COUNT": {Code: CodeRendererArgCount, Name: "CODE_RENDERER_ARG_COUNT", Message: "renderer argument count mismatch", Description: "", DynamicMessage: false},
	"CODE_RENDERER_ARG_TYPE":  {Code: CodeRendererArgType, Name: "CODE_RENDERER_ARG_TYPE", Message: "renderer argument type mismatch", Description: "", DynamicMessage: false},
	"CODE_UNKNOWN_RENDERER":   {Code: CodeUnknownRenderer, Name: "CODE_UNKNOWN_RENDERER", Message: "unknown renderer", Description: "", DynamicMessage: false},
}
