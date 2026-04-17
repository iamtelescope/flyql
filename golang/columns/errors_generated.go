// Code generated from errors/registry.json — DO NOT EDIT.
// Run `make generate-errors` at the repo root to regenerate.
// Source: errors/registry.json

package columns

// columns_parser errnos.
const (
	columnsErrUnknownState                      = 1
	columnsErrInvalidCharExpectColumn           = 2
	columnsErrInvalidCharExpectAliasOperator    = 3
	columnsErrInvalidCharExpectedAliasOperator  = 4
	columnsErrInvalidCharExpectedAliasDelimiter = 5
	columnsErrInvalidCharInColumn               = 6
	columnsErrInvalidTransformerOrRenderer      = 7
	columnsErrInvalidCharAfterArgs              = 8
	columnsErrInvalidCharInArgs                 = 9
	columnsErrInvalidCharInQuotedArg            = 10
	columnsErrRenderersNotEnabledOrNoAlias      = 11
	columnsErrUnexpectedEndOfQuotedArg          = 12
	columnsErrUnexpectedEndOfAliasOperator      = 13
	columnsErrUnexpectedEndExpectedAliasValue   = 14
	columnsErrUnexpectedEndOfArgsList           = 15
	columnsErrExpectedClosingParen              = 16
	columnsErrTransformersNotEnabled            = 17
)

// columnsParserMessages maps columns_parser errnos to canonical messages.
var columnsParserMessages = map[int]string{
	columnsErrUnknownState:                      "unknown state",
	columnsErrInvalidCharExpectColumn:           "invalid character",
	columnsErrInvalidCharExpectAliasOperator:    "invalid character",
	columnsErrInvalidCharExpectedAliasOperator:  "invalid character, expected alias operator",
	columnsErrInvalidCharExpectedAliasDelimiter: "invalid character, expected alias delimiter",
	columnsErrInvalidCharInColumn:               "invalid character",
	columnsErrInvalidTransformerOrRenderer:      "invalid transformer or renderer",
	columnsErrInvalidCharAfterArgs:              "invalid character",
	columnsErrInvalidCharInArgs:                 "invalid character",
	columnsErrInvalidCharInQuotedArg:            "invalid character",
	columnsErrRenderersNotEnabledOrNoAlias:      "renderers not enabled or missing alias",
	columnsErrUnexpectedEndOfQuotedArg:          "unexpected end of quoted argument value",
	columnsErrUnexpectedEndOfAliasOperator:      "unexpected end of alias. Expected alias value",
	columnsErrUnexpectedEndExpectedAliasValue:   "unexpected end of alias. Expected alias value",
	columnsErrUnexpectedEndOfArgsList:           "unexpected end of arguments list",
	columnsErrExpectedClosingParen:              "expected closing parenthesis",
	columnsErrTransformersNotEnabled:            "transformers are not enabled",
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
