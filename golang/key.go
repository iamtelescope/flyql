package flyql

import (
	"fmt"
	"strconv"
	"strings"
)

// Transformer represents a parsed transformer invocation from a key pipeline
// (e.g., upper or format("YYYY")). Carries source ranges so tooling can map
// the AST back to the raw input.
type Transformer struct {
	Name           string  `json:"name"`
	Arguments      []any   `json:"arguments"`
	Range          Range   `json:"-"`
	NameRange      Range   `json:"-"`
	ArgumentRanges []Range `json:"-"`
}

type Key struct {
	Segments       []string
	QuotedSegments []bool
	Raw            string
	Transformers   []Transformer
	Range          Range
	SegmentRanges  []Range
}

func (k Key) IsSegmented() bool {
	return len(k.Segments) > 1
}

type keyParser struct {
	input                    string
	pos                      int
	baseOffset               int
	segments                 []string
	quotedSegments           []bool
	segmentRanges            []Range
	currentSegment           string
	currentSegmentQuoted     bool
	currentSegmentHasContent bool
	currentSegmentStart      int
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
		return "", &KeyParseError{
			Message: "Incomplete escape sequence",
			Range:   Range{Start: p.baseOffset + p.pos, End: p.baseOffset + p.pos + 1},
		}
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
	if !p.currentSegmentHasContent && p.currentSegmentStart == -1 {
		p.currentSegmentStart = p.pos
	}
	p.advance()

	for {
		ch, ok := p.peek(0)
		if !ok {
			return &KeyParseError{
				Message: "Unterminated quoted segment",
				Range:   Range{Start: p.baseOffset + p.pos, End: p.baseOffset + p.pos},
			}
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
			if p.currentSegmentStart == -1 {
				p.currentSegmentStart = p.pos
			}
			escaped, err := p.parseEscapeSequence()
			if err != nil {
				return err
			}
			p.currentSegment += escaped
			p.currentSegmentHasContent = true
		default:
			if p.currentSegmentStart == -1 {
				p.currentSegmentStart = p.pos
			}
			p.advance()
			p.currentSegment += string(ch)
			p.currentSegmentHasContent = true
		}
	}
}

func (p *keyParser) parse(keyString string, baseOffset int) (Key, error) {
	p.input = keyString
	p.pos = 0
	p.baseOffset = baseOffset
	p.segments = nil
	p.quotedSegments = nil
	p.segmentRanges = nil
	p.currentSegment = ""
	p.currentSegmentQuoted = false
	p.currentSegmentHasContent = false
	p.currentSegmentStart = -1

	keyRange := Range{Start: baseOffset, End: baseOffset + len(keyString)}

	if len(p.input) == 0 {
		return Key{
			Segments:       []string{},
			QuotedSegments: []bool{},
			Raw:            keyString,
			Range:          keyRange,
			SegmentRanges:  []Range{},
		}, nil
	}

	for p.pos < len(p.input) {
		segStartBefore := p.pos
		if err := p.parseNormalSegment(); err != nil {
			return Key{}, err
		}
		segEnd := p.pos

		var segStart int
		if p.currentSegmentStart == -1 {
			segStart = p.baseOffset + segStartBefore
		} else {
			segStart = p.baseOffset + p.currentSegmentStart
		}

		p.segments = append(p.segments, p.currentSegment)
		p.quotedSegments = append(p.quotedSegments, p.currentSegmentQuoted)
		p.segmentRanges = append(p.segmentRanges, Range{Start: segStart, End: p.baseOffset + segEnd})
		p.currentSegment = ""
		p.currentSegmentQuoted = false
		p.currentSegmentHasContent = false
		p.currentSegmentStart = -1

		ch, ok := p.peek(0)
		if ok && ch == '.' {
			p.advance()
			if p.pos >= len(p.input) {
				p.segments = append(p.segments, "")
				p.quotedSegments = append(p.quotedSegments, false)
				p.segmentRanges = append(p.segmentRanges, Range{Start: p.baseOffset + p.pos, End: p.baseOffset + p.pos})
			}
		}
	}

	return Key{
		Segments:       p.segments,
		QuotedSegments: p.quotedSegments,
		Raw:            keyString,
		Range:          keyRange,
		SegmentRanges:  p.segmentRanges,
	}, nil
}

