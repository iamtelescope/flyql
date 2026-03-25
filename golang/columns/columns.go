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

// Modifier represents a column modifier (e.g., upper, chars(25)).
type Modifier struct {
	Name      string `json:"name"`
	Arguments []any  `json:"arguments"`
}

// ParsedColumn represents a fully parsed column with segments and metadata.
type ParsedColumn struct {
	Name        string     `json:"name"`
	Modifiers   []Modifier `json:"modifiers"`
	Alias       *string    `json:"alias"`
	Segments    []string   `json:"segments"`
	IsSegmented bool       `json:"is_segmented"`
	DisplayName string     `json:"display_name"`
}

type state int

const (
	stateExpectColumn state = iota
	stateColumn
	stateExpectAliasOperator
	stateExpectAliasDelimiter
	stateExpectAlias
	stateExpectModifier
	stateModifier
	stateModifierComplete
	stateExpectModifierArgument
	stateModifierArgument
	stateModifierArgumentDoubleQuoted
	stateModifierArgumentSingleQuoted
	stateExpectModifierArgumentDelimiter
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
	name      string
	modifiers []Modifier
	alias     string
}

type parser struct {
	text                 string
	state                state
	errorText            string
	errno                int
	charValue            string
	charPos              int
	column               string
	alias                string
	aliasOperator        string
	modifier             string
	modifierArgument     string
	modifierArgumentType string
	modifiers            []Modifier
	modifierArguments    []any
	columns              []columnData
}

func newParser() *parser {
	return &parser{
		state:                stateExpectColumn,
		modifierArgumentType: "auto",
		modifiers:            []Modifier{},
		modifierArguments:    []any{},
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
		name:      p.column,
		modifiers: p.modifiers,
		alias:     p.alias,
	})
	p.resetData()
}

func (p *parser) storeModifier() {
	p.modifiers = append(p.modifiers, Modifier{
		Name:      p.modifier,
		Arguments: p.modifierArguments,
	})
	p.resetModifier()
}

func (p *parser) storeArgument() {
	var value any = p.modifierArgument
	if p.modifierArgumentType == "auto" {
		if iv, err := strconv.Atoi(p.modifierArgument); err == nil {
			value = iv
		} else if fv, err := strconv.ParseFloat(p.modifierArgument, 64); err == nil {
			value = fv
		}
	}
	p.modifierArguments = append(p.modifierArguments, value)
	p.resetModifierArgument()
}

func (p *parser) resetModifier() {
	p.modifier = ""
	p.modifierArguments = []any{}
	p.modifierArgument = ""
}

func (p *parser) resetModifierArgument() {
	p.modifierArgument = ""
	p.modifierArgumentType = "auto"
}

func (p *parser) resetData() {
	p.column = ""
	p.alias = ""
	p.modifier = ""
	p.modifiers = []Modifier{}
	p.modifierArguments = []any{}
	p.modifierArgument = ""
	p.modifierArgumentType = "auto"
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

func isModifierValue(ch string) bool {
	if len(ch) == 1 {
		r := rune(ch[0])
		return unicode.IsLetter(r) || unicode.IsDigit(r) || ch == "_"
	}
	return false
}

func isModifierArgumentValue(ch string) bool {
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
		case stateExpectModifier:
			p.inStateExpectModifier()
		case stateExpectModifierArgument:
			p.inStateExpectModifierArgument()
		case stateModifier:
			p.inStateModifier()
		case stateModifierArgument:
			p.inStateModifierArgument()
		case stateModifierComplete:
			p.inStateModifierComplete()
		case stateModifierArgumentDoubleQuoted:
			p.inStateModifierArgumentDoubleQuoted()
		case stateModifierArgumentSingleQuoted:
			p.inStateModifierArgumentSingleQuoted()
		case stateExpectModifierArgumentDelimiter:
			p.inStateExpectModifierArgumentDelimiter()
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
	case stateModifier:
		if p.modifier != "" {
			p.storeModifier()
		}
		if p.column != "" {
			p.storeColumn()
		}
	case stateModifierComplete:
		p.storeModifier()
		p.storeColumn()
	case stateModifierArgumentDoubleQuoted, stateModifierArgumentSingleQuoted:
		p.setErrorState("unexpected end of quoted argument value", 12)
	case stateExpectModifierArgumentDelimiter:
		p.setErrorState("unexpected end of arguments list", 15)
	case stateExpectModifierArgument:
		p.setErrorState("expected closing parenthesis", 16)
	case stateModifierArgument:
		p.setErrorState("expected closing parenthesis", 16)
	case stateExpectModifier:
		p.setErrorState("expected modifier after operator", 7)
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
		p.state = stateExpectModifier
	} else {
		p.setErrorState("invalid character", 6)
	}
}

func (p *parser) inStateExpectModifier() {
	if isModifierValue(p.charValue) {
		p.modifier += p.charValue
		p.state = stateModifier
	} else {
		p.setErrorState("invalid character, expected modifier", 7)
	}
}

