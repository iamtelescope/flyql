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

// TransformerRange holds source ranges for a transformer name and its arguments.
type TransformerRange struct {
	NameRange      flyql.Range   `json:"-"`
	ArgumentRanges []flyql.Range `json:"-"`
}

// Renderer represents a post-alias renderer descriptor (e.g., href("/x")).
// Renderers are parsed/validated metadata; they never affect SQL.
type Renderer struct {
	Name      string `json:"name"`
	Arguments []any  `json:"arguments"`
}

// RendererRange holds source ranges for a renderer name and its arguments.
type RendererRange struct {
	NameRange      flyql.Range   `json:"-"`
	ArgumentRanges []flyql.Range `json:"-"`
}

// ParsedColumn represents a fully parsed column with segments and metadata.
type ParsedColumn struct {
	Name              string             `json:"name"`
	Transformers      []Transformer      `json:"transformers"`
	Alias             *string            `json:"alias"`
	Segments          []string           `json:"segments"`
	IsSegmented       bool               `json:"is_segmented"`
	DisplayName       string             `json:"display_name"`
	Renderers         []Renderer         `json:"renderers,omitempty"`
	NameRange         flyql.Range        `json:"-"`
	TransformerRanges []TransformerRange `json:"-"`
	RendererRanges    []RendererRange    `json:"-"`
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
	stateExpectRenderer
	stateRenderer
	stateRendererComplete
	stateExpectRendererArgument
	stateRendererArgument
	stateRendererArgumentDoubleQuoted
	stateRendererArgumentSingleQuoted
	stateExpectRendererArgumentDelimiter
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

type transformerRangeData struct {
	nameRange      flyql.Range
	argumentRanges []flyql.Range
}

type rendererRangeData struct {
	nameRange      flyql.Range
	argumentRanges []flyql.Range
}

type columnData struct {
	name              string
	transformers      []Transformer
	renderers         []Renderer
	alias             string
	nameRange         flyql.Range
	transformerRanges []transformerRangeData
	rendererRanges    []rendererRangeData
}

// Capabilities controls which parser features are enabled.
type Capabilities struct {
	Transformers bool
	Renderers    bool
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
	renderer                string
	rendererArgument        string
	rendererArgumentType    string
	renderers               []Renderer
	rendererArguments       []any
	columns                 []columnData
	columnStart             int
	transformerStart        int
	transformerArgStart     int
	transformerArgRanges    []flyql.Range
	transformerRanges       []transformerRangeData
	rendererStart           int
	rendererArgStart        int
	rendererArgRanges       []flyql.Range
	rendererRanges          []rendererRangeData
}

func newParser(capabilities Capabilities) *parser {
	return &parser{
		capabilities:            capabilities,
		state:                   stateExpectColumn,
		transformerArgumentType: "auto",
		rendererArgumentType:    "auto",
		transformers:            []Transformer{},
		transformerArguments:    []any{},
		renderers:               []Renderer{},
		rendererArguments:       []any{},
		columnStart:             -1,
		transformerStart:        -1,
		transformerArgStart:     -1,
		transformerArgRanges:    []flyql.Range{},
		transformerRanges:       []transformerRangeData{},
		rendererStart:           -1,
		rendererArgStart:        -1,
		rendererArgRanges:       []flyql.Range{},
		rendererRanges:          []rendererRangeData{},
	}
}

func (p *parser) storeColumn() {
	var nameRange flyql.Range
	if p.columnStart >= 0 {
		nameRange = flyql.Range{Start: p.columnStart, End: p.columnStart + len(p.column)}
	}
	p.columns = append(p.columns, columnData{
		name:              p.column,
		transformers:      p.transformers,
		renderers:         p.renderers,
		alias:             p.alias,
		nameRange:         nameRange,
		transformerRanges: p.transformerRanges,
		rendererRanges:    p.rendererRanges,
	})
	p.resetData()
}

func (p *parser) storeRenderer() {
	p.renderers = append(p.renderers, Renderer{
		Name:      p.renderer,
		Arguments: p.rendererArguments,
	})
	var nameRange flyql.Range
	if p.rendererStart >= 0 {
		nameRange = flyql.Range{Start: p.rendererStart, End: p.rendererStart + len(p.renderer)}
	}
	argRanges := p.rendererArgRanges
	if argRanges == nil {
		argRanges = []flyql.Range{}
	}
	p.rendererRanges = append(p.rendererRanges, rendererRangeData{
		nameRange:      nameRange,
		argumentRanges: argRanges,
	})
	p.resetRendererData()
}

func (p *parser) storeRendererArgument() {
	var value any = p.rendererArgument
	if p.rendererArgumentType == "auto" {
		if iv, err := strconv.Atoi(p.rendererArgument); err == nil {
			value = iv
		} else if fv, err := strconv.ParseFloat(p.rendererArgument, 64); err == nil {
			value = fv
		}
	}
	p.rendererArguments = append(p.rendererArguments, value)
	if p.rendererArgStart >= 0 {
		var end int
		if p.rendererArgumentType == "str" {
			end = p.charPos + 1
		} else {
			end = p.rendererArgStart + len(p.rendererArgument)
		}
		p.rendererArgRanges = append(p.rendererArgRanges, flyql.Range{Start: p.rendererArgStart, End: end})
	}
	p.resetRendererArgument()
}

func (p *parser) resetRendererData() {
	p.renderer = ""
	p.rendererArguments = []any{}
	p.rendererArgument = ""
	p.rendererStart = -1
	p.rendererArgStart = -1
	p.rendererArgRanges = []flyql.Range{}
}

func (p *parser) resetRendererArgument() {
	p.rendererArgument = ""
	p.rendererArgumentType = "auto"
	p.rendererArgStart = -1
}

func (p *parser) storeTransformer() {
	p.transformers = append(p.transformers, Transformer{
		Name:      p.transformer,
		Arguments: p.transformerArguments,
	})
	var nameRange flyql.Range
	if p.transformerStart >= 0 {
		nameRange = flyql.Range{Start: p.transformerStart, End: p.transformerStart + len(p.transformer)}
	}
	argRanges := p.transformerArgRanges
	if argRanges == nil {
		argRanges = []flyql.Range{}
	}
	p.transformerRanges = append(p.transformerRanges, transformerRangeData{
		nameRange:      nameRange,
		argumentRanges: argRanges,
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
	if p.transformerArgStart >= 0 {
		var end int
		if p.transformerArgumentType == "str" {
			end = p.charPos + 1
		} else {
			end = p.transformerArgStart + len(p.transformerArgument)
		}
		p.transformerArgRanges = append(p.transformerArgRanges, flyql.Range{Start: p.transformerArgStart, End: end})
	}
	p.resetTransformerArgument()
}

func (p *parser) resetTransformerData() {
	p.transformer = ""
	p.transformerArguments = []any{}
	p.transformerArgument = ""
	p.transformerStart = -1
	p.transformerArgStart = -1
	p.transformerArgRanges = []flyql.Range{}
}

func (p *parser) resetTransformerArgument() {
	p.transformerArgument = ""
	p.transformerArgumentType = "auto"
	p.transformerArgStart = -1
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
	p.columnStart = -1
	p.transformerStart = -1
	p.transformerArgStart = -1
	p.transformerArgRanges = []flyql.Range{}
	p.transformerRanges = []transformerRangeData{}
	p.renderer = ""
	p.renderers = []Renderer{}
	p.rendererArguments = []any{}
	p.rendererArgument = ""
	p.rendererArgumentType = "auto"
	p.rendererStart = -1
	p.rendererArgStart = -1
	p.rendererArgRanges = []flyql.Range{}
	p.rendererRanges = []rendererRangeData{}
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
		case stateExpectRenderer:
			p.inStateExpectRenderer()
		case stateRenderer:
			p.inStateRenderer()
		case stateRendererComplete:
			p.inStateRendererComplete()
		case stateExpectRendererArgument:
			p.inStateExpectRendererArgument()
		case stateRendererArgument:
			p.inStateRendererArgument()
		case stateRendererArgumentDoubleQuoted:
			p.inStateRendererArgumentDoubleQuoted()
		case stateRendererArgumentSingleQuoted:
			p.inStateRendererArgumentSingleQuoted()
		case stateExpectRendererArgumentDelimiter:
			p.inStateExpectRendererArgumentDelimiter()
		default:
			p.setErrorState(fmt.Sprintf("unknown state: %d", p.state), columnsErrUnknownState)
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
			p.setErrorState("unexpected end of alias. Expected alias value", columnsErrUnexpectedEndOfAliasOperator)
		}
	case stateExpectAliasOperator:
		if p.aliasOperator != "" {
			p.setErrorState("unexpected end of alias. Expected alias value", columnsErrUnexpectedEndExpectedAliasValue)
		} else {
			p.storeColumn()
		}
	case stateExpectAliasDelimiter:
		p.setErrorState("unexpected end of alias. Expected alias value", columnsErrUnexpectedEndExpectedAliasValue)
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
		p.setErrorState("unexpected end of quoted argument value", columnsErrUnexpectedEndOfQuotedArg)
	case stateExpectTransformerArgumentDelimiter:
		p.setErrorState("unexpected end of arguments list", columnsErrUnexpectedEndOfArgsList)
	case stateExpectTransformerArgument:
		p.setErrorState("expected closing parenthesis", columnsErrExpectedClosingParen)
	case stateTransformerArgument:
		p.setErrorState("expected closing parenthesis", columnsErrExpectedClosingParen)
	case stateExpectTransformer:
		p.setErrorState("expected transformer after operator", columnsErrInvalidTransformerOrRenderer)
	case stateRenderer:
		if p.renderer != "" {
			p.storeRenderer()
		}
		if p.column != "" {
			p.storeColumn()
		}
	case stateRendererComplete:
		p.storeRenderer()
		p.storeColumn()
	case stateRendererArgumentDoubleQuoted, stateRendererArgumentSingleQuoted:
		p.setErrorState("unexpected end of quoted argument value", columnsErrUnexpectedEndOfQuotedArg)
	case stateExpectRendererArgumentDelimiter:
		p.setErrorState("unexpected end of arguments list", columnsErrUnexpectedEndOfArgsList)
	case stateExpectRendererArgument:
		p.setErrorState("expected closing parenthesis", columnsErrExpectedClosingParen)
	case stateRendererArgument:
		p.setErrorState("expected closing parenthesis", columnsErrExpectedClosingParen)
	case stateExpectRenderer:
		p.setErrorState("expected renderer after operator", columnsErrInvalidTransformerOrRenderer)
	}
}

func (p *parser) inStateExpectColumn() {
	if p.charValue == " " {
		return
	} else if isColumnValue(p.charValue) {
		if p.columnStart < 0 {
			p.columnStart = p.charPos
		}
		p.column += p.charValue
		p.state = stateColumn
	} else {
		p.setErrorState("invalid character", columnsErrInvalidCharExpectColumn)
	}
}

func (p *parser) inStateColumn() {
	if p.charValue == " " {
		p.state = stateExpectAliasOperator
	} else if isColumnValue(p.charValue) {
		if p.columnStart < 0 {
			p.columnStart = p.charPos
		}
		p.column += p.charValue
	} else if p.charValue == "," {
		p.state = stateExpectColumn
		p.storeColumn()
	} else if p.charValue == "|" {
		if !p.capabilities.Transformers {
			p.setErrorState("transformers are not enabled", columnsErrTransformersNotEnabled)
			return
		}
		p.state = stateExpectTransformer
	} else {
		p.setErrorState("invalid character", columnsErrInvalidCharInColumn)
	}
}

func (p *parser) inStateExpectTransformer() {
	if isTransformerValue(p.charValue) {
		if p.transformerStart < 0 {
			p.transformerStart = p.charPos
		}
		p.transformer += p.charValue
		p.state = stateTransformer
	} else {
		p.setErrorState("invalid character, expected transformer", columnsErrInvalidTransformerOrRenderer)
	}
}

func (p *parser) inStateTransformer() {
	if isTransformerValue(p.charValue) {
		if p.transformerStart < 0 {
			p.transformerStart = p.charPos
		}
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
		p.setErrorState("unsupported close bracket", columnsErrInvalidCharAfterArgs)
	} else {
		p.setErrorState("unsupported char in transformer", columnsErrInvalidCharAfterArgs)
	}
}

func (p *parser) inStateExpectTransformerArgument() {
	if p.charValue == " " {
		return
	}
	if p.charValue == "\"" {
		p.transformerArgumentType = "str"
		p.transformerArgStart = p.charPos
		p.state = stateTransformerArgumentDoubleQuoted
	} else if p.charValue == "'" {
		p.transformerArgumentType = "str"
		p.transformerArgStart = p.charPos
		p.state = stateTransformerArgumentSingleQuoted
	} else if isTransformerArgumentValue(p.charValue) {
		if p.transformerArgStart < 0 {
			p.transformerArgStart = p.charPos
		}
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
		if p.transformerArgStart < 0 {
			p.transformerArgStart = p.charPos
		}
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
		p.setErrorState("invalid character. Expected bracket close or transformer argument delimiter", columnsErrInvalidCharInArgs)
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
		p.setErrorState("invalid character", columnsErrInvalidCharInQuotedArg)
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
		p.setErrorState("invalid character", columnsErrInvalidCharInQuotedArg)
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
			p.setErrorState("transformers are not enabled", columnsErrTransformersNotEnabled)
			return
		}
		p.storeTransformer()
		p.state = stateExpectTransformer
	} else {
		p.setErrorState("invalid character", columnsErrInvalidCharAfterArgs)
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
				p.setErrorState("invalid character", columnsErrInvalidCharExpectAliasOperator)
			} else {
				p.state = stateExpectAliasDelimiter
				p.aliasOperator = ""
			}
		}
	} else {
		p.setErrorState("invalid character, expected alias operator", columnsErrInvalidCharExpectedAliasOperator)
	}
}

