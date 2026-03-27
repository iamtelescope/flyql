package columns

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"unicode"

	flyql "github.com/iamtelescope/flyql/golang"
)

// ParserError represents a parsing error with an error code.
type ParserError struct {
	Message string
	Errno   int
}

func (e *ParserError) Error() string { return e.Message }

// Transformer represents a column transformer (e.g., upper, chars(25)).
type Transformer struct {
	Name      string `json:"name"`
	Arguments []any  `json:"arguments"`
}

// ParsedColumn represents a fully parsed column with segments and metadata.
type ParsedColumn struct {
	Name         string        `json:"name"`
	Transformers []Transformer `json:"transformers"`
	Alias        *string       `json:"alias"`
	Segments     []string      `json:"segments"`
	IsSegmented  bool          `json:"is_segmented"`
	DisplayName  string        `json:"display_name"`
}

type state int

const (
	stateExpectColumn state = iota
	stateColumn
	stateExpectAliasOperator
	stateExpectAliasDelimiter
	stateExpectAlias
	stateExpectTransformer
	stateTransformer
	stateTransformerComplete
	stateExpectTransformerArgument
	stateTransformerArgument
	stateTransformerArgumentDoubleQuoted
	stateTransformerArgumentSingleQuoted
	stateExpectTransformerArgumentDelimiter
	stateError
)

var escapeSequences = map[byte]string{
	'b':  "\b",
	'f':  "\f",
	'n':  "\n",
	'r':  "\r",
	't':  "\t",
	'v':  "\v",
	'\\': "\\",
}

type columnData struct {
	name         string
	transformers []Transformer
	alias        string
}

// Capabilities controls which parser features are enabled.
type Capabilities struct {
	Transformers bool
}

type parser struct {
	capabilities            Capabilities
	text                    string
	state                   state
	errorText               string
	errno                   int
	charValue               string
	charPos                 int
	column                  string
	alias                   string
	aliasOperator           string
	transformer             string
	transformerArgument     string
	transformerArgumentType string
	transformers            []Transformer
	transformerArguments    []any
	columns                 []columnData
}

func newParser(capabilities Capabilities) *parser {
	return &parser{
		capabilities:            capabilities,
		state:                   stateExpectColumn,
		transformerArgumentType: "auto",
		transformers:            []Transformer{},
		transformerArguments:    []any{},
	}
}

func (p *parser) storeColumn() {
	var alias *string
	if p.alias != "" {
		a := p.alias
		alias = &a
	}
	_ = alias // used below
	p.columns = append(p.columns, columnData{
		name:         p.column,
		transformers: p.transformers,
		alias:        p.alias,
	})
	p.resetData()
}

func (p *parser) storeTransformer() {
	p.transformers = append(p.transformers, Transformer{
		Name:      p.transformer,
		Arguments: p.transformerArguments,
	})
	p.resetTransformerData()
}

func (p *parser) storeArgument() {
	var value any = p.transformerArgument
	if p.transformerArgumentType == "auto" {
		if iv, err := strconv.Atoi(p.transformerArgument); err == nil {
			value = iv
		} else if fv, err := strconv.ParseFloat(p.transformerArgument, 64); err == nil {
			value = fv
		}
	}
	p.transformerArguments = append(p.transformerArguments, value)
	p.resetTransformerArgument()
}

func (p *parser) resetTransformerData() {
	p.transformer = ""
	p.transformerArguments = []any{}
	p.transformerArgument = ""
}

func (p *parser) resetTransformerArgument() {
	p.transformerArgument = ""
	p.transformerArgumentType = "auto"
}

func (p *parser) resetData() {
	p.column = ""
	p.alias = ""
	p.transformer = ""
	p.transformers = []Transformer{}
	p.transformerArguments = []any{}
	p.transformerArgument = ""
	p.transformerArgumentType = "auto"
	p.aliasOperator = ""
}

func (p *parser) setErrorState(errorText string, errno int) {
	p.state = stateError
	p.errorText = errorText
	p.errno = errno
	p.errorText += fmt.Sprintf(" [char %s at pos %d], errno=%d", p.charValue, p.charPos, errno)
}

