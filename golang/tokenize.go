package flyql

import (
	"errors"
	"regexp"
	"unicode/utf8"
)

// Token is the cross-language token shape emitted by Tokenize.
// Fields mirror the JavaScript `{ text, type, start, end }` shape.
type Token struct {
	Text  string
	Type  string
	Start int
	End   int
}

var numericRe = regexp.MustCompile(`^-?\d+(\.\d+)?([eE][+-]?\d+)?$`)

func isNumeric(s string) bool {
	return numericRe.MatchString(s)
}

func upgradeQueryValue(text string) string {
	switch {
	case text == "true" || text == "false":
		return CharTypeBoolean
	case text == "null":
		return CharTypeNull
	case isNumeric(text):
		return CharTypeNumber
	case len(text) > 0 && (text[0] == '\'' || text[0] == '"'):
		return CharTypeString
	default:
		return CharTypeColumn
	}
}

// Tokenize groups the parser's per-character TypedChars output into token
// runs with shape {Text, Type, Start, End}, applies the canonical VALUE
// upgrade in query mode, and appends a trailing ERROR token when the
// parser halts before consuming the full input. Columns mode is only
// available in the JavaScript package and returns an error here.
func Tokenize(text, mode string) ([]Token, error) {
	if mode == "" {
		mode = "query"
	}
	if mode != "query" {
		return nil, errors.New("columns mode is only available in the JavaScript package")
	}
	if text == "" {
		return []Token{}, nil
	}

	p := NewParser()
	_ = p.Parse(text)
	typed := p.TypedChars

	tokens := make([]Token, 0)
	if len(typed) > 0 {
		curText := string(typed[0].Value)
		curType := typed[0].Type
		curStart := typed[0].Pos
		for i := 1; i < len(typed); i++ {
			c := typed[i]
			if c.Type == curType {
				curText += string(c.Value)
			} else {
				tokens = append(tokens, Token{
					Text:  curText,
					Type:  curType,
					Start: curStart,
					End:   curStart + utf8.RuneCountInString(curText),
				})
				curText = string(c.Value)
				curType = c.Type
				curStart = c.Pos
			}
		}
		tokens = append(tokens, Token{
			Text:  curText,
			Type:  curType,
			Start: curStart,
			End:   curStart + utf8.RuneCountInString(curText),
		})
	}

	for i := range tokens {
		if tokens[i].Type == CharTypeValue {
			tokens[i].Type = upgradeQueryValue(tokens[i].Text)
		}
	}

	consumed := 0
	if len(tokens) > 0 {
		consumed = tokens[len(tokens)-1].End
	}
	// consumed is a code-point offset, so the trailing slice and total length
	// must be measured in code points too (text indexes bytes natively).
	runes := []rune(text)
	if consumed < len(runes) {
		tokens = append(tokens, Token{
			Text:  string(runes[consumed:]),
			Type:  CharTypeError,
			Start: consumed,
			End:   len(runes),
		})
	}

	return tokens, nil
}
