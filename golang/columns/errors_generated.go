// Code generated from errors/registry.json — DO NOT EDIT.
// Run `make generate-errors` at the repo root to regenerate.
// Source: errors/registry.json

package columns

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

// columns_parser errnos.
const (
	columnsErrInvalidCharExpectColumn           = 2
	columnsErrInvalidCharExpectAliasOperator    = 3
	columnsErrInvalidCharExpectedAliasOperator  = 4
	columnsErrInvalidCharExpectedAliasDelimiter = 5
	columnsErrInvalidCharInColumn               = 6
	columnsErrInvalidTransformerOrRenderer      = 7
	columnsErrInvalidCharAfterArgs              = 8
	columnsErrInvalidCharInArgs                 = 9
	columnsErrRenderersNotEnabled               = 11
	columnsErrUnexpectedEndOfQuotedArg          = 12
	columnsErrUnexpectedEndOfAliasOperator      = 13
	columnsErrUnexpectedEndExpectedAliasValue   = 14
	columnsErrUnexpectedEndOfArgsList           = 15
	columnsErrExpectedClosingParen              = 16
	columnsErrTransformersNotEnabled            = 17
	columnsErrRendererRequiresAlias             = 18
)

// columnsParserMessages maps columns_parser errnos to canonical messages.
var columnsParserMessages = map[int]string{
	columnsErrInvalidCharExpectColumn:           "invalid character",
	columnsErrInvalidCharExpectAliasOperator:    "invalid character",
	columnsErrInvalidCharExpectedAliasOperator:  "invalid character, expected alias operator",
	columnsErrInvalidCharExpectedAliasDelimiter: "invalid character, expected alias delimiter",
	columnsErrInvalidCharInColumn:               "invalid character",
	columnsErrInvalidTransformerOrRenderer:      "invalid transformer or renderer",
	columnsErrInvalidCharAfterArgs:              "invalid character",
	columnsErrInvalidCharInArgs:                 "invalid character",
	columnsErrRenderersNotEnabled:               "renderers are not enabled",
	columnsErrUnexpectedEndOfQuotedArg:          "unexpected end of quoted argument value",
	columnsErrUnexpectedEndOfAliasOperator:      "unexpected end of alias. Expected alias value",
	columnsErrUnexpectedEndExpectedAliasValue:   "unexpected end of alias. Expected alias value",
	columnsErrUnexpectedEndOfArgsList:           "unexpected end of arguments list",
	columnsErrExpectedClosingParen:              "expected closing parenthesis",
	columnsErrTransformersNotEnabled:            "transformers are not enabled",
	columnsErrRendererRequiresAlias:             "renderers require an alias",
}

