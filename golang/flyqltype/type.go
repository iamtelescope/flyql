// Package flyqltype defines flyql.Type — the canonical, dialect-agnostic
// vocabulary for column and value types within flyql. It lives in a leaf
// subpackage so both the top-level flyql package and the transformers
// subpackage can import it without creating a cycle.
//
// Inclusion criterion: a value belongs in this enum if (a) the validator
// behaves differently for it, (b) generator dispatch differs across
// dialects for it, OR (c) it is a forward-looking type with explicit
// user-confirmed need (currently: Duration).
package flyqltype

// Type is the canonical flyql semantic type for a column or value.
// String values are lowercase tokens shared verbatim across Go, Python,
// and JavaScript so JSON test fixtures and serialized columns are
// language-agnostic.
type Type string

const (
	// String is text values. Enables string-only operators (like, ilike,
	// regex, not regex) and IN-list string typing. Absorbs raw DB types
	// such as varchar, char, text, FixedString, blob, UUID, IPv4/v6.
	String Type = "string"

	// Int is integer numbers. Enables numeric ordering operators (<, >,
	// <=, >=); regex is rejected. Absorbs int8/16/32/64/128/256, uint*,
	// bigint, smallint, tinyint, etc.
	Int Type = "int"

	// Float is floating-point numbers. Enables numeric ordering operators;
	// regex is rejected. Absorbs float, double, decimal, numeric, real.
	Float Type = "float"

	// Bool is boolean values. Equality and truthy only; ordering operators
	// rejected. Absorbs bool/boolean.
	Bool Type = "bool"

	// Date is point-in-time temporal values. Accepts temporal function
	// calls (ago(), now(), etc.) and string literals coerced to dates.
	// Absorbs date, date32, datetime, datetime64, timestamp, year.
	Date Type = "date"

	// Duration is interval/duration values. Accepts duration literals like
	// 30m1s, 1h, 7d. Absorbs ClickHouse Interval* and PostgreSQL interval.
	// Forward-looking: temporal validation against duration columns is
	// planned in a follow-up spec; current generators do not branch on it.
	Duration Type = "duration"

	// Array is an ordered collection of values. Accepts the `has` operator;
	// segmented key access uses numeric indices. Absorbs array, ClickHouse
	// Array(...) and PostgreSQL array types.
	Array Type = "array"

	// Map is a key→value collection with dynamic keys. Segmented key
	// access uses string keys. Absorbs ClickHouse Map(...) and PostgreSQL
	// hstore.
	Map Type = "map"

	// Struct is a fixed-shape record with named (or positional) fields.
	// Segmented key access uses field names with dialect-specific syntax
	// (tupleElement on ClickHouse, `col`.`field` on StarRocks). Absorbs
	// ClickHouse Tuple and StarRocks STRUCT.
	Struct Type = "struct"

	// JSON is a semi-structured JSON document. Segmented key access uses
	// JSON paths with dialect-specific functions (JSON_VALUE, JSONExtract*,
	// etc.). Absorbs ClickHouse JSON, PostgreSQL json/jsonb, StarRocks JSON.
	JSON Type = "json"

	// JSONString is a text column whose contents are valid JSON. Segmented
	// key access uses JSON paths; operator set mirrors JSON. Generators
	// wrap access with a dialect-specific parse function (parse_json for
	// StarRocks, (col::jsonb) for PostgreSQL, JSONExtract* for ClickHouse).
	// Absorbs text/varchar/String columns declared with the synthetic
	// flyql raw-type token "jsonstring".
	JSONString Type = "jsonstring"

	// Unknown is the documented fallback for types flyql cannot reason
	// about. Operators fall through to defaults; path access errors with
	// "unsupported column type"; transformers cannot accept it. Absorbs
	// ClickHouse Nothing/Object/Variant/Dynamic and geometry types,
	// StarRocks bitmap/hll, and any unrecognized DB type.
	Unknown Type = "unknown"
)