func (p *parser) inStateModifier() {
	if isModifierValue(p.charValue) {
		p.modifier += p.charValue
	} else if p.charValue == "," {
		p.storeModifier()
		p.storeColumn()
		p.state = stateExpectColumn
	} else if p.charValue == "|" {
		p.storeModifier()
		p.state = stateExpectModifier
	} else if p.charValue == " " {
		p.storeModifier()
		p.state = stateExpectAliasOperator
	} else if p.charValue == "(" {
		p.state = stateExpectModifierArgument
	} else if p.charValue == ")" {
		p.storeArgument()
		p.storeModifier()
		// Python raises ValueError here, but let's match the behavior
		p.setErrorState("unsupported close bracket", 8)
	} else {
		p.setErrorState("unsupported char in modifier", 8)
	}
}

func (p *parser) inStateExpectModifierArgument() {
	if p.charValue == " " {
		return
	}
	if p.charValue == "\"" {
		p.modifierArgumentType = "str"
		p.state = stateModifierArgumentDoubleQuoted
	} else if p.charValue == "'" {
		p.modifierArgumentType = "str"
		p.state = stateModifierArgumentSingleQuoted
	} else if isModifierArgumentValue(p.charValue) {
		p.modifierArgument += p.charValue
		p.state = stateModifierArgument
	} else if p.charValue == ")" {
		if p.modifierArgument != "" {
			p.storeArgument()
		}
		p.state = stateModifierComplete
	}
}

func (p *parser) inStateModifierArgument() {
	if p.charValue == "," {
		p.storeArgument()
		p.state = stateExpectModifierArgument
	} else if isModifierArgumentValue(p.charValue) {
		p.modifierArgument += p.charValue
	} else if p.charValue == ")" {
		p.storeArgument()
		p.state = stateModifierComplete
	}
}

func (p *parser) inStateExpectModifierArgumentDelimiter() {
	if p.charValue == "," {
		p.state = stateExpectModifierArgument
	} else if p.charValue == ")" {
		p.state = stateModifierComplete
	} else {
		p.setErrorState("invalid character. Expected bracket close or modifier argument delimiter", 9)
	}
}

func (p *parser) inStateModifierArgumentDoubleQuoted() {
	if p.charValue == "\\" {
		nextPos := p.charPos + 1
		if nextPos < len(p.text) {
			nextChar := p.text[nextPos]
			if nextChar != '"' {
				p.modifierArgument += p.charValue
			}
		} else {
			p.modifierArgument += p.charValue
		}
	} else if p.charValue != "\"" {
		p.modifierArgument += p.charValue
	} else if p.charValue == "\"" {
		prevPos := p.charPos - 1
		if prevPos >= 0 && p.text[prevPos] == '\\' {
			p.modifierArgument += p.charValue
		} else {
			p.storeArgument()
			p.state = stateExpectModifierArgumentDelimiter
		}
	} else {
		p.setErrorState("invalid character", 10)
	}
}

func (p *parser) inStateModifierArgumentSingleQuoted() {
	if p.charValue == "\\" {
		nextPos := p.charPos + 1
		if nextPos < len(p.text) {
			nextChar := p.text[nextPos]
			if nextChar != '\'' {
				p.modifierArgument += p.charValue
			}
		} else {
			p.modifierArgument += p.charValue
		}
	} else if p.charValue != "'" {
		p.modifierArgument += p.charValue
	} else if p.charValue == "'" {
		prevPos := p.charPos - 1
		if prevPos >= 0 && p.text[prevPos] == '\\' {
			p.modifierArgument += p.charValue
		} else {
			p.storeArgument()
			p.state = stateExpectModifierArgumentDelimiter
		}
	} else {
		p.setErrorState("invalid character", 10)
	}
}

func (p *parser) inStateModifierComplete() {
	if p.charValue == " " {
		p.storeModifier()
		p.state = stateExpectAliasOperator
	} else if p.charValue == "," {
		p.storeModifier()
		p.storeColumn()
		p.state = stateExpectColumn
	} else if p.charValue == "|" {
		p.storeModifier()
		p.state = stateExpectModifier
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
func Parse(text string) ([]ParsedColumn, error) {
	p := newParser()
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

		// Ensure modifiers is never nil for JSON serialization
		mods := col.modifiers
		if mods == nil {
			mods = []Modifier{}
		}
		// Ensure each modifier's Arguments is never nil
		for i := range mods {
			if mods[i].Arguments == nil {
				mods[i].Arguments = []any{}
			}
		}

		segments := key.Segments
		if segments == nil {
			segments = []string{}
		}

		result = append(result, ParsedColumn{
			Name:        col.name,
			Modifiers:   mods,
			Alias:       alias,
			Segments:    segments,
			IsSegmented: key.IsSegmented(),
			DisplayName: displayName,
		})
	}

	return result, nil
}

// ParseToJSON parses a columns expression and returns the result as JSON bytes.
func ParseToJSON(text string) ([]byte, error) {
	columns, err := Parse(text)
	if err != nil {
		return nil, err
	}
	return json.Marshal(columns)
}