func isColumnValue(ch string) bool {
	if len(ch) == 1 {
		r := rune(ch[0])
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			return true
		}
	} else {
		for _, r := range ch {
			if unicode.IsLetter(r) || unicode.IsDigit(r) {
				return true
			}
		}
	}
	switch ch {
	case "_", "-", ".", ":", "/", "'", "\"", "\\", "@":
		return true
	}
	return false
}

func isTransformerValue(ch string) bool {
	if len(ch) == 1 {
		r := rune(ch[0])
		return unicode.IsLetter(r) || unicode.IsDigit(r) || ch == "_"
	}
	return false
}

func isTransformerArgumentValue(ch string) bool {
	return ch != "," && ch != "(" && ch != ")"
}

func isAliasChar(ch string) bool {
	return ch == "A" || ch == "a" || ch == "S" || ch == "s"
}

func (p *parser) parse(text string) error {
	p.text = text

	i := 0
	line := 0
	linePos := 0

	for i < len(text) {
		if p.state == stateError {
			break
		}

		parsedNewline := false
		ch := string(text[i])
		p.charValue = ch
		p.charPos = i

		if ch == "\\" {
			if i+1 < len(text) {
				nextChar := text[i+1]
				if replacement, ok := escapeSequences[nextChar]; ok {
					parsedNewline = true
					p.charValue = replacement
					p.charPos = i
					i++
				}
			}
		}

		if p.charValue == "\n" && !parsedNewline {
			line++
			linePos = 0
			i++
			continue
		}
		_ = line

		switch p.state {
		case stateExpectColumn:
			p.inStateExpectColumn()
		case stateColumn:
			p.inStateColumn()
		case stateExpectAlias:
			p.inStateExpectAlias()
		case stateExpectAliasOperator:
			p.inStateExpectAliasOperator()
		case stateExpectAliasDelimiter:
			p.inStateExpectAliasDelimiter()
		case stateExpectTransformer:
			p.inStateExpectTransformer()
		case stateExpectTransformerArgument:
			p.inStateExpectTransformerArgument()
		case stateTransformer:
			p.inStateTransformer()
		case stateTransformerArgument:
			p.inStateTransformerArgument()
		case stateTransformerComplete:
			p.inStateTransformerComplete()
		case stateTransformerArgumentDoubleQuoted:
			p.inStateTransformerArgumentDoubleQuoted()
		case stateTransformerArgumentSingleQuoted:
			p.inStateTransformerArgumentSingleQuoted()
		case stateExpectTransformerArgumentDelimiter:
			p.inStateExpectTransformerArgumentDelimiter()
		default:
			p.setErrorState(fmt.Sprintf("unknown state: %d", p.state), 1)
		}

		i++
		linePos++
	}

	if p.state == stateError {
		return &ParserError{Message: p.errorText, Errno: p.errno}
	}

	p.inStateLastChar()

	if p.state == stateError {
		return &ParserError{Message: p.errorText, Errno: p.errno}
	}

	return nil
}

func (p *parser) inStateLastChar() {
	switch p.state {
	case stateColumn:
		p.storeColumn()
	case stateExpectColumn:
		return
	case stateExpectAlias:
		if p.alias != "" {
			p.storeColumn()
		} else {
			p.setErrorState("unexpected end of alias. Expected alias value", 13)
		}
	case stateExpectAliasOperator:
		if p.aliasOperator != "" {
			p.setErrorState("unexpected end of alias. Expected alias value", 14)
		} else {
			p.storeColumn()
		}
	case stateExpectAliasDelimiter:
		p.setErrorState("unexpected end of alias. Expected alias value", 14)
	case stateTransformer:
		if p.transformer != "" {
			p.storeTransformer()
		}
		if p.column != "" {
			p.storeColumn()
		}
	case stateTransformerComplete:
		p.storeTransformer()
		p.storeColumn()
	case stateTransformerArgumentDoubleQuoted, stateTransformerArgumentSingleQuoted:
		p.setErrorState("unexpected end of quoted argument value", 12)
	case stateExpectTransformerArgumentDelimiter:
		p.setErrorState("unexpected end of arguments list", 15)
	case stateExpectTransformerArgument:
		p.setErrorState("expected closing parenthesis", 16)
	case stateTransformerArgument:
		p.setErrorState("expected closing parenthesis", 16)
	case stateExpectTransformer:
		p.setErrorState("expected transformer after operator", 7)
	}
}