// columnsParserRegistry maps columns_parser errnos to ErrorEntry records.
var columnsParserRegistry = map[int]ErrorEntry{
	columnsErrInvalidCharExpectColumn:           {Code: columnsErrInvalidCharExpectColumn, Name: "COLUMNS_ERR_INVALID_CHAR_EXPECT_COLUMN", Message: "invalid character", Description: "", DynamicMessage: false},
	columnsErrInvalidCharExpectAliasOperator:    {Code: columnsErrInvalidCharExpectAliasOperator, Name: "COLUMNS_ERR_INVALID_CHAR_EXPECT_ALIAS_OPERATOR", Message: "invalid character", Description: "", DynamicMessage: false},
	columnsErrInvalidCharExpectedAliasOperator:  {Code: columnsErrInvalidCharExpectedAliasOperator, Name: "COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_OPERATOR", Message: "invalid character, expected alias operator", Description: "", DynamicMessage: false},
	columnsErrInvalidCharExpectedAliasDelimiter: {Code: columnsErrInvalidCharExpectedAliasDelimiter, Name: "COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_DELIMITER", Message: "invalid character, expected alias delimiter", Description: "", DynamicMessage: false},
	columnsErrInvalidCharInColumn:               {Code: columnsErrInvalidCharInColumn, Name: "COLUMNS_ERR_INVALID_CHAR_IN_COLUMN", Message: "invalid character", Description: "", DynamicMessage: false},
	columnsErrInvalidTransformerOrRenderer:      {Code: columnsErrInvalidTransformerOrRenderer, Name: "COLUMNS_ERR_INVALID_TRANSFORMER_OR_RENDERER", Message: "invalid transformer or renderer", Description: "Emitted at multiple sites: 'expected transformer after operator', 'expected renderer after operator', 'invalid character, expected transformer', 'invalid character, expected renderer', 'invalid character in renderer name'.", DynamicMessage: true},
	columnsErrInvalidCharAfterArgs:              {Code: columnsErrInvalidCharAfterArgs, Name: "COLUMNS_ERR_INVALID_CHAR_AFTER_ARGS", Message: "invalid character", Description: "", DynamicMessage: false},
	columnsErrInvalidCharInArgs:                 {Code: columnsErrInvalidCharInArgs, Name: "COLUMNS_ERR_INVALID_CHAR_IN_ARGS", Message: "invalid character", Description: "Emitted for 'invalid character. Expected bracket close or transformer/renderer argument delimiter'.", DynamicMessage: true},
	columnsErrRenderersNotEnabled:               {Code: columnsErrRenderersNotEnabled, Name: "COLUMNS_ERR_RENDERERS_NOT_ENABLED", Message: "renderers are not enabled", Description: "Renderer syntax encountered while the renderers capability is disabled. Narrowed from the former dual-purpose COLUMNS_ERR_RENDERERS_NOT_ENABLED_OR_NO_ALIAS; the 'renderers require an alias' site was split off to COLUMNS_ERR_RENDERER_REQUIRES_ALIAS (errno 18).", DynamicMessage: false},
	columnsErrUnexpectedEndOfQuotedArg:          {Code: columnsErrUnexpectedEndOfQuotedArg, Name: "COLUMNS_ERR_UNEXPECTED_END_OF_QUOTED_ARG", Message: "unexpected end of quoted argument value", Description: "", DynamicMessage: false},
	columnsErrUnexpectedEndOfAliasOperator:      {Code: columnsErrUnexpectedEndOfAliasOperator, Name: "COLUMNS_ERR_UNEXPECTED_END_OF_ALIAS_OPERATOR", Message: "unexpected end of alias. Expected alias value", Description: "", DynamicMessage: false},
	columnsErrUnexpectedEndExpectedAliasValue:   {Code: columnsErrUnexpectedEndExpectedAliasValue, Name: "COLUMNS_ERR_UNEXPECTED_END_EXPECTED_ALIAS_VALUE", Message: "unexpected end of alias. Expected alias value", Description: "", DynamicMessage: false},
	columnsErrUnexpectedEndOfArgsList:           {Code: columnsErrUnexpectedEndOfArgsList, Name: "COLUMNS_ERR_UNEXPECTED_END_OF_ARGS_LIST", Message: "unexpected end of arguments list", Description: "", DynamicMessage: false},
	columnsErrExpectedClosingParen:              {Code: columnsErrExpectedClosingParen, Name: "COLUMNS_ERR_EXPECTED_CLOSING_PAREN", Message: "expected closing parenthesis", Description: "", DynamicMessage: false},
	columnsErrTransformersNotEnabled:            {Code: columnsErrTransformersNotEnabled, Name: "COLUMNS_ERR_TRANSFORMERS_NOT_ENABLED", Message: "transformers are not enabled", Description: "", DynamicMessage: false},
	columnsErrRendererRequiresAlias:             {Code: columnsErrRendererRequiresAlias, Name: "COLUMNS_ERR_RENDERER_REQUIRES_ALIAS", Message: "renderers require an alias", Description: "A column used renderer syntax but no alias was declared. Split off from the former dual-purpose COLUMNS_ERR_RENDERERS_NOT_ENABLED_OR_NO_ALIAS (errno 11).", DynamicMessage: false},
}

// Renderer diagnostic codes (moved from package flyql; renderers are a columns feature).
const (
	CodeRendererArgCount = "renderer_arg_count"
	CodeRendererArgType  = "renderer_arg_type"
	CodeUnknownRenderer  = "unknown_renderer"
)

// rendererValidatorMessages maps renderer codes to canonical messages.
var rendererValidatorMessages = map[string]string{
	CodeRendererArgCount: "renderer argument count mismatch",
	CodeRendererArgType:  "renderer argument type mismatch",
	CodeUnknownRenderer:  "unknown renderer",
}

// rendererValidatorRegistry maps renderer codes to ErrorEntry records.
var rendererValidatorRegistry = map[string]ErrorEntry{
	CodeRendererArgCount: {Code: CodeRendererArgCount, Name: "CODE_RENDERER_ARG_COUNT", Message: "renderer argument count mismatch", Description: "", DynamicMessage: false},
	CodeRendererArgType:  {Code: CodeRendererArgType, Name: "CODE_RENDERER_ARG_TYPE", Message: "renderer argument type mismatch", Description: "", DynamicMessage: false},
	CodeUnknownRenderer:  {Code: CodeUnknownRenderer, Name: "CODE_UNKNOWN_RENDERER", Message: "unknown renderer", Description: "", DynamicMessage: false},
}
