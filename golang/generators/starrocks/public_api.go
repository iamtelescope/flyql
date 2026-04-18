package starrocks

// PublicSymbols is the canonical manifest of names this package exports.
// See golang/public_api_test.go for the cross-language surface check.
var PublicSymbols = []string{
	"Column",
	"ColumnDef",
	"EscapeParam",
	"ExpressionToSQL",
	"ExpressionToSQLWithOptions",
	"GeneratorOptions",
	"IsNumber",
	"NewColumn",
	"NewGeneratorOptions",
	"NormalizeStarRocksType",
	"QuoteJSONPathPart",
	"SelectColumn",
	"SelectResult",
	"ToFlyQLSchema",
	"ToSQLSelect",
	"ToSQLWhere",
	"ToSQLWhereWithOptions",
	"ValidateInListTypes",
	"ValidateOperation",
}