func (p *parser) inStateExpectColumn() {
	if p.charValue == " " {
		return
	} else if isColumnValue(p.charValue) {
		p.column += p.charValue
		p.state = stateColumn
	} else {
		p.setErrorState("invalid character", 2)
	}
}

func (p *parser) inStateColumn() {
	if p.charValue == " " {
		p.state = stateExpectAliasOperator
	} else if isColumnValue(p.charValue) {
		p.column += p.charValue
	} else if p.charValue == "," {
		p.state = stateExpectColumn
		p.storeColumn()
	} else if p.charValue == "|" {
		if !p.capabilities.Transformers {
			p.setErrorState("transformers are not enabled", 17)
			return
		}
		p.state = stateExpectTransformer
	} else {
		p.setErrorState("invalid character", 6)
	}
}

func (p *parser) inStateExpectTransformer() {
	if isTransformerValue(p.charValue) {
		p.transformer += p.charValue
		p.state = stateTransformer
	} else {
		p.setErrorState("invalid character, expected transformer", 7)
	}
}

func (p *parser) inStateTransformer() {
	if isTransformerValue(p.charValue) {
		p.transformer += p.charValue
	} else if p.charValue == "," {
		p.storeTransformer()
		p.storeColumn()
		p.state = stateExpectColumn
	} else if p.charValue == "|" {
		p.storeTransformer()
		p.state = stateExpectTransformer
	} else if p.charValue == " " {
		p.storeTransformer()
		p.state = stateExpectAliasOperator
	} else if p.charValue == "(" {
		p.state = stateExpectTransformerArgument
	} else if p.charValue == ")" {
		p.storeArgument()
		p.storeTransformer()
		// Python raises ValueError here, but let's match the behavior
		p.setErrorState("unsupported close bracket", 8)
	} else {
		p.setErrorState("unsupported char in transformer", 8)
	}
}

func (p *parser) inStateExpectTransformerArgument() {
	if p.charValue == " " {
		return
	}
	if p.charValue == "\"" {
		p.transformerArgumentType = "str"
		p.state = stateTransformerArgumentDoubleQuoted
	} else if p.charValue == "'" {
		p.transformerArgumentType = "str"
		p.state = stateTransformerArgumentSingleQuoted
	} else if isTransformerArgumentValue(p.charValue) {
		p.transformerArgument += p.charValue
		p.state = stateTransformerArgument
	} else if p.charValue == ")" {
		if p.transformerArgument != "" {
			p.storeArgument()
		}
		p.state = stateTransformerComplete
	}
}

func (p *parser) inStateTransformerArgument() {
	if p.charValue == "," {
		p.storeArgument()
		p.state = stateExpectTransformerArgument
	} else if isTransformerArgumentValue(p.charValue) {
		p.transformerArgument += p.charValue
	} else if p.charValue == ")" {
		p.storeArgument()
		p.state = stateTransformerComplete
	}
}

func (p *parser) inStateExpectTransformerArgumentDelimiter() {
	if p.charValue == "," {
		p.state = stateExpectTransformerArgument
	} else if p.charValue == ")" {
		p.state = stateTransformerComplete
	} else {
		p.setErrorState("invalid character. Expected bracket close or transformer argument delimiter", 9)
	}
}

func (p *parser) inStateTransformerArgumentDoubleQuoted() {
	if p.charValue == "\\" {
		nextPos := p.charPos + 1
		if nextPos < len(p.text) {
			nextChar := p.text[nextPos]
			if nextChar != '"' {
				p.transformerArgument += p.charValue
			}
		} else {
			p.transformerArgument += p.charValue
		}
	} else if p.charValue != "\"" {
		p.transformerArgument += p.charValue
	} else if p.charValue == "\"" {
		prevPos := p.charPos - 1
		if prevPos >= 0 && p.text[prevPos] == '\\' {
			p.transformerArgument += p.charValue
		} else {
			p.storeArgument()
			p.state = stateExpectTransformerArgumentDelimiter
		}
	} else {
		p.setErrorState("invalid character", 10)
	}
}