func (p *parser) inStateExpectAlias() {
	if p.charValue == " " {
		return
	} else if isColumnValue(p.charValue) {
		p.alias += p.charValue // alias doesn't need range tracking
	} else if p.charValue == "," {
		p.state = stateExpectColumn
		p.storeColumn()
	} else if p.charValue == "|" {
		if !p.capabilities.Renderers {
			p.setErrorState("renderers are not enabled", columnsErrRenderersNotEnabledOrNoAlias)
			return
		}
		if p.alias == "" {
			p.setErrorState("renderers require an alias", columnsErrRenderersNotEnabledOrNoAlias)
			return
		}
		p.state = stateExpectRenderer
	}
}

func (p *parser) inStateExpectRenderer() {
	if isTransformerValue(p.charValue) {
		if p.rendererStart < 0 {
			p.rendererStart = p.charPos
		}
		p.renderer += p.charValue
		p.state = stateRenderer
	} else {
		p.setErrorState("invalid character, expected renderer", columnsErrInvalidTransformerOrRenderer)
	}
}

func (p *parser) inStateRenderer() {
	if isTransformerValue(p.charValue) {
		if p.rendererStart < 0 {
			p.rendererStart = p.charPos
		}
		p.renderer += p.charValue
	} else if p.charValue == "," {
		p.storeRenderer()
		p.storeColumn()
		p.state = stateExpectColumn
	} else if p.charValue == "|" {
		p.storeRenderer()
		p.state = stateExpectRenderer
	} else if p.charValue == " " {
		// Do NOT store here — stateRendererComplete handlers (on ',', '|',
		// or EOF via inStateLastChar) perform the single store. Storing here
		// would create a phantom empty renderer on any subsequent separator.
		p.state = stateRendererComplete
	} else if p.charValue == "(" {
		p.state = stateExpectRendererArgument
	} else {
		p.setErrorState("invalid character in renderer name", columnsErrInvalidTransformerOrRenderer)
	}
}

