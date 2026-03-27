package flyql

import (
	"fmt"
	"strings"
)

// KeyTransformer represents a transformer applied to a key (e.g., upper, len).
type KeyTransformer struct {
	Name      string `json:"name"`
	Arguments []any  `json:"arguments"`
}

type Key struct {
	Segments       []string
	QuotedSegments []bool
	Raw            string
	Transformers   []KeyTransformer
}

func (k Key) IsSegmented() bool {
	return len(k.Segments) > 1
}

type keyParser struct {
	input                    string
	pos                      int
	segments                 []string
	quotedSegments           []bool
	currentSegment           string
	currentSegmentQuoted     bool
	currentSegmentHasContent bool
}

func (p *keyParser) peek(offset int) (byte, bool) {
	pos := p.pos + offset
	if pos < len(p.input) {
		return p.input[pos], true
	}
	return 0, false
}

func (p *keyParser) advance() (byte, bool) {
	ch, ok := p.peek(0)
	p.pos++
	return ch, ok
}

func (p *keyParser) parseEscapeSequence() (string, error) {
	p.advance()
	ch, ok := p.peek(0)

	if !ok {
		return "", &KeyParseError{Message: "Incomplete escape sequence"}
	}

	p.advance()
	switch ch {
	case '\'':
		return "'", nil
	case '"':
		return "\"", nil
	case '\\':
		return "\\", nil
	case 'n':
		return "\n", nil
	case 't':
		return "\t", nil
	case '.':
		return ".", nil
	default:
		return string(ch), nil
	}
}

func (p *keyParser) parseQuotedSegment(quoteChar byte) error {
	p.advance()

	for {
		ch, ok := p.peek(0)
		if !ok {
			return &KeyParseError{Message: "Unterminated quoted segment"}
		}

		if ch == '\\' {
			escaped, err := p.parseEscapeSequence()
			if err != nil {
				return err
			}
			p.currentSegment += escaped
		} else if ch == quoteChar {
			p.advance()
			return nil
		} else {
			p.advance()
			p.currentSegment += string(ch)
		}
	}
}

func (p *keyParser) parseNormalSegment() error {
	for {
		ch, ok := p.peek(0)
		if !ok {
			return nil
		}

		switch ch {
		case '.':
			return nil
		case '\'':
			isFirst := !p.currentSegmentHasContent
			if err := p.parseQuotedSegment('\''); err != nil {
				return err
			}
			if isFirst {
				p.currentSegmentQuoted = true
			}
			p.currentSegmentHasContent = true
		case '"':
			isFirst := !p.currentSegmentHasContent
			if err := p.parseQuotedSegment('"'); err != nil {
				return err
			}
			if isFirst {
				p.currentSegmentQuoted = true
			}
			p.currentSegmentHasContent = true
		case '\\':
			escaped, err := p.parseEscapeSequence()
			if err != nil {
				return err
			}
			p.currentSegment += escaped
			p.currentSegmentHasContent = true
		default:
			p.advance()
			p.currentSegment += string(ch)
			p.currentSegmentHasContent = true
		}
	}
}

func (p *keyParser) parse(keyString string) (Key, error) {
	p.input = keyString
	p.pos = 0
	p.segments = nil
	p.quotedSegments = nil
	p.currentSegment = ""
	p.currentSegmentQuoted = false
	p.currentSegmentHasContent = false

	if len(p.input) == 0 {
		return Key{Segments: []string{}, QuotedSegments: []bool{}, Raw: keyString}, nil
	}

	for p.pos < len(p.input) {
		if err := p.parseNormalSegment(); err != nil {
			return Key{}, err
		}

		p.segments = append(p.segments, p.currentSegment)
		p.quotedSegments = append(p.quotedSegments, p.currentSegmentQuoted)
		p.currentSegment = ""
		p.currentSegmentQuoted = false
		p.currentSegmentHasContent = false

		ch, ok := p.peek(0)
		if ok && ch == '.' {
			p.advance()
			if p.pos >= len(p.input) {
				p.segments = append(p.segments, "")
				p.quotedSegments = append(p.quotedSegments, false)
			}
		}
	}

	return Key{Segments: p.segments, QuotedSegments: p.quotedSegments, Raw: keyString}, nil
}

func ParseKey(keyString string) (Key, error) {
	parts := strings.Split(keyString, "|")
	baseKeyString := parts[0]
	transformerNames := parts[1:]

	parser := &keyParser{}
	key, err := parser.parse(baseKeyString)
	if err != nil {
		return key, err
	}

	if len(transformerNames) > 0 {
		for _, name := range transformerNames {
			if name == "" {
				return Key{}, fmt.Errorf("empty transformer name in key")
			}
		}
		key.Transformers = make([]KeyTransformer, len(transformerNames))
		for i, name := range transformerNames {
			key.Transformers[i] = KeyTransformer{Name: name, Arguments: []any{}}
		}
		key.Raw = keyString
	}

	return key, nil
}