func (p *parser) inStateTransformerArgumentSingleQuoted() {
	if p.charValue == "\\" {
		nextPos := p.charPos + 1
		if nextPos < len(p.text) {
			nextChar := p.text[nextPos]
			if nextChar != '\'' {
				p.transformerArgument += p.charValue
			}
		} else {
			p.transformerArgument += p.charValue
		}
	} else if p.charValue != "'" {
		p.transformerArgument += p.charValue
	} else if p.charValue == "'" {
		prevPos := p.charPos - 1
		if prevPos >= 0 && p.text[prevPos] == '\\' {
			p.transformerArgument += p.charValue
		} else {
			p.storeArgument()
			p.state = stateExpectTransformerArgumentDelimiter
		}
	} else {
		p.setErrorState("invalid character", 10)
	}
}

func (p *parser) inStateTransformerComplete() {
	if p.charValue == " " {
		p.storeTransformer()
		p.state = stateExpectAliasOperator
	} else if p.charValue == "," {
		p.storeTransformer()
		p.storeColumn()
		p.state = stateExpectColumn
	} else if p.charValue == "|" {
		if !p.capabilities.Transformers {
			p.setErrorState("transformers are not enabled", 17)
			return
		}
		p.storeTransformer()
		p.state = stateExpectTransformer
	} else {
		p.setErrorState("invalid character", 8)
	}
}

func (p *parser) inStateExpectAliasOperator() {
	if p.charValue == " " {
		return
	} else if p.charValue == "," {
		p.storeColumn()
		p.state = stateExpectColumn
	} else if isAliasChar(p.charValue) {
		p.aliasOperator += p.charValue
		if len(p.aliasOperator) < 2 {
			return
		}
		if len(p.aliasOperator) == 2 {
			if strings.ToLower(p.aliasOperator) != "as" {
				p.setErrorState("invalid character", 3)
			} else {
				p.state = stateExpectAliasDelimiter
				p.aliasOperator = ""
			}
		}
	} else {
		p.setErrorState("invalid character, expected alias operator", 4)
	}
}

func (p *parser) inStateExpectAlias() {
	if p.charValue == " " {
		return
	} else if isColumnValue(p.charValue) {
		p.alias += p.charValue
	} else if p.charValue == "," {
		p.state = stateExpectColumn
		p.storeColumn()
	}
}

func (p *parser) inStateExpectAliasDelimiter() {
	if p.charValue == " " {
		p.state = stateExpectAlias
	} else {
		p.setErrorState("invalid character, expected alias delimiter", 5)
	}
}

// Parse parses a columns expression and returns a slice of ParsedColumn.
func Parse(text string, capabilities Capabilities) ([]ParsedColumn, error) {
	p := newParser(capabilities)
	if err := p.parse(text); err != nil {
		return nil, err
	}

	result := make([]ParsedColumn, 0, len(p.columns))
	for _, col := range p.columns {
		key, err := flyql.ParseKey(col.name)
		if err != nil {
			return nil, fmt.Errorf("failed to parse key %q: %w", col.name, err)
		}

		var alias *string
		displayName := ""
		if col.alias != "" {
			a := col.alias
			alias = &a
			displayName = col.alias
		}

		// Ensure transformers is never nil for JSON serialization
		transformers := col.transformers
		if transformers == nil {
			transformers = []Transformer{}
		}
		// Ensure each transformer's Arguments is never nil
		for i := range transformers {
			if transformers[i].Arguments == nil {
				transformers[i].Arguments = []any{}
			}
		}

		segments := key.Segments
		if segments == nil {
			segments = []string{}
		}

		result = append(result, ParsedColumn{
			Name:         col.name,
			Transformers: transformers,
			Alias:        alias,
			Segments:     segments,
			IsSegmented:  key.IsSegmented(),
			DisplayName:  displayName,
		})
	}

	return result, nil
}

// ParseToJSON parses a columns expression and returns the result as JSON bytes.
func ParseToJSON(text string, capabilities Capabilities) ([]byte, error) {
	columns, err := Parse(text, capabilities)
	if err != nil {
		return nil, err
	}
	return json.Marshal(columns)
}
