package flyql

type Key struct {
	Segments []string
	Raw      string
}

func (k Key) IsSegmented() bool {
	return len(k.Segments) > 1
}

type keyParser struct {
	input          string
	pos            int
	segments       []string
	currentSegment string
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
			if err := p.parseQuotedSegment('\''); err != nil {
				return err
			}
		case '"':
			if err := p.parseQuotedSegment('"'); err != nil {
				return err
			}
		case '\\':
			escaped, err := p.parseEscapeSequence()
			if err != nil {
				return err
			}
			p.currentSegment += escaped
		default:
			p.advance()
			p.currentSegment += string(ch)
		}
	}
}

func (p *keyParser) parse(keyString string) (Key, error) {
	p.input = keyString
	p.pos = 0
	p.segments = nil
	p.currentSegment = ""

	if len(p.input) == 0 {
		return Key{Segments: []string{}, Raw: keyString}, nil
	}

	for p.pos < len(p.input) {
		if err := p.parseNormalSegment(); err != nil {
			return Key{}, err
		}

		p.segments = append(p.segments, p.currentSegment)
		p.currentSegment = ""

		ch, ok := p.peek(0)
		if ok && ch == '.' {
			p.advance()
			if p.pos >= len(p.input) {
				p.segments = append(p.segments, "")
			}
		}
	}

	return Key{Segments: p.segments, Raw: keyString}, nil
}

func ParseKey(keyString string) (Key, error) {
	parser := &keyParser{}
	return parser.parse(keyString)
}
