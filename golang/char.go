package flyql

import "unicode"

type char struct {
	value   rune
	pos     int
	line    int
	linePos int
}

func newChar(value rune, pos, line, linePos int) char {
	return char{
		value:   value,
		pos:     pos,
		line:    line,
		linePos: linePos,
	}
}

func (c char) isDelimiter() bool {
	return c.value == ' '
}

func (c char) isKey() bool {
	return unicode.IsLetter(c.value) ||
		unicode.IsDigit(c.value) ||
		c.value == '_' ||
		c.value == '.' ||
		c.value == ':' ||
		c.value == '/' ||
		c.value == '-' ||
		c.value == '@'
}

func (c char) isOp() bool {
	return c.value == '=' ||
		c.value == '!' ||
		c.value == '~' ||
		c.value == '<' ||
		c.value == '>'
}

func (c char) isGroupOpen() bool {
	return c.value == '('
}

func (c char) isGroupClose() bool {
	return c.value == ')'
}

func (c char) isDoubleQuote() bool {
	return c.value == '"'
}

func (c char) isSingleQuote() bool {
	return c.value == '\''
}

func (c char) isEquals() bool {
	return c.value == '='
}

func (c char) isValue() bool {
	return !c.isDoubleQuote() &&
		!c.isSingleQuote() &&
		!c.isDelimiter() &&
		!c.isGroupOpen() &&
		!c.isGroupClose() &&
		!c.isEquals()
}

func (c char) isNewline() bool {
	return c.value == '\n'
}
