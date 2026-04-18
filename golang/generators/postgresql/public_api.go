package postgresql

// PublicSymbols is the canonical manifest of names this package exports.
// See golang/public_api_test.go for the cross-language surface check.
var PublicSymbols = []string{
	"Column",
	"ColumnDef",
	"EscapeIdentifier",
	"EscapeParam",
	"ExpressionToSQL",
	"ExpressionToSQLWithOptions",
	"GeneratorOptions",
	"IsNumber",
	"NewColumn",
	"NewGeneratorOptions",
	"NormalizePostgreSQLType",
	"SelectColumn",
	"SelectResult",
	"ToFlyQLSchema",
	"ToSQLSelect",
	"ToSQLWhere",
	"ToSQLWhereWithOptions",
	"ValidateInListTypes",
	"ValidateOperation",
}