func (p *parser) inStateRendererComplete() {
	if p.charValue == " " {
		return
	} else if p.charValue == "," {
		p.storeRenderer()
		p.storeColumn()
		p.state = stateExpectColumn
	} else if p.charValue == "|" {
		p.storeRenderer()
		p.state = stateExpectRenderer
	} else {
		p.setErrorState("invalid character", columnsErrInvalidCharAfterArgs)
	}
}

func (p *parser) inStateExpectRendererArgument() {
	if p.charValue == " " {
		return
	}
	if p.charValue == "\"" {
		p.rendererArgumentType = "str"
		p.rendererArgStart = p.charPos
		p.state = stateRendererArgumentDoubleQuoted
	} else if p.charValue == "'" {
		p.rendererArgumentType = "str"
		p.rendererArgStart = p.charPos
		p.state = stateRendererArgumentSingleQuoted
	} else if isTransformerArgumentValue(p.charValue) {
		if p.rendererArgStart < 0 {
			p.rendererArgStart = p.charPos
		}
		p.rendererArgument += p.charValue
		p.state = stateRendererArgument
	} else if p.charValue == ")" {
		if p.rendererArgument != "" {
			p.storeRendererArgument()
		}
		p.state = stateRendererComplete
	}
}

func (p *parser) inStateRendererArgument() {
	if p.charValue == "," {
		p.storeRendererArgument()
		p.state = stateExpectRendererArgument
	} else if isTransformerArgumentValue(p.charValue) {
		if p.rendererArgStart < 0 {
			p.rendererArgStart = p.charPos
		}
		p.rendererArgument += p.charValue
	} else if p.charValue == ")" {
		p.storeRendererArgument()
		p.state = stateRendererComplete
	}
}