func parseTransformerArguments(argsStr string, baseOffset int) ([]any, []Range, error) {
	args := []any{}
	ranges := []Range{}
	i := 0
	for i < len(argsStr) {
		for i < len(argsStr) && argsStr[i] == ' ' {
			i++
		}
		if i >= len(argsStr) {
			break
		}
		argStart := i
		if argsStr[i] == '"' || argsStr[i] == '\'' {
			quote := argsStr[i]
			i++
			val := ""
			for i < len(argsStr) && argsStr[i] != quote {
				if argsStr[i] == '\\' && i+1 < len(argsStr) {
					i++
					switch argsStr[i] {
					case 't':
						val += "\t"
					case 'n':
						val += "\n"
					default:
						val += string(argsStr[i])
					}
				} else {
					val += string(argsStr[i])
				}
				i++
			}
			if i < len(argsStr) {
				i++
			} else {
				return nil, nil, fmt.Errorf("unclosed string in transformer arguments")
			}
			argEnd := i
			args = append(args, val)
			ranges = append(ranges, Range{Start: baseOffset + argStart, End: baseOffset + argEnd})
		} else {
			val := ""
			for i < len(argsStr) && argsStr[i] != ',' && argsStr[i] != ' ' {
				val += string(argsStr[i])
				i++
			}
			argEnd := i
			if n, err := strconv.Atoi(val); err == nil {
				args = append(args, n)
			} else if f, err := strconv.ParseFloat(val, 64); err == nil {
				args = append(args, f)
			} else {
				args = append(args, val)
			}
			ranges = append(ranges, Range{Start: baseOffset + argStart, End: baseOffset + argEnd})
		}
		for i < len(argsStr) && (argsStr[i] == ' ' || argsStr[i] == ',') {
			i++
		}
	}
	return args, ranges, nil
}

func parseTransformerSpec(spec string, baseOffset int) (Transformer, error) {
	parenIdx := strings.Index(spec, "(")
	if parenIdx == -1 {
		return Transformer{
			Name:           spec,
			Arguments:      []any{},
			Range:          Range{Start: baseOffset, End: baseOffset + len(spec)},
			NameRange:      Range{Start: baseOffset, End: baseOffset + len(spec)},
			ArgumentRanges: []Range{},
		}, nil
	}
	name := spec[:parenIdx]
	closeIdx := strings.LastIndex(spec, ")")
	if closeIdx == -1 {
		partialArgsStr := spec[parenIdx+1:]
		if len(partialArgsStr) > 0 {
			argValues, argRanges, err := parseTransformerArguments(partialArgsStr, baseOffset+parenIdx+1)
			if err != nil {
				return Transformer{}, err
			}
			return Transformer{
				Name:           name,
				Arguments:      argValues,
				Range:          Range{Start: baseOffset, End: baseOffset + len(spec)},
				NameRange:      Range{Start: baseOffset, End: baseOffset + parenIdx},
				ArgumentRanges: argRanges,
			}, nil
		}
		return Transformer{
			Name:           name,
			Arguments:      []any{},
			Range:          Range{Start: baseOffset, End: baseOffset + len(spec)},
			NameRange:      Range{Start: baseOffset, End: baseOffset + parenIdx},
			ArgumentRanges: []Range{},
		}, nil
	}
	argsStr := spec[parenIdx+1 : closeIdx]
	argValues, argRanges, err := parseTransformerArguments(argsStr, baseOffset+parenIdx+1)
	if err != nil {
		return Transformer{}, err
	}
	return Transformer{
		Name:           name,
		Arguments:      argValues,
		Range:          Range{Start: baseOffset, End: baseOffset + len(spec)},
		NameRange:      Range{Start: baseOffset, End: baseOffset + parenIdx},
		ArgumentRanges: argRanges,
	}, nil
}

func ParseKey(keyString string, baseOffset int) (Key, error) {
	parts := strings.Split(keyString, "|")
	baseKeyString := parts[0]
	transformerSpecs := parts[1:]

	parser := &keyParser{}
	key, err := parser.parse(baseKeyString, baseOffset)
	if err != nil {
		return key, err
	}

	if len(transformerSpecs) > 0 {
		key.Transformers = make([]Transformer, len(transformerSpecs))
		runningOffset := baseOffset + len(baseKeyString) + 1
		for i, spec := range transformerSpecs {
			parsed, err := parseTransformerSpec(spec, runningOffset)
			if err != nil {
				return Key{}, err
			}
			if parsed.Name == "" {
				return Key{}, &KeyParseError{
					Message: "empty transformer name in key",
					Range:   Range{Start: runningOffset, End: runningOffset + len(spec)},
				}
			}
			key.Transformers[i] = parsed
			runningOffset += len(spec) + 1
		}
		key.Raw = keyString
		key.Range = Range{Start: baseOffset, End: baseOffset + len(keyString)}
	}

	return key, nil
}
