package transformers

import (
	"fmt"
	"strings"
)

// Upper transforms a string value to uppercase.
type Upper struct{}

func (Upper) Name() string                        { return "upper" }
func (Upper) InputType() TransformerType          { return TransformerTypeString }
func (Upper) OutputType() TransformerType         { return TransformerTypeString }
func (Upper) Apply(value interface{}) interface{} { return strings.ToUpper(fmt.Sprintf("%v", value)) }

func (Upper) SQL(dialect, columnRef string) string {
	if dialect == "clickhouse" {
		return "upper(" + columnRef + ")"
	}
	return "UPPER(" + columnRef + ")"
}

// Lower transforms a string value to lowercase.
type Lower struct{}

func (Lower) Name() string                        { return "lower" }
func (Lower) InputType() TransformerType          { return TransformerTypeString }
func (Lower) OutputType() TransformerType         { return TransformerTypeString }
func (Lower) Apply(value interface{}) interface{} { return strings.ToLower(fmt.Sprintf("%v", value)) }

func (Lower) SQL(dialect, columnRef string) string {
	if dialect == "clickhouse" {
		return "lower(" + columnRef + ")"
	}
	return "LOWER(" + columnRef + ")"
}

// Len transforms a string value to its length.
type Len struct{}

func (Len) Name() string                        { return "len" }
func (Len) InputType() TransformerType          { return TransformerTypeString }
func (Len) OutputType() TransformerType         { return TransformerTypeInt }
func (Len) Apply(value interface{}) interface{} { return len(fmt.Sprintf("%v", value)) }

func (Len) SQL(dialect, columnRef string) string {
	if dialect == "clickhouse" {
		return "length(" + columnRef + ")"
	}
	return "LENGTH(" + columnRef + ")"
}