func (p *parser) inStateExpectRendererArgumentDelimiter() {
	if p.charValue == "," {
		p.state = stateExpectRendererArgument
	} else if p.charValue == ")" {
		p.state = stateRendererComplete
	} else {
		p.setErrorState("invalid character. Expected bracket close or renderer argument delimiter", columnsErrInvalidCharInArgs)
	}
}

func (p *parser) inStateRendererArgumentDoubleQuoted() {
	if p.charValue == "\\" {
		nextPos := p.charPos + 1
		if nextPos < len(p.text) {
			nextChar := p.text[nextPos]
			if nextChar != '"' {
				p.rendererArgument += p.charValue
			}
		} else {
			p.rendererArgument += p.charValue
		}
	} else if p.charValue != "\"" {
		p.rendererArgument += p.charValue
	} else if p.charValue == "\"" {
		prevPos := p.charPos - 1
		if prevPos >= 0 && p.text[prevPos] == '\\' {
			p.rendererArgument += p.charValue
		} else {
			p.storeRendererArgument()
			p.state = stateExpectRendererArgumentDelimiter
		}
	} else {
		p.setErrorState("invalid character", columnsErrInvalidCharInQuotedArg)
	}
}

func (p *parser) inStateRendererArgumentSingleQuoted() {
	if p.charValue == "\\" {
		nextPos := p.charPos + 1
		if nextPos < len(p.text) {
			nextChar := p.text[nextPos]
			if nextChar != '\'' {
				p.rendererArgument += p.charValue
			}
		} else {
			p.rendererArgument += p.charValue
		}
	} else if p.charValue != "'" {
		p.rendererArgument += p.charValue
	} else if p.charValue == "'" {
		prevPos := p.charPos - 1
		if prevPos >= 0 && p.text[prevPos] == '\\' {
			p.rendererArgument += p.charValue
		} else {
			p.storeRendererArgument()
			p.state = stateExpectRendererArgumentDelimiter
		}
	} else {
		p.setErrorState("invalid character", columnsErrInvalidCharInQuotedArg)
	}
}

