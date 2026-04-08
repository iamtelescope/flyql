package transformers

import (
	"fmt"
	"strings"
)

// Upper transforms a string value to uppercase.
type Upper struct{}

func (Upper) Name() string                { return "upper" }
func (Upper) InputType() TransformerType  { return TransformerTypeString }
func (Upper) OutputType() TransformerType { return TransformerTypeString }
func (Upper) ArgSchema() []ArgSpec        { return []ArgSpec{} }
func (Upper) Apply(value interface{}, args []any) interface{} {
	return strings.ToUpper(fmt.Sprintf("%v", value))
}

func (Upper) SQL(dialect, columnRef string, args []any) string {
	if dialect == "clickhouse" {
		return "upper(" + columnRef + ")"
	}
	return "UPPER(" + columnRef + ")"
}

// Lower transforms a string value to lowercase.
type Lower struct{}

func (Lower) Name() string                { return "lower" }
func (Lower) InputType() TransformerType  { return TransformerTypeString }
func (Lower) OutputType() TransformerType { return TransformerTypeString }
func (Lower) ArgSchema() []ArgSpec        { return []ArgSpec{} }
func (Lower) Apply(value interface{}, args []any) interface{} {
	return strings.ToLower(fmt.Sprintf("%v", value))
}

func (Lower) SQL(dialect, columnRef string, args []any) string {
	if dialect == "clickhouse" {
		return "lower(" + columnRef + ")"
	}
	return "LOWER(" + columnRef + ")"
}

// Len transforms a string value to its length.
type Len struct{}

func (Len) Name() string                                    { return "len" }
func (Len) InputType() TransformerType                      { return TransformerTypeString }
func (Len) OutputType() TransformerType                     { return TransformerTypeInt }
func (Len) ArgSchema() []ArgSpec                            { return []ArgSpec{} }
func (Len) Apply(value interface{}, args []any) interface{} { return len(fmt.Sprintf("%v", value)) }

func (Len) SQL(dialect, columnRef string, args []any) string {
	if dialect == "clickhouse" {
		return "length(" + columnRef + ")"
	}
	return "LENGTH(" + columnRef + ")"
}

// Split splits a string by delimiter and returns an array.
type Split struct{}

func (Split) Name() string                { return "split" }
func (Split) InputType() TransformerType  { return TransformerTypeString }
func (Split) OutputType() TransformerType { return TransformerTypeArray }
func (Split) ArgSchema() []ArgSpec {
	return []ArgSpec{{Type: TransformerTypeString, Required: false}}
}

func (Split) SQL(dialect, columnRef string, args []any) string {
	delimiter := ","
	if len(args) > 0 {
		delimiter = fmt.Sprintf("%v", args[0])
	}
	escaped := "'" + strings.ReplaceAll(strings.ReplaceAll(delimiter, "\\", "\\\\"), "'", "\\'") + "'"
	if dialect == "clickhouse" {
		if len(delimiter) == 1 {
			return fmt.Sprintf("splitByChar(%s, %s)", escaped, columnRef)
		}
		return fmt.Sprintf("splitByString(%s, %s)", escaped, columnRef)
	}
	if dialect == "starrocks" {
		return fmt.Sprintf("SPLIT(%s, %s)", columnRef, escaped)
	}
	return fmt.Sprintf("STRING_TO_ARRAY(%s, %s)", columnRef, escaped)
}

func (Split) Apply(value interface{}, args []any) interface{} {
	delimiter := ","
	if len(args) > 0 {
		delimiter = fmt.Sprintf("%v", args[0])
	}
	parts := strings.Split(fmt.Sprintf("%v", value), delimiter)
	result := make([]any, len(parts))
	for i, p := range parts {
		result[i] = p
	}
	return result
}