func (p *parser) inStateExpectAliasDelimiter() {
	if p.charValue == " " {
		p.state = stateExpectAlias
	} else {
		p.setErrorState("invalid character, expected alias delimiter", columnsErrInvalidCharExpectedAliasDelimiter)
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
		key, err := flyql.ParseKey(col.name, 0)
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

		trRanges := make([]TransformerRange, len(col.transformerRanges))
		for ri, rd := range col.transformerRanges {
			argRanges := rd.argumentRanges
			if argRanges == nil {
				argRanges = []flyql.Range{}
			}
			trRanges[ri] = TransformerRange{
				NameRange:      rd.nameRange,
				ArgumentRanges: argRanges,
			}
		}

		var renderers []Renderer
		if len(col.renderers) > 0 {
			renderers = make([]Renderer, len(col.renderers))
			for i, r := range col.renderers {
				args := r.Arguments
				if args == nil {
					args = []any{}
				}
				renderers[i] = Renderer{Name: r.Name, Arguments: args}
			}
		}
		rRanges := make([]RendererRange, len(col.rendererRanges))
		for ri, rd := range col.rendererRanges {
			argRanges := rd.argumentRanges
			if argRanges == nil {
				argRanges = []flyql.Range{}
			}
			rRanges[ri] = RendererRange{
				NameRange:      rd.nameRange,
				ArgumentRanges: argRanges,
			}
		}

		result = append(result, ParsedColumn{
			Name:              col.name,
			Transformers:      transformers,
			Alias:             alias,
			Segments:          segments,
			IsSegmented:       key.IsSegmented(),
			DisplayName:       displayName,
			Renderers:         renderers,
			NameRange:         col.nameRange,
			TransformerRanges: trRanges,
			RendererRanges:    rRanges,
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
