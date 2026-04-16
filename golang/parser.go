package flyql

import (
	"fmt"
	"strconv"
	"strings"
	"unicode"

	"github.com/iamtelescope/flyql/golang/literal"
)

var validKeyValueOperators = map[string]bool{
	OpEquals:          true,
	OpNotEquals:       true,
	OpRegex:           true,
	OpNotRegex:        true,
	OpGreater:         true,
	OpLess:            true,
	OpGreaterOrEquals: true,
	OpLessOrEquals:    true,
	OpIn:              true,
	OpNotIn:           true,
	OpHas:             true,
	OpNotHas:          true,
	OpLike:            true,
	OpNotLike:         true,
	OpILike:           true,
	OpNotILike:        true,
}

var validBoolOperators = map[string]bool{
	BoolOpAnd: true,
	BoolOpOr:  true,
}

var validBoolOperatorChars = map[rune]bool{
	'a': true,
	'n': true,
	'd': true,
	'o': true,
	'r': true,
}

type Parser struct {
	pos                        int
	line                       int
	linePos                    int
	text                       string
	state                      state
	char                       *char
	key                        string
	value                      string
	valueIsString              *bool
	keyValueOperator           string
	boolOperator               string
	currentNode                *Node
	nodesStack                 []*Node
	boolOpStack                []string
	errorText                  string
	errno                      int
	Root                       *Node
	pendingNegation            bool
	negationStack              []bool
	inListValues               []any
	inListCurrentValue         string
	inListCurrentValueIsString *bool
	inListValuesType           *string
	inListValuesTypes          []literal.LiteralKind
	isNotIn                    bool
	isNotHas                   bool
	isNotLike                  bool
	isNotIlike                 bool
	valueQuoteChar             rune
	inListQuoteChar            rune
	pipeSeenInKey              bool
	transformerParenDepth      int
	transformerQuote           rune
	TypedChars                 []TypedChar
	errorRange                 Range
	keyStart                   int
	keyEnd                     int
	valueStart                 int
	valueEnd                   int
	operatorStart              int
	operatorEnd                int
	exprStart                  int
	boolOpStartStack           []int
	boolOpEndStack             []int
	groupStartStack            []int
	inListValueStart           int
	inListValueEnd             int
	inListValueRanges          []Range
	functionName               string
	functionDurationBuf        string
	functionArgs               []string
	functionDurations          []Duration
	functionCurrentArg         string
	functionParameterArgs      []*Parameter
	functionParamBuf           string
	// MaxDepth is the maximum nesting depth for boolean-grouping parens.
	// Values <= 0 disable the limit. Read on every group-open, so
	// mid-parse mutation takes effect on the next '('.
	MaxDepth int
	depth    int
}

func NewParser() *Parser {
	return &Parser{
		boolOperator:     BoolOpAnd,
		state:            stateInitial,
		keyStart:         -1,
		keyEnd:           -1,
		valueStart:       -1,
		valueEnd:         -1,
		operatorStart:    -1,
		operatorEnd:      -1,
		exprStart:        -1,
		inListValueStart: -1,
		inListValueEnd:   -1,
		MaxDepth:         128,
	}
}

func (p *Parser) setErrorState(errorText string, errno int) {
	p.state = stateError
	p.errorText = errorText
	p.errno = errno
	if p.char != nil {
		p.errorRange = Range{Start: p.char.pos, End: p.char.pos + 1}
	} else {
		p.errorRange = Range{Start: p.pos, End: p.pos}
	}
}

func (p *Parser) resetKey() {
	p.key = ""
	p.pipeSeenInKey = false
	p.transformerParenDepth = 0
	p.transformerQuote = 0
	p.keyStart = -1
	p.keyEnd = -1
}

func (p *Parser) resetValue() {
	p.value = ""
	p.valueIsString = nil
	p.valueStart = -1
	p.valueEnd = -1
}

func (p *Parser) resetKeyValueOperator() {
	p.keyValueOperator = ""
	p.operatorStart = -1
	p.operatorEnd = -1
}

func (p *Parser) resetData() {
	p.resetKey()
	p.resetValue()
	p.resetKeyValueOperator()
	p.resetInListData()
	p.exprStart = -1
}

func (p *Parser) resetInListData() {
	p.inListValues = nil
	p.inListCurrentValue = ""
	p.inListCurrentValueIsString = nil
	p.inListValuesType = nil
	p.inListValuesTypes = nil
	p.isNotIn = false
	p.isNotHas = false
	p.isNotLike = false
	p.isNotIlike = false
	p.inListValueStart = -1
	p.inListValueEnd = -1
	p.inListValueRanges = nil
}

func (p *Parser) extendInListCurrentValue() {
	if p.char != nil {
		if p.inListValueStart == -1 {
			p.inListValueStart = p.char.pos
		}
		p.inListValueEnd = p.char.pos + 1
		p.inListCurrentValue += string(p.char.value)
	}
}

func (p *Parser) setInListCurrentValueIsString() {
	t := true
	p.inListCurrentValueIsString = &t
	p.inListQuoteChar = p.char.value
}

func (p *Parser) finalizeInListValue() bool {
	if p.inListCurrentValue == "" && p.inListCurrentValueIsString == nil {
		return true
	}

	var value any
	var explicitType literal.LiteralKind

	if p.inListCurrentValueIsString != nil && *p.inListCurrentValueIsString {
		value = unescapeQuotes(p.inListCurrentValue, p.inListQuoteChar)
		explicitType = literal.String
	} else if p.inListCurrentValue == "null" {
		value = nil
		explicitType = literal.Null
	} else if p.inListCurrentValue == "true" || p.inListCurrentValue == "false" {
		value = p.inListCurrentValue == "true"
		explicitType = literal.Boolean
	} else {
		value, explicitType = convertUnquotedValue(p.inListCurrentValue)
	}

	p.inListValues = append(p.inListValues, value)
	p.inListValuesTypes = append(p.inListValuesTypes, explicitType)
	if p.inListValueStart >= 0 {
		p.inListValueRanges = append(p.inListValueRanges, Range{Start: p.inListValueStart, End: p.inListValueEnd})
	}
	p.inListCurrentValue = ""
	p.inListCurrentValueIsString = nil
	p.inListValueStart = -1
	p.inListValueEnd = -1
	return true
}

func (p *Parser) resetBoolOperator() {
	p.boolOperator = ""
}

func (p *Parser) setValueIsString() {
	t := true
	p.valueIsString = &t
	p.valueQuoteChar = p.char.value
	if p.char != nil {
		if p.valueStart == -1 {
			p.valueStart = p.char.pos
		}
		p.valueEnd = p.char.pos + 1
	}
}

func (p *Parser) extendKey() {
	if p.char != nil {
		if p.keyStart == -1 {
			p.keyStart = p.char.pos
			if p.exprStart == -1 {
				p.exprStart = p.char.pos
			}
		}
		p.keyEnd = p.char.pos + 1
		p.key += string(p.char.value)
	}
}

func (p *Parser) extendValue() {
	if p.char != nil {
		if p.valueStart == -1 {
			p.valueStart = p.char.pos
		}
		p.valueEnd = p.char.pos + 1
		p.value += string(p.char.value)
	}
}

func (p *Parser) extendKeyValueOperator() {
	if p.char != nil {
		if p.operatorStart == -1 {
			p.operatorStart = p.char.pos
		}
		p.operatorEnd = p.char.pos + 1
		p.keyValueOperator += string(p.char.value)
	}
}

func (p *Parser) storeTypedChar(charType string) {
	if p.char != nil {
		p.TypedChars = append(p.TypedChars, TypedChar{
			Value:   p.char.value,
			Pos:     p.char.pos,
			Line:    p.char.line,
			LinePos: p.char.linePos,
			Type:    charType,
		})
	}
}

func (p *Parser) extendBoolOperator() {
	if p.char != nil {
		if p.boolOperator == "" {
			p.boolOpStartStack = append(p.boolOpStartStack, p.char.pos)
			p.boolOpEndStack = append(p.boolOpEndStack, p.char.pos+1)
		} else if len(p.boolOpEndStack) > 0 {
			p.boolOpEndStack[len(p.boolOpEndStack)-1] = p.char.pos + 1
		}
		p.boolOperator += string(p.char.value)
	}
}

func (p *Parser) extendNodesStack() {
	if p.currentNode != nil {
		p.nodesStack = append(p.nodesStack, p.currentNode)
	}
}

func (p *Parser) extendBoolOpStack() {
	p.boolOpStack = append(p.boolOpStack, p.boolOperator)
}

func unescapeQuotes(s string, quoteChar rune) string {
	if quoteChar == '\'' {
		return strings.ReplaceAll(s, `\'`, `'`)
	}
	return strings.ReplaceAll(s, `\"`, `"`)
}

func (p *Parser) buildExprRanges(end int) (exprRange Range, keyRange Range, operatorRange *Range) {
	keyRange = Range{Start: p.keyStart, End: p.keyEnd}
	if p.operatorStart >= 0 {
		or := Range{Start: p.operatorStart, End: p.operatorEnd}
		operatorRange = &or
	}
	start := p.exprStart
	if start < 0 {
		start = p.keyStart
	}
	exprRange = Range{Start: start, End: end}
	return
}

func (p *Parser) parseKeyWithRange(keyRange Range) (Key, bool) {
	parsed, err := ParseKey(p.key, keyRange.Start)
	if err != nil {
		if kpe, ok := err.(*KeyParseError); ok {
			p.state = stateError
			p.errorText = kpe.Message
			p.errno = 60
			p.errorRange = kpe.Range
		} else {
			p.setErrorState(err.Error(), 1)
		}
		return Key{Segments: []string{""}, Range: keyRange, SegmentRanges: []Range{keyRange}}, false
	}
	return parsed, true
}

func (p *Parser) newExpression() *Expression {
	var exprEnd int
	if p.valueEnd >= 0 {
		exprEnd = p.valueEnd
	} else if p.operatorEnd >= 0 {
		exprEnd = p.operatorEnd
	} else {
		exprEnd = p.keyEnd
	}
	exprRange, keyRange, operatorRange := p.buildExprRanges(exprEnd)
	var valueRange *Range
	if p.valueStart >= 0 {
		vr := Range{Start: p.valueStart, End: p.valueEnd}
		valueRange = &vr
	}
	key, _ := p.parseKeyWithRange(keyRange)
	valueIsString := p.valueIsString != nil && *p.valueIsString
	value := p.value

	if value == "null" && !valueIsString {
		if p.keyValueOperator != OpEquals && p.keyValueOperator != OpNotEquals {
			p.setErrorState(fmt.Sprintf("null value cannot be used with operator '%s'", p.keyValueOperator), 51)
		}
		return &Expression{
			Key:           key,
			Operator:      p.keyValueOperator,
			Value:         nil,
			ValueType:     literal.Null,
			Range:         exprRange,
			OperatorRange: operatorRange,
			ValueRange:    valueRange,
		}
	}

	if (value == "true" || value == "false") && !valueIsString {
		return &Expression{
			Key:           key,
			Operator:      p.keyValueOperator,
			Value:         value == "true",
			ValueType:     literal.Boolean,
			Range:         exprRange,
			OperatorRange: operatorRange,
			ValueRange:    valueRange,
		}
	}

	if valueIsString && p.keyValueOperator != OpRegex && p.keyValueOperator != OpNotRegex {
		value = unescapeQuotes(value, p.valueQuoteChar)
	}
	expr, exprErr := NewExpression(key, p.keyValueOperator, value, valueIsString)
	if exprErr != nil {
		p.setErrorState(exprErr.Error(), 1)
		return nil
	}
	expr.Range = exprRange
	expr.OperatorRange = operatorRange
	expr.ValueRange = valueRange
	return expr
}

func (p *Parser) newTruthyExpression() *Expression {
	exprEnd := p.keyEnd
	exprRange, keyRange, _ := p.buildExprRanges(exprEnd)
	key, _ := p.parseKeyWithRange(keyRange)
	expr, exprErr := NewExpression(key, OpTruthy, "", true)
	if exprErr != nil {
		p.setErrorState(exprErr.Error(), 1)
		return nil
	}
	expr.Range = exprRange
	return expr
}

func (p *Parser) newInExpression() *Expression {
	var exprEnd int
	if p.char != nil {
		exprEnd = p.char.pos + 1
	}
	exprRange, keyRange, _ := p.buildExprRanges(exprEnd)
	key, _ := p.parseKeyWithRange(keyRange)
	operator := OpIn
	if p.isNotIn {
		operator = OpNotIn
	}
	expr := NewInExpression(key, operator, p.inListValues, p.inListValuesType, p.inListValuesTypes)
	expr.Range = exprRange
	expr.ValueRanges = append([]Range(nil), p.inListValueRanges...)
	return expr
}

func (p *Parser) togglePendingNegation() {
	p.pendingNegation = !p.pendingNegation
}

func (p *Parser) consumePendingNegation() bool {
	negated := p.pendingNegation
	p.pendingNegation = false
	return negated
}

func (p *Parser) popBoolOpRange() *Range {
	if len(p.boolOpStartStack) > 0 && len(p.boolOpEndStack) > 0 {
		s := p.boolOpStartStack[len(p.boolOpStartStack)-1]
		e := p.boolOpEndStack[len(p.boolOpEndStack)-1]
		p.boolOpStartStack = p.boolOpStartStack[:len(p.boolOpStartStack)-1]
		p.boolOpEndStack = p.boolOpEndStack[:len(p.boolOpEndStack)-1]
		r := Range{Start: s, End: e}
		return &r
	}
	return nil
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

var boolOpPrecedence = map[string]int{"and": 2, "or": 1}

func precedence(op string) int {
	return boolOpPrecedence[op]
}

// foldWithPrecedence folds `atom` into `current` under operator `op`
// respecting AND > OR precedence. One-level descent is sufficient
// because flyql has exactly two binary precedence levels.
func (p *Parser) foldWithPrecedence(current *Node, op string, atom *Node) *Node {
	if precedence(op) <= precedence(current.BoolOperator) {
		bopR := p.popBoolOpRange()
		n := NewBranchNode(op, current, atom)
		n.Range = Range{Start: current.Range.Start, End: atom.Range.End}
		n.BoolOperatorRange = bopR
		return n
	}
	// Incoming strictly higher precedence — descend one level
	bopR := p.popBoolOpRange()
	n := NewBranchNode(op, current.Right, atom)
	n.Range = Range{Start: current.Right.Range.Start, End: atom.Range.End}
	n.BoolOperatorRange = bopR
	current.Right = n
	current.Range = Range{Start: current.Range.Start, End: atom.Range.End}
	return current
}

func (p *Parser) extendTreeWithExpression(expression *Expression) {
	negated := p.consumePendingNegation()
	exprRange := Range{}
	if expression != nil {
		exprRange = expression.Range
	}
	if p.currentNode != nil && p.currentNode.Left == nil {
		if p.currentNode.Right != nil {
			// Grouped-prefix wrapper: Right holds a merged group sub-tree
			// from extendTreeFromStack's if-branch. Preserve source order
			// by promoting the group to Left and placing the new leaf in
			// Right.
			newLeaf := NewNode("", expression, nil, nil, negated)
			newLeaf.Range = exprRange
			p.currentNode.Left = p.currentNode.Right
			p.currentNode.Right = newLeaf
			p.currentNode.BoolOperator = p.boolOperator
			bopR := p.popBoolOpRange()
			if bopR != nil {
				p.currentNode.BoolOperatorRange = bopR
			}
			p.currentNode.Range = Range{
				Start: p.currentNode.Range.Start,
				End:   maxInt(p.currentNode.Range.End, exprRange.End),
			}
		} else {
			node := NewNode("", expression, nil, nil, negated)
			node.Range = exprRange
			p.currentNode.Left = node
			p.currentNode.BoolOperator = p.boolOperator
			p.currentNode.Range = Range{
				Start: minInt(p.currentNode.Range.Start, exprRange.Start),
				End:   maxInt(p.currentNode.Range.End, exprRange.End),
			}
		}
	} else if p.currentNode != nil && p.currentNode.Right == nil {
		node := NewNode("", expression, nil, nil, negated)
		node.Range = exprRange
		p.currentNode.Right = node
		p.currentNode.BoolOperator = p.boolOperator
		bopR := p.popBoolOpRange()
		if bopR != nil {
			p.currentNode.BoolOperatorRange = bopR
		}
		p.currentNode.Range = Range{
			Start: minInt(p.currentNode.Range.Start, exprRange.Start),
			End:   maxInt(p.currentNode.Range.End, exprRange.End),
		}
	} else {
		right := NewNode("", expression, nil, nil, negated)
		right.Range = exprRange
		p.currentNode = p.foldWithPrecedence(p.currentNode, p.boolOperator, right)
	}
}

func (p *Parser) extendTree() {
	p.extendTreeWithExpression(p.newExpression())
}

func (p *Parser) applyNegationToTree(node *Node, negated bool) {
	if !negated {
		return
	}
	if node.Expression == nil && node.Left != nil && node.Left.Expression != nil && node.Right == nil {
		node.Left.Negated = negated
	} else {
		node.Negated = negated
	}
}

// unwrapTrivialLeafWrapper returns the inner leaf if `node` is a trivial
// single-leaf wrapper (a non-negated binary-op node with a leaf in Left
// and nothing in Right). Used at group-merge sites so a sub-tree produced
// by a single-leaf group like `(a=1)` lands as a leaf in its parent,
// not as a malformed `AND{Left=leaf, Right=nil}` child node.
func (p *Parser) unwrapTrivialLeafWrapper(node *Node) *Node {
	if node != nil &&
		!node.Negated &&
		node.Expression == nil &&
		node.Left != nil &&
		node.Left.Expression != nil &&
		node.Left.Left == nil &&
		node.Left.Right == nil &&
		node.Right == nil {
		return node.Left
	}
	return node
}

func (p *Parser) extendTreeFromStack(boolOperator string) {
	if len(p.nodesStack) == 0 {
		return
	}
	node := p.nodesStack[len(p.nodesStack)-1]
	p.nodesStack = p.nodesStack[:len(p.nodesStack)-1]

	negated := false
	if len(p.negationStack) > 0 {
		negated = p.negationStack[len(p.negationStack)-1]
		p.negationStack = p.negationStack[:len(p.negationStack)-1]
	}

	var groupStart *int
	if len(p.groupStartStack) > 0 {
		gs := p.groupStartStack[len(p.groupStartStack)-1]
		p.groupStartStack = p.groupStartStack[:len(p.groupStartStack)-1]
		groupStart = &gs
		p.depth--
	}

	if node.Right == nil {
		if p.currentNode != nil {
			p.applyNegationToTree(p.currentNode, negated)
			p.currentNode = p.unwrapTrivialLeafWrapper(p.currentNode)
		}
		node.Right = p.currentNode
		if boolOperator != "" {
			node.BoolOperator = boolOperator
			bopR := p.popBoolOpRange()
			if bopR != nil {
				node.BoolOperatorRange = bopR
			}
		}
		if groupStart != nil && p.char != nil {
			node.Range = Range{Start: *groupStart, End: p.char.pos + 1}
		} else if p.currentNode != nil {
			node.Range = Range{Start: node.Range.Start, End: p.currentNode.Range.End}
		}
		p.currentNode = node
	} else {
		if p.currentNode != nil {
			p.applyNegationToTree(p.currentNode, negated)
			p.currentNode = p.unwrapTrivialLeafWrapper(p.currentNode)
		}
		// Edge case: `node` is a grouped-prefix wrapper from a prior
		// if-branch merge — shape `{Left=nil, Right=<sub-tree>}`. Discard
		// the wrapper entirely and build the new root directly, preserving
		// the OUTER group's `(` position from node.Range.Start rather
		// than popping groupStart (which tracks only the INNER group).
		if node.Left == nil && node.Right != nil {
			var bopR *Range
			if boolOperator != "" {
				bopR = p.popBoolOpRange()
			}
			rightEnd := p.currentNode.Range.End
			if p.char != nil {
				rightEnd = p.char.pos + 1
			}
			newNode := NewBranchNode(boolOperator, node.Right, p.currentNode)
			newNode.Range = Range{Start: node.Range.Start, End: rightEnd}
			newNode.BoolOperatorRange = bopR
			p.currentNode = newNode
		} else {
			newNode := p.foldWithPrecedence(node, boolOperator, p.currentNode)
			if p.char != nil {
				newNode.Range = Range{Start: newNode.Range.Start, End: p.char.pos + 1}
			}
			p.currentNode = newNode
		}
	}
}

func (p *Parser) inStateInitial() {
	if p.char == nil {
		return
	}

	p.resetData()
	p.exprStart = -1
	startPos := p.char.pos
	p.currentNode = NewNode(p.boolOperator, nil, nil, nil, false)
	p.currentNode.Range = Range{Start: startPos, End: startPos}

	if p.char.isGroupOpen() {
		p.groupStartStack = append(p.groupStartStack, startPos)
		if p.pendingNegation {
			p.negationStack = append(p.negationStack, true)
			p.pendingNegation = false
		} else {
			p.negationStack = append(p.negationStack, false)
		}
		p.extendNodesStack()
		p.extendBoolOpStack()
		p.depth++
		if p.MaxDepth > 0 && p.depth > p.MaxDepth {
			p.setErrorState(fmt.Sprintf("maximum nesting depth exceeded (%d)", p.MaxDepth), errMaxDepthExceeded)
			return
		}
		p.state = stateInitial
		p.storeTypedChar(CharTypeOperator)
	} else if p.char.isDelimiter() {
		p.state = stateBoolOpDelimiter
		p.storeTypedChar(CharTypeSpace)
	} else if p.char.isKey() {
		p.extendKey()
		p.state = stateKey
		p.storeTypedChar(CharTypeKey)
	} else if p.char.isSingleQuote() {
		p.extendKey()
		p.state = stateSingleQuotedKey
		p.storeTypedChar(CharTypeKey)
	} else if p.char.isDoubleQuote() {
		p.extendKey()
		p.state = stateDoubleQuotedKey
		p.storeTypedChar(CharTypeKey)
	} else {
		p.setErrorState("invalid character", 1)
	}
}

func (p *Parser) inStateKey() {
	if p.char == nil {
		return
	}

	if p.transformerQuote != 0 {
		p.extendKey()
		if p.char.value == p.transformerQuote {
			p.transformerQuote = 0
		}
		p.storeTypedChar(CharTypeArgumentString)
		return
	}
	if p.char.isDelimiter() {
		if p.transformerParenDepth > 0 {
			p.extendKey()
			p.storeTypedChar(CharTypeArgument)
			return
		}
		if p.key == NotKeyword {
			p.togglePendingNegation()
			p.resetKey()
			p.state = stateExpectNotTarget
		} else {
			p.state = stateKeyOrBoolOp
		}
		p.storeTypedChar(CharTypeSpace)
	} else if p.char.isKey() {
		p.extendKey()
		if p.char.value == '|' {
			p.pipeSeenInKey = true
			p.storeTypedChar(CharTypePipe)
		} else if p.transformerParenDepth > 0 {
			p.storeTypedChar(CharTypeArgumentNumber)
		} else if p.pipeSeenInKey {
			p.storeTypedChar(CharTypeTransformer)
		} else {
			p.storeTypedChar(CharTypeKey)
		}
	} else if p.transformerParenDepth > 0 && p.char.isParameterStart() {
		p.extendKey()
		p.storeTypedChar(CharTypeParameter)
	} else if p.pipeSeenInKey && (p.char.isGroupOpen() || p.char.isGroupClose() || p.char.isDoubleQuote() || p.char.isSingleQuote() || p.char.value == ',') {
		if p.char.isGroupOpen() {
			p.transformerParenDepth++
		} else if p.char.isGroupClose() {
			p.transformerParenDepth--
		} else if p.transformerParenDepth > 0 && (p.char.isDoubleQuote() || p.char.isSingleQuote()) {
			p.transformerQuote = p.char.value
			p.extendKey()
			p.storeTypedChar(CharTypeArgumentString)
			return
		}
		p.extendKey()
		p.storeTypedChar(CharTypeArgument)
	} else if p.char.isSingleQuote() {
		p.extendKey()
		p.state = stateSingleQuotedKey
		p.storeTypedChar(CharTypeKey)
	} else if p.char.isDoubleQuote() {
		p.extendKey()
		p.state = stateDoubleQuotedKey
		p.storeTypedChar(CharTypeKey)
	} else if p.char.isOp() {
		p.extendKeyValueOperator()
		p.state = stateKeyValueOperator
		p.storeTypedChar(CharTypeOperator)
	} else if p.char.isGroupClose() {
		if len(p.nodesStack) == 0 {
			p.setErrorState("unmatched parenthesis", 9)
			return
		}
		p.extendTreeWithExpression(p.newTruthyExpression())
		p.resetData()
		if len(p.boolOpStack) > 0 {
			boolOp := p.boolOpStack[len(p.boolOpStack)-1]
			p.boolOpStack = p.boolOpStack[:len(p.boolOpStack)-1]
			p.extendTreeFromStack(boolOp)
		}
		p.resetBoolOperator()
		p.state = stateExpectBoolOp
		p.storeTypedChar(CharTypeOperator)
	} else {
		p.setErrorState("invalid character", 3)
	}
}

func (p *Parser) inStateExpectOperator() {
	if p.char == nil {
		return
	}

	if p.char.isDelimiter() {
		p.storeTypedChar(CharTypeSpace)
		return
	} else if p.char.isOp() {
		p.extendKeyValueOperator()
		p.state = stateKeyValueOperator
		p.storeTypedChar(CharTypeOperator)
	} else {
		p.setErrorState("expected operator", 28)
	}
}

func (p *Parser) inStateKeyValueOperator() {
	if p.char == nil {
		return
	}

	if p.keyValueOperator == "h" && p.char.value == 'a' {
		p.keyValueOperator = "ha"
		p.storeTypedChar(CharTypeOperator)
		return
	} else if p.keyValueOperator == "ha" && p.char.value == 's' {
		p.keyValueOperator = HasKeyword
		p.storeTypedChar(CharTypeOperator)
		return
	} else if p.keyValueOperator == HasKeyword {
		if p.char.isDelimiter() {
			p.storeTypedChar(CharTypeSpace)
			p.keyValueOperator = OpHas
			p.isNotHas = false
			p.state = stateExpectValue
		} else if p.char.isSingleQuote() {
			p.keyValueOperator = OpHas
			p.isNotHas = false
			p.setValueIsString()
			p.state = stateSingleQuotedValue
			p.storeTypedChar(CharTypeValue)
		} else if p.char.isDoubleQuote() {
			p.keyValueOperator = OpHas
			p.isNotHas = false
			p.setValueIsString()
			p.state = stateDoubleQuotedValue
			p.storeTypedChar(CharTypeValue)
		} else if p.char.isParameterStart() {
			p.keyValueOperator = OpHas
			p.isNotHas = false
			p.valueStart = p.char.pos
			p.state = stateParameter
			p.storeTypedChar(CharTypeParameter)
		} else if p.char.isValue() {
			p.keyValueOperator = OpHas
			p.isNotHas = false
			p.state = stateValue
			p.extendValue()
			p.storeTypedChar(CharTypeValue)
		} else {
			p.setErrorState("expected value after 'has'", 50)
		}
		return
	}

	if p.keyValueOperator == "i" && p.char.value == 'n' {
		p.keyValueOperator = "in"
		p.storeTypedChar(CharTypeOperator)
		return
	}

	if p.keyValueOperator == "i" && p.char.value == 'l' {
		p.keyValueOperator = "il"
		p.storeTypedChar(CharTypeOperator)
		return
	} else if p.keyValueOperator == "il" && p.char.value == 'i' {
		p.keyValueOperator = "ili"
		p.storeTypedChar(CharTypeOperator)
		return
	} else if p.keyValueOperator == "ili" && p.char.value == 'k' {
		p.keyValueOperator = "ilik"
		p.storeTypedChar(CharTypeOperator)
		return
	} else if p.keyValueOperator == "ilik" && p.char.value == 'e' {
		p.keyValueOperator = ILikeKeyword
		p.storeTypedChar(CharTypeOperator)
		return
	} else if p.keyValueOperator == ILikeKeyword {
		if p.char.isDelimiter() {
			p.storeTypedChar(CharTypeSpace)
			p.keyValueOperator = OpILike
			p.state = stateExpectValue
		} else if p.char.isSingleQuote() {
			p.keyValueOperator = OpILike
			p.setValueIsString()
			p.state = stateSingleQuotedValue
			p.storeTypedChar(CharTypeValue)
		} else if p.char.isDoubleQuote() {
			p.keyValueOperator = OpILike
			p.setValueIsString()
			p.state = stateDoubleQuotedValue
			p.storeTypedChar(CharTypeValue)
		} else if p.char.isParameterStart() {
			p.keyValueOperator = OpILike
			p.valueStart = p.char.pos
			p.state = stateParameter
			p.storeTypedChar(CharTypeParameter)
		} else if p.char.isValue() {
			p.keyValueOperator = OpILike
			p.state = stateValue
			p.extendValue()
			p.storeTypedChar(CharTypeValue)
		} else {
			p.setErrorState("expected value after 'ilike'", 50)
		}
		return
	}

	if p.keyValueOperator == "l" && p.char.value == 'i' {
		p.keyValueOperator = "li"
		p.storeTypedChar(CharTypeOperator)
		return
	} else if p.keyValueOperator == "li" && p.char.value == 'k' {
		p.keyValueOperator = "lik"
		p.storeTypedChar(CharTypeOperator)
		return
	} else if p.keyValueOperator == "lik" && p.char.value == 'e' {
		p.keyValueOperator = LikeKeyword
		p.storeTypedChar(CharTypeOperator)
		return
	} else if p.keyValueOperator == LikeKeyword {
		if p.char.isDelimiter() {
			p.storeTypedChar(CharTypeSpace)
			p.keyValueOperator = OpLike
			p.state = stateExpectValue
		} else if p.char.isSingleQuote() {
			p.keyValueOperator = OpLike
			p.setValueIsString()
			p.state = stateSingleQuotedValue
			p.storeTypedChar(CharTypeValue)
		} else if p.char.isDoubleQuote() {
			p.keyValueOperator = OpLike
			p.setValueIsString()
			p.state = stateDoubleQuotedValue
			p.storeTypedChar(CharTypeValue)
		} else if p.char.isParameterStart() {
			p.keyValueOperator = OpLike
			p.valueStart = p.char.pos
			p.state = stateParameter
			p.storeTypedChar(CharTypeParameter)
		} else if p.char.isValue() {
			p.keyValueOperator = OpLike
			p.state = stateValue
			p.extendValue()
			p.storeTypedChar(CharTypeValue)
		} else {
			p.setErrorState("expected value after 'like'", 50)
		}
		return
	}

	if p.keyValueOperator == "in" {
		if p.char.isDelimiter() {
			p.storeTypedChar(CharTypeSpace)
			p.keyValueOperator = ""
			p.isNotIn = false
			p.state = stateExpectListStart
		} else if p.char.value == '[' {
			p.storeTypedChar(CharTypeOperator)
			p.keyValueOperator = ""
			p.isNotIn = false
			p.state = stateExpectListValue
		} else {
			p.setErrorState("expected '[' after 'in'", 47)
		}
		return
	}

	if p.char.isDelimiter() {
		p.storeTypedChar(CharTypeSpace)
		if !validKeyValueOperators[p.keyValueOperator] {
			p.setErrorState("unknown operator: "+p.keyValueOperator, 10)
		} else {
			p.state = stateExpectValue
		}
	} else if p.char.isOp() {
		p.extendKeyValueOperator()
		p.storeTypedChar(CharTypeOperator)
	} else if p.char.isParameterStart() {
		if !validKeyValueOperators[p.keyValueOperator] {
			p.setErrorState("unknown operator: "+p.keyValueOperator, 10)
		} else {
			p.valueStart = p.char.pos
			p.state = stateParameter
			p.storeTypedChar(CharTypeParameter)
		}
	} else if p.char.isValue() {
		if !validKeyValueOperators[p.keyValueOperator] {
			p.setErrorState("unknown operator: "+p.keyValueOperator, 10)
		} else {
			p.state = stateValue
			p.extendValue()
			p.storeTypedChar(CharTypeValue)
		}
	} else if p.char.isSingleQuote() {
		if !validKeyValueOperators[p.keyValueOperator] {
			p.setErrorState("unknown operator: "+p.keyValueOperator, 10)
		} else {
			p.setValueIsString()
			p.state = stateSingleQuotedValue
			p.storeTypedChar(CharTypeValue)
		}
	} else if p.char.isDoubleQuote() {
		if !validKeyValueOperators[p.keyValueOperator] {
			p.setErrorState("unknown operator: "+p.keyValueOperator, 10)
		} else {
			p.setValueIsString()
			p.state = stateDoubleQuotedValue
			p.storeTypedChar(CharTypeValue)
		}
	} else {
		p.setErrorState("invalid character", 4)
	}
}

func (p *Parser) inStateExpectValue() {
	if p.char == nil {
		return
	}

	if p.char.isDelimiter() {
		p.storeTypedChar(CharTypeSpace)
		return
	} else if p.char.isParameterStart() {
		p.valueStart = p.char.pos
		p.state = stateParameter
		p.storeTypedChar(CharTypeParameter)
	} else if p.char.isValue() {
		p.state = stateValue
		p.extendValue()
		p.storeTypedChar(CharTypeValue)
	} else if p.char.isSingleQuote() {
		p.setValueIsString()
		p.state = stateSingleQuotedValue
		p.storeTypedChar(CharTypeValue)
	} else if p.char.isDoubleQuote() {
		p.setValueIsString()
		p.state = stateDoubleQuotedValue
		p.storeTypedChar(CharTypeValue)
	} else {
		p.setErrorState("expected value", 29)
	}
}

func (p *Parser) inStateValue() {
	if p.char == nil {
		return
	}

	if p.char.isValue() {
		p.extendValue()
		p.storeTypedChar(CharTypeValue)
	} else if p.char.isDelimiter() {
		p.state = stateExpectBoolOp
		p.extendTree()
		p.resetData()
		p.resetBoolOperator()
		p.storeTypedChar(CharTypeSpace)
	} else if p.char.isGroupOpen() {
		if knownFunctions[p.value] {
			nameLen := len(p.value)
			startIdx := max(0, len(p.TypedChars)-nameLen)
			for i := startIdx; i < len(p.TypedChars); i++ {
				if p.TypedChars[i].Type == CharTypeValue {
					p.TypedChars[i].Type = CharTypeFunction
				}
			}
			p.functionName = p.value
			p.value = ""
			p.state = stateFunctionArgs
			p.storeTypedChar(CharTypeOperator)
		} else {
			p.setErrorState(fmt.Sprintf("unknown function '%s'", p.value), errUnknownFunction)
		}
	} else if p.char.isGroupClose() {
		if len(p.nodesStack) == 0 {
			p.setErrorState("unmatched parenthesis", 9)
			return
		}
		p.extendTree()
		p.resetData()
		if len(p.boolOpStack) > 0 {
			p.boolOperator = p.boolOpStack[len(p.boolOpStack)-1]
			p.boolOpStack = p.boolOpStack[:len(p.boolOpStack)-1]
		}
		p.extendTreeFromStack(p.boolOperator)
		p.resetBoolOperator()
		p.state = stateExpectBoolOp
		p.storeTypedChar(CharTypeOperator)
	} else {
		p.setErrorState("invalid character", 10)
	}
}

func (p *Parser) resetFunctionData() {
	p.functionName = ""
	p.functionDurationBuf = ""
	p.functionArgs = nil
	p.functionDurations = nil
	p.functionCurrentArg = ""
	p.functionParameterArgs = nil
	p.functionParamBuf = ""
}

// maxDurationMagnitudeSentinel is larger than any value in
// durationUnitMagnitude; it initializes the "previous unit" tracker so the
// first unit in a buffer is always accepted.
const maxDurationMagnitudeSentinel = 1 << 8

func (p *Parser) parseDurationBuf() bool {
	buf := p.functionDurationBuf
	if buf == "" {
		return false
	}
	numBuf := ""
	prevMagnitude := maxDurationMagnitudeSentinel
	for _, c := range buf {
		if c >= '0' && c <= '9' {
			numBuf += string(c)
			continue
		}
		magnitude, ok := durationUnitMagnitude[c]
		if !ok {
			p.setErrorState(fmt.Sprintf("invalid duration unit '%s' — expected s, m, h, d, or w", string(c)), errInvalidDuration)
			return false
		}
		if numBuf == "" {
			p.setErrorState("invalid duration format", errInvalidDuration)
			return false
		}
		if magnitude >= prevMagnitude {
			p.setErrorState(
				fmt.Sprintf(
					"invalid duration '%s' — units must appear in strictly descending order and only once (e.g. '1w2d3h4m5s')",
					buf,
				),
				errInvalidDuration,
			)
			return false
		}
		prevMagnitude = magnitude
		val, err := strconv.ParseInt(numBuf, 10, 64)
		if err != nil {
			p.setErrorState(fmt.Sprintf("invalid duration value '%s'", numBuf), errInvalidDuration)
			return false
		}
		p.functionDurations = append(p.functionDurations, Duration{Value: val, Unit: string(c)})
		numBuf = ""
	}
	if numBuf != "" {
		p.setErrorState("invalid duration format — missing unit", errInvalidDuration)
		return false
	}
	return true
}

func (p *Parser) completeFunctionCall() {
	name := p.functionName

	if p.keyValueOperator == OpRegex || p.keyValueOperator == OpNotRegex {
		p.setErrorState(fmt.Sprintf("operator '%s' is not valid with a temporal function", p.keyValueOperator), errFunctionNotAllowedWithOperator)
		return
	}

	var fc *FunctionCall

	if len(p.functionParameterArgs) > 0 {
		// Currently unreachable: the state machine can't produce both
		// parameter args and a non-empty duration buf in the same call
		// (FUNCTION_DURATION has no `,` transition). Kept defensive: if
		// parseDurationBuf ever sets the error state, honor it rather
		// than silently overwriting with stateExpectBoolOp below.
		if p.functionDurationBuf != "" && !p.parseDurationBuf() {
			return
		}
		fc = &FunctionCall{
			Name:          name,
			DurationArgs:  append([]Duration{}, p.functionDurations...),
			ParameterArgs: append([]*Parameter{}, p.functionParameterArgs...),
		}
		if len(p.functionArgs) > 0 {
			if name == "startOf" {
				fc.Unit = p.functionArgs[0]
				if len(p.functionArgs) > 1 {
					fc.Timezone = p.functionArgs[1]
				}
			} else if name == "today" {
				fc.Timezone = p.functionArgs[0]
			}
		}

		keyEnd := p.keyEnd
		keyRange := Range{Start: p.keyStart, End: keyEnd}
		key, _ := p.parseKeyWithRange(keyRange)
		exprRange := Range{Start: p.exprStart, End: p.char.pos + 1}
		operatorRange := &Range{Start: p.operatorStart, End: p.operatorEnd}
		valueRange := &Range{Start: p.valueStart, End: p.char.pos + 1}

		expr := NewFunctionCallExpression(key, p.keyValueOperator, fc)
		expr.Range = exprRange
		expr.OperatorRange = operatorRange
		expr.ValueRange = valueRange

		p.extendTreeWithExpression(expr)
		p.resetData()
		p.resetFunctionData()
		p.resetBoolOperator()
		p.state = stateExpectBoolOp
		return
	}

	switch name {
	case "ago":
		if len(p.functionArgs) > 0 {
			p.setErrorState("ago() requires a duration, not a string argument", errInvalidDuration)
			return
		}
		if !p.parseDurationBuf() {
			if p.state != stateError {
				p.setErrorState("ago() requires a duration argument", errInvalidDuration)
			}
			return
		}
		if len(p.functionDurations) == 0 {
			p.setErrorState("ago() requires a duration argument", errInvalidDuration)
			return
		}
		fc = &FunctionCall{Name: "ago", DurationArgs: p.functionDurations}
	case "now":
		if len(p.functionArgs) > 0 || p.functionDurationBuf != "" {
			p.setErrorState("now() does not accept arguments", errInvalidDuration)
			return
		}
		fc = &FunctionCall{Name: "now"}
	case "today":
		if p.functionDurationBuf != "" {
			p.setErrorState("today() does not accept duration arguments", errInvalidDuration)
			return
		}
		if len(p.functionArgs) > 1 {
			p.setErrorState("today() accepts at most one argument (timezone)", errInvalidDuration)
			return
		}
		tz := ""
		if len(p.functionArgs) == 1 {
			tz = p.functionArgs[0]
		}
		fc = &FunctionCall{Name: "today", Timezone: tz}
	case "startOf":
		if p.functionDurationBuf != "" {
			p.setErrorState("startOf() does not accept duration arguments", errInvalidDuration)
			return
		}
		if len(p.functionArgs) == 0 {
			p.setErrorState("startOf() requires a unit argument ('day', 'week', or 'month')", errInvalidDuration)
			return
		}
		unit := p.functionArgs[0]
		if unit != "day" && unit != "week" && unit != "month" {
			p.setErrorState(fmt.Sprintf("invalid unit '%s' — expected 'day', 'week', or 'month'", unit), errInvalidDuration)
			return
		}
		tz := ""
		if len(p.functionArgs) > 2 {
			p.setErrorState("startOf() accepts at most two arguments (unit, timezone)", errInvalidDuration)
			return
		}
		if len(p.functionArgs) == 2 {
			tz = p.functionArgs[1]
		}
		fc = &FunctionCall{Name: "startOf", Unit: unit, Timezone: tz}
	}

	if fc == nil {
		return
	}

	keyEnd := p.keyEnd
	keyRange := Range{Start: p.keyStart, End: keyEnd}
	key, _ := p.parseKeyWithRange(keyRange)
	exprRange := Range{Start: p.exprStart, End: p.char.pos + 1}
	operatorRange := &Range{Start: p.operatorStart, End: p.operatorEnd}
	valueRange := &Range{Start: p.valueStart, End: p.char.pos + 1}

	expr := NewFunctionCallExpression(key, p.keyValueOperator, fc)
	expr.Range = exprRange
	expr.OperatorRange = operatorRange
	expr.ValueRange = valueRange

	p.extendTreeWithExpression(expr)
	p.resetData()
	p.resetFunctionData()
	p.resetBoolOperator()
	p.state = stateExpectBoolOp
}

func (p *Parser) inStateFunctionArgs() {
	if p.char == nil {
		return
	}

	if p.char.isGroupClose() {
		p.storeTypedChar(CharTypeOperator)
		p.completeFunctionCall()
	} else if p.char.isParameterStart() {
		p.functionParamBuf = ""
		p.state = stateFunctionParameter
		p.storeTypedChar(CharTypeParameter)
	} else if p.char.value >= '0' && p.char.value <= '9' {
		p.functionDurationBuf += string(p.char.value)
		p.state = stateFunctionDuration
		p.storeTypedChar(CharTypeNumber)
	} else if p.char.isSingleQuote() {
		p.functionCurrentArg = ""
		p.state = stateFunctionQuotedArg
		p.storeTypedChar(CharTypeValue)
	} else if p.char.isDelimiter() {
		p.storeTypedChar(CharTypeSpace)
	} else {
		p.setErrorState("invalid function argument", errInvalidFunctionArgs)
	}
}

func (p *Parser) inStateFunctionDuration() {
	if p.char == nil {
		return
	}

	if p.char.value >= '0' && p.char.value <= '9' {
		p.functionDurationBuf += string(p.char.value)
		p.storeTypedChar(CharTypeNumber)
	} else if p.char.value == 's' || p.char.value == 'm' || p.char.value == 'h' || p.char.value == 'd' || p.char.value == 'w' {
		p.functionDurationBuf += string(p.char.value)
		p.storeTypedChar(CharTypeNumber)
	} else if p.char.isGroupClose() {
		p.storeTypedChar(CharTypeOperator)
		p.completeFunctionCall()
	} else {
		p.setErrorState(fmt.Sprintf("invalid duration unit '%s' — expected s, m, h, d, or w", string(p.char.value)), errInvalidDuration)
	}
}

func (p *Parser) inStateFunctionQuotedArg() {
	if p.char == nil {
		return
	}

	if p.char.isSingleQuote() {
		prevPos := p.char.pos - 1
		if prevPos >= 0 && p.text[prevPos] == '\\' {
			p.functionCurrentArg += string(p.char.value)
			p.storeTypedChar(CharTypeValue)
		} else {
			p.functionArgs = append(p.functionArgs, p.functionCurrentArg)
			p.state = stateFunctionExpectCommaOrClose
			p.storeTypedChar(CharTypeValue)
		}
	} else {
		p.functionCurrentArg += string(p.char.value)
		p.storeTypedChar(CharTypeValue)
	}
}

func (p *Parser) inStateFunctionExpectCommaOrClose() {
	if p.char == nil {
		return
	}

	if p.char.isGroupClose() {
		p.storeTypedChar(CharTypeOperator)
		p.completeFunctionCall()
	} else if p.char.value == ',' {
		p.state = stateFunctionExpectArg
		p.storeTypedChar(CharTypeOperator)
	} else if p.char.isDelimiter() {
		p.storeTypedChar(CharTypeSpace)
	} else {
		p.setErrorState("expected ',' or ')' in function call", errInvalidFunctionArgs)
	}
}

func (p *Parser) inStateFunctionExpectArg() {
	if p.char == nil {
		return
	}

	if p.char.isSingleQuote() {
		p.functionCurrentArg = ""
		p.state = stateFunctionQuotedArg
		p.storeTypedChar(CharTypeValue)
	} else if p.char.isParameterStart() {
		p.functionParamBuf = ""
		p.state = stateFunctionParameter
		p.storeTypedChar(CharTypeParameter)
	} else if p.char.isDelimiter() {
		p.storeTypedChar(CharTypeSpace)
	} else {
		p.setErrorState("expected quoted argument in function call", errInvalidFunctionArgs)
	}
}

func (p *Parser) finalizeFunctionParameter() bool {
	name := p.functionParamBuf
	if name == "" {
		p.setErrorState("empty parameter name", errEmptyParameterName)
		return false
	}
	isDigitStart := name[0] >= '0' && name[0] <= '9'
	if isDigitStart {
		for _, ch := range name {
			if ch < '0' || ch > '9' {
				p.setErrorState("invalid parameter name", errInvalidParameterName)
				return false
			}
		}
		if name == "0" {
			p.setErrorState("positional parameters are 1-indexed", errParameterZeroIndex)
			return false
		}
	}
	param := &Parameter{Name: name, Positional: isDigitStart}
	p.functionParameterArgs = append(p.functionParameterArgs, param)
	p.functionParamBuf = ""
	return true
}

func (p *Parser) inStateFunctionParameter() {
	if p.char == nil {
		return
	}

	c := p.char.value
	if unicode.IsLetter(c) || unicode.IsDigit(c) || c == '_' {
		p.functionParamBuf += string(c)
		p.storeTypedChar(CharTypeParameter)
	} else if p.char.isGroupClose() {
		if !p.finalizeFunctionParameter() {
			return
		}
		p.storeTypedChar(CharTypeOperator)
		p.completeFunctionCall()
	} else if c == ',' {
		if !p.finalizeFunctionParameter() {
			return
		}
		p.state = stateFunctionExpectArg
		p.storeTypedChar(CharTypeOperator)
	} else if p.char.isDelimiter() {
		if !p.finalizeFunctionParameter() {
			return
		}
		p.state = stateFunctionExpectCommaOrClose
		p.storeTypedChar(CharTypeSpace)
	} else {
		p.setErrorState("invalid character in parameter name", errInvalidFunctionArgs)
	}
}

func (p *Parser) inStateSingleQuotedValue() {
	if p.char == nil {
		return
	}

	if !p.char.isSingleQuote() {
		p.extendValue()
		p.storeTypedChar(CharTypeValue)
	} else {
		p.storeTypedChar(CharTypeValue)
		prevPos := p.char.pos - 1
		if prevPos >= 0 && p.text[prevPos] == '\\' {
			p.extendValue()
		} else {
			p.valueEnd = p.char.pos + 1
			p.state = stateExpectBoolOp
			p.extendTree()
			p.resetData()
			p.resetBoolOperator()
		}
	}
}

func (p *Parser) inStateDoubleQuotedValue() {
	if p.char == nil {
		return
	}

	if !p.char.isDoubleQuote() {
		p.extendValue()
		p.storeTypedChar(CharTypeValue)
	} else {
		p.storeTypedChar(CharTypeValue)
		prevPos := p.char.pos - 1
		if prevPos >= 0 && p.text[prevPos] == '\\' {
			p.extendValue()
		} else {
			p.valueEnd = p.char.pos + 1
			p.state = stateExpectBoolOp
			p.extendTree()
			p.resetData()
			p.resetBoolOperator()
		}
	}
}

func (p *Parser) inStateSingleQuotedKey() {
	if p.char == nil {
		return
	}

	if !p.char.isSingleQuote() {
		p.extendKey()
		p.storeTypedChar(CharTypeKey)
	} else {
		p.storeTypedChar(CharTypeKey)
		prevPos := p.char.pos - 1
		if prevPos >= 0 && p.text[prevPos] == '\\' {
			p.extendKey()
		} else {
			p.extendKey()
			p.state = stateKey
		}
	}
}

func (p *Parser) inStateDoubleQuotedKey() {
	if p.char == nil {
		return
	}

	if !p.char.isDoubleQuote() {
		p.extendKey()
		p.storeTypedChar(CharTypeKey)
	} else {
		p.storeTypedChar(CharTypeKey)
		prevPos := p.char.pos - 1
		if prevPos >= 0 && p.text[prevPos] == '\\' {
			p.extendKey()
		} else {
			p.extendKey()
			p.state = stateKey
		}
	}
}

func (p *Parser) inStateBoolOpDelimiter() {
	if p.char == nil {
		return
	}

	if p.char.isDelimiter() {
		p.storeTypedChar(CharTypeSpace)
		return
	} else if p.char.isKey() {
		p.state = stateKey
		p.extendKey()
		p.storeTypedChar(CharTypeKey)
	} else if p.char.isSingleQuote() {
		p.extendKey()
		p.state = stateSingleQuotedKey
		p.storeTypedChar(CharTypeKey)
	} else if p.char.isDoubleQuote() {
		p.extendKey()
		p.state = stateDoubleQuotedKey
		p.storeTypedChar(CharTypeKey)
	} else if p.char.isGroupOpen() {
		if p.pendingNegation {
			p.negationStack = append(p.negationStack, true)
			p.pendingNegation = false
		} else {
			p.negationStack = append(p.negationStack, false)
		}
		p.extendNodesStack()
		p.extendBoolOpStack()
		p.groupStartStack = append(p.groupStartStack, p.char.pos)
		p.depth++
		if p.MaxDepth > 0 && p.depth > p.MaxDepth {
			p.setErrorState(fmt.Sprintf("maximum nesting depth exceeded (%d)", p.MaxDepth), errMaxDepthExceeded)
			return
		}
		p.state = stateInitial
		p.storeTypedChar(CharTypeOperator)
	} else if p.char.isGroupClose() {
		if len(p.nodesStack) == 0 {
			p.setErrorState("unmatched parenthesis", 15)
			return
		}
		p.resetData()
		if len(p.boolOpStack) > 0 {
			boolOp := p.boolOpStack[len(p.boolOpStack)-1]
			p.boolOpStack = p.boolOpStack[:len(p.boolOpStack)-1]
			p.extendTreeFromStack(boolOp)
		}
		p.state = stateExpectBoolOp
		p.storeTypedChar(CharTypeOperator)
	} else {
		p.setErrorState("invalid character", 18)
	}
}

func (p *Parser) inStateExpectBoolOp() {
	if p.char == nil {
		return
	}

	if p.char.isDelimiter() {
		p.storeTypedChar(CharTypeSpace)
		return
	} else if p.char.isGroupClose() {
		if len(p.nodesStack) == 0 {
			p.setErrorState("unmatched parenthesis", 19)
			return
		}
		p.resetData()
		p.resetBoolOperator()
		if len(p.boolOpStack) > 0 {
			boolOp := p.boolOpStack[len(p.boolOpStack)-1]
			p.boolOpStack = p.boolOpStack[:len(p.boolOpStack)-1]
			p.extendTreeFromStack(boolOp)
		}
		p.state = stateExpectBoolOp
		p.storeTypedChar(CharTypeOperator)
	} else {
		p.extendBoolOperator()
		p.storeTypedChar(CharTypeOperator)
		if len(p.boolOperator) > 3 || !validBoolOperatorChars[p.char.value] {
			p.setErrorState("invalid character", 20)
		} else {
			if validBoolOperators[p.boolOperator] {
				nextPos := p.char.pos + 1
				if nextPos < len(p.text) {
					nextChar := newChar(rune(p.text[nextPos]), nextPos, 0, 0)
					if !nextChar.isDelimiter() {
						p.setErrorState("expected delimiter after bool operator", 23)
						return
					}
					p.state = stateBoolOpDelimiter
				} else {
					p.state = stateBoolOpDelimiter
				}
			}
		}
	}
}

func (p *Parser) inStateKeyOrBoolOp() {
	if p.char == nil {
		return
	}

	if p.char.isDelimiter() {
		p.storeTypedChar(CharTypeSpace)
		return
	} else if p.char.isOp() {
		p.extendKeyValueOperator()
		p.state = stateKeyValueOperator
		p.storeTypedChar(CharTypeOperator)
	} else if p.char.isGroupClose() {
		if len(p.nodesStack) == 0 {
			p.setErrorState("unmatched parenthesis", 19)
			return
		}
		p.extendTreeWithExpression(p.newTruthyExpression())
		p.resetData()
		if len(p.boolOpStack) > 0 {
			boolOp := p.boolOpStack[len(p.boolOpStack)-1]
			p.boolOpStack = p.boolOpStack[:len(p.boolOpStack)-1]
			p.extendTreeFromStack(boolOp)
		}
		p.resetBoolOperator()
		p.state = stateExpectBoolOp
		p.storeTypedChar(CharTypeOperator)
	} else if p.char.value == 'i' {
		p.keyValueOperator = "i"
		p.state = stateKeyValueOperator
		p.storeTypedChar(CharTypeOperator)
	} else if p.char.value == 'h' {
		p.keyValueOperator = "h"
		p.state = stateKeyValueOperator
		p.storeTypedChar(CharTypeOperator)
	} else if p.char.value == 'l' {
		p.keyValueOperator = "l"
		p.state = stateKeyValueOperator
		p.storeTypedChar(CharTypeOperator)
	} else if p.char.value == 'n' {
		p.keyValueOperator = "n"
		p.state = stateExpectInKeyword
		p.storeTypedChar(CharTypeOperator)
	} else if validBoolOperatorChars[p.char.value] {
		p.extendTreeWithExpression(p.newTruthyExpression())
		p.resetData()
		p.resetBoolOperator()
		p.extendBoolOperator()
		p.storeTypedChar(CharTypeOperator)
		p.state = stateExpectBoolOp
		if validBoolOperators[p.boolOperator] {
			nextPos := p.char.pos + 1
			if nextPos < len(p.text) {
				nextChar := newChar(rune(p.text[nextPos]), nextPos, 0, 0)
				if !nextChar.isDelimiter() {
					p.setErrorState("expected delimiter after bool operator", 23)
					return
				}
				p.state = stateBoolOpDelimiter
			} else {
				p.state = stateBoolOpDelimiter
			}
		}
	} else {
		p.setErrorState("expected operator", 32)
	}
}

func (p *Parser) inStateExpectNotTarget() {
	if p.char == nil {
		return
	}

	if p.char.isDelimiter() {
		p.storeTypedChar(CharTypeSpace)
		return
	} else if p.char.isKey() {
		p.extendKey()
		p.state = stateKey
		p.storeTypedChar(CharTypeKey)
	} else if p.char.isSingleQuote() {
		p.extendKey()
		p.state = stateSingleQuotedKey
		p.storeTypedChar(CharTypeKey)
	} else if p.char.isDoubleQuote() {
		p.extendKey()
		p.state = stateDoubleQuotedKey
		p.storeTypedChar(CharTypeKey)
	} else if p.char.isGroupOpen() {
		p.negationStack = append(p.negationStack, p.pendingNegation)
		p.pendingNegation = false
		p.extendNodesStack()
		p.extendBoolOpStack()
		p.groupStartStack = append(p.groupStartStack, p.char.pos)
		p.depth++
		if p.MaxDepth > 0 && p.depth > p.MaxDepth {
			p.setErrorState(fmt.Sprintf("maximum nesting depth exceeded (%d)", p.MaxDepth), errMaxDepthExceeded)
			return
		}
		p.state = stateInitial
		p.storeTypedChar(CharTypeOperator)
	} else {
		p.setErrorState("expected key or group after not", 33)
	}
}

func (p *Parser) inStateExpectInKeyword() {
	if p.char == nil {
		return
	}

	if p.keyValueOperator == "n" {
		if p.char.value == 'o' {
			p.keyValueOperator += "o"
			p.storeTypedChar(CharTypeOperator)
		} else {
			p.setErrorState("expected 'not' or 'in' keyword", 41)
		}
	} else if p.keyValueOperator == "no" {
		if p.char.value == 't' {
			p.keyValueOperator += "t"
			p.storeTypedChar(CharTypeOperator)
		} else {
			p.setErrorState("expected 'not' keyword", 41)
		}
	} else if p.keyValueOperator == "not" {
		if p.char.isDelimiter() {
			p.storeTypedChar(CharTypeSpace)
			p.keyValueOperator = ""
			p.isNotIn = true
			p.state = stateExpectListStart
		} else {
			p.setErrorState("expected space after 'not'", 41)
		}
	} else {
		p.setErrorState("unexpected state in expect_in_keyword", 41)
	}
}

func (p *Parser) inStateExpectListStart() {
	if p.char == nil {
		return
	}

	if p.char.isDelimiter() {
		p.storeTypedChar(CharTypeSpace)
		return
	} else if p.char.value == 'h' && p.isNotIn {
		p.keyValueOperator = "h"
		p.isNotIn = false
		p.isNotHas = true
		p.state = stateExpectHasKeyword
		p.storeTypedChar(CharTypeOperator)
	} else if p.char.value == 'l' && p.isNotIn {
		p.keyValueOperator = "l"
		p.isNotIn = false
		p.isNotLike = true
		p.state = stateExpectLikeKeyword
		p.storeTypedChar(CharTypeOperator)
	} else if p.char.value == 'i' && p.isNotIn {
		p.keyValueOperator = "i"
		p.state = stateExpectLikeKeyword
		p.storeTypedChar(CharTypeOperator)
	} else if p.char.value == 'i' {
		p.keyValueOperator = "i"
		p.storeTypedChar(CharTypeOperator)
	} else if p.keyValueOperator == "i" && p.char.value == 'n' {
		p.keyValueOperator = ""
		p.storeTypedChar(CharTypeOperator)
	} else if p.char.value == '[' {
		p.storeTypedChar(CharTypeOperator)
		p.state = stateExpectListValue
	} else {
		p.setErrorState("expected '['", 42)
	}
}

func (p *Parser) inStateExpectHasKeyword() {
	if p.char == nil {
		return
	}

	if p.keyValueOperator == "h" && p.char.value == 'a' {
		p.keyValueOperator = "ha"
		p.storeTypedChar(CharTypeOperator)
	} else if p.keyValueOperator == "ha" && p.char.value == 's' {
		p.keyValueOperator = HasKeyword
		p.storeTypedChar(CharTypeOperator)
	} else if p.keyValueOperator == HasKeyword {
		if p.char.isDelimiter() {
			p.storeTypedChar(CharTypeSpace)
			p.keyValueOperator = OpNotHas
			p.state = stateExpectValue
		} else if p.char.isSingleQuote() {
			p.keyValueOperator = OpNotHas
			p.setValueIsString()
			p.state = stateSingleQuotedValue
			p.storeTypedChar(CharTypeValue)
		} else if p.char.isDoubleQuote() {
			p.keyValueOperator = OpNotHas
			p.setValueIsString()
			p.state = stateDoubleQuotedValue
			p.storeTypedChar(CharTypeValue)
		} else if p.char.isParameterStart() {
			p.keyValueOperator = OpNotHas
			p.valueStart = p.char.pos
			p.state = stateParameter
			p.storeTypedChar(CharTypeParameter)
		} else if p.char.isValue() {
			p.keyValueOperator = OpNotHas
			p.state = stateValue
			p.extendValue()
			p.storeTypedChar(CharTypeValue)
		} else {
			p.setErrorState("expected value after 'not has'", 50)
		}
	} else {
		p.setErrorState("expected 'has' keyword", 50)
	}
}

func (p *Parser) inStateExpectLikeKeyword() {
	if p.char == nil {
		return
	}

	// Path A: building "like" for "not like"
	if p.keyValueOperator == "l" && p.char.value == 'i' {
		p.keyValueOperator = "li"
		p.storeTypedChar(CharTypeOperator)
	} else if p.keyValueOperator == "li" && p.char.value == 'k' {
		p.keyValueOperator = "lik"
		p.storeTypedChar(CharTypeOperator)
	} else if p.keyValueOperator == "lik" && p.char.value == 'e' {
		p.keyValueOperator = LikeKeyword
		p.storeTypedChar(CharTypeOperator)
	} else if p.keyValueOperator == LikeKeyword {
		if p.char.isDelimiter() {
			p.storeTypedChar(CharTypeSpace)
			p.keyValueOperator = OpNotLike
			p.state = stateExpectValue
		} else if p.char.isSingleQuote() {
			p.keyValueOperator = OpNotLike
			p.setValueIsString()
			p.state = stateSingleQuotedValue
			p.storeTypedChar(CharTypeValue)
		} else if p.char.isDoubleQuote() {
			p.keyValueOperator = OpNotLike
			p.setValueIsString()
			p.state = stateDoubleQuotedValue
			p.storeTypedChar(CharTypeValue)
		} else if p.char.isParameterStart() {
			p.keyValueOperator = OpNotLike
			p.valueStart = p.char.pos
			p.state = stateParameter
			p.storeTypedChar(CharTypeParameter)
		} else if p.char.isValue() {
			p.keyValueOperator = OpNotLike
			p.state = stateValue
			p.extendValue()
			p.storeTypedChar(CharTypeValue)
		} else {
			p.setErrorState("expected value after 'not like'", 50)
		}
		// Path B: disambiguate "i" -> "in" vs "ilike"
	} else if p.keyValueOperator == "i" && p.char.value == 'n' {
		p.keyValueOperator = ""
		p.isNotIn = true
		p.storeTypedChar(CharTypeOperator)
		p.state = stateExpectListStart
	} else if p.keyValueOperator == "i" && p.char.value == 'l' {
		p.keyValueOperator = "il"
		p.isNotIn = false
		p.isNotIlike = true
		p.storeTypedChar(CharTypeOperator)
	} else if p.keyValueOperator == "il" && p.char.value == 'i' {
		p.keyValueOperator = "ili"
		p.storeTypedChar(CharTypeOperator)
	} else if p.keyValueOperator == "ili" && p.char.value == 'k' {
		p.keyValueOperator = "ilik"
		p.storeTypedChar(CharTypeOperator)
	} else if p.keyValueOperator == "ilik" && p.char.value == 'e' {
		p.keyValueOperator = ILikeKeyword
		p.storeTypedChar(CharTypeOperator)
	} else if p.keyValueOperator == ILikeKeyword {
		if p.char.isDelimiter() {
			p.storeTypedChar(CharTypeSpace)
			p.keyValueOperator = OpNotILike
			p.state = stateExpectValue
		} else if p.char.isSingleQuote() {
			p.keyValueOperator = OpNotILike
			p.setValueIsString()
			p.state = stateSingleQuotedValue
			p.storeTypedChar(CharTypeValue)
		} else if p.char.isDoubleQuote() {
			p.keyValueOperator = OpNotILike
			p.setValueIsString()
			p.state = stateDoubleQuotedValue
			p.storeTypedChar(CharTypeValue)
		} else if p.char.isParameterStart() {
			p.keyValueOperator = OpNotILike
			p.valueStart = p.char.pos
			p.state = stateParameter
			p.storeTypedChar(CharTypeParameter)
		} else if p.char.isValue() {
			p.keyValueOperator = OpNotILike
			p.state = stateValue
			p.extendValue()
			p.storeTypedChar(CharTypeValue)
		} else {
			p.setErrorState("expected value after 'not ilike'", 50)
		}
	} else {
		p.setErrorState("expected 'like' or 'ilike' keyword", 50)
	}
}

func (p *Parser) inStateExpectListValue() {
	if p.char == nil {
		return
	}

	if p.char.isDelimiter() {
		p.storeTypedChar(CharTypeSpace)
		return
	} else if p.char.value == ']' {
		p.storeTypedChar(CharTypeOperator)
		p.extendTreeWithExpression(p.newInExpression())
		p.resetData()
		p.resetBoolOperator()
		p.state = stateExpectBoolOp
	} else if p.char.isSingleQuote() {
		p.setInListCurrentValueIsString()
		p.state = stateInListSingleQuotedValue
		p.storeTypedChar(CharTypeValue)
	} else if p.char.isDoubleQuote() {
		p.setInListCurrentValueIsString()
		p.state = stateInListDoubleQuotedValue
		p.storeTypedChar(CharTypeValue)
	} else if p.char.isParameterStart() {
		p.inListValueStart = p.char.pos
		p.state = stateInListParameter
		p.storeTypedChar(CharTypeParameter)
	} else if p.char.isValue() && p.char.value != ',' && p.char.value != ']' {
		p.extendInListCurrentValue()
		p.storeTypedChar(CharTypeValue)
		p.state = stateInListValue
	} else {
		p.setErrorState("expected value in list", 43)
	}
}

func (p *Parser) inStateInListValue() {
	if p.char == nil {
		return
	}

	if p.char.isValue() && p.char.value != ',' && p.char.value != ']' {
		p.extendInListCurrentValue()
		p.storeTypedChar(CharTypeValue)
	} else if p.char.isDelimiter() {
		if !p.finalizeInListValue() {
			return
		}
		p.storeTypedChar(CharTypeSpace)
		p.state = stateExpectListCommaOrEnd
	} else if p.char.value == ',' {
		if !p.finalizeInListValue() {
			return
		}
		p.storeTypedChar(CharTypeOperator)
		p.state = stateExpectListValue
	} else if p.char.value == ']' {
		if !p.finalizeInListValue() {
			return
		}
		p.storeTypedChar(CharTypeOperator)
		p.extendTreeWithExpression(p.newInExpression())
		p.resetData()
		p.resetBoolOperator()
		p.state = stateExpectBoolOp
	} else {
		p.setErrorState("unexpected character in list value", 44)
	}
}

func (p *Parser) finalizeInListParameter() bool {
	name := p.inListCurrentValue
	if name == "" {
		p.setErrorState("empty parameter name", errEmptyParameterName)
		return false
	}
	isDigitStart := name[0] >= '0' && name[0] <= '9'
	if isDigitStart {
		for _, ch := range name {
			if ch < '0' || ch > '9' {
				p.setErrorState("invalid parameter name", errInvalidParameterName)
				return false
			}
		}
		if name == "0" {
			p.setErrorState("positional parameters are 1-indexed", errParameterZeroIndex)
			return false
		}
	}
	param := &Parameter{Name: name, Positional: isDigitStart}
	p.inListValues = append(p.inListValues, param)
	p.inListValuesTypes = append(p.inListValuesTypes, literal.Parameter)
	if p.inListValueStart >= 0 {
		p.inListValueRanges = append(p.inListValueRanges, Range{Start: p.inListValueStart, End: p.inListValueEnd})
	}
	p.inListCurrentValue = ""
	p.inListCurrentValueIsString = nil
	p.inListValueStart = -1
	p.inListValueEnd = -1
	return true
}

func (p *Parser) inStateInListParameter() {
	if p.char == nil {
		return
	}

	c := p.char.value
	if unicode.IsLetter(c) || unicode.IsDigit(c) || c == '_' {
		p.inListCurrentValue += string(c)
		p.inListValueEnd = p.char.pos + 1
		p.storeTypedChar(CharTypeParameter)
	} else if p.char.isDelimiter() {
		if !p.finalizeInListParameter() {
			return
		}
		p.storeTypedChar(CharTypeSpace)
		p.state = stateExpectListCommaOrEnd
	} else if c == ',' {
		if !p.finalizeInListParameter() {
			return
		}
		p.storeTypedChar(CharTypeOperator)
		p.state = stateExpectListValue
	} else if c == ']' {
		if !p.finalizeInListParameter() {
			return
		}
		p.storeTypedChar(CharTypeOperator)
		p.extendTreeWithExpression(p.newInExpression())
		p.resetData()
		p.resetBoolOperator()
		p.state = stateExpectBoolOp
	} else {
		p.setErrorState("invalid character in parameter name", 10)
	}
}

func (p *Parser) inStateInListSingleQuotedValue() {
	if p.char == nil {
		return
	}

	if !p.char.isSingleQuote() {
		p.extendInListCurrentValue()
		p.storeTypedChar(CharTypeValue)
	} else {
		p.storeTypedChar(CharTypeValue)
		prevPos := p.char.pos - 1
		if prevPos >= 0 && p.text[prevPos] == '\\' {
			p.extendInListCurrentValue()
		} else {
			if !p.finalizeInListValue() {
				return
			}
			p.state = stateExpectListCommaOrEnd
		}
	}
}

func (p *Parser) inStateInListDoubleQuotedValue() {
	if p.char == nil {
		return
	}

	if !p.char.isDoubleQuote() {
		p.extendInListCurrentValue()
		p.storeTypedChar(CharTypeValue)
	} else {
		p.storeTypedChar(CharTypeValue)
		prevPos := p.char.pos - 1
		if prevPos >= 0 && p.text[prevPos] == '\\' {
			p.extendInListCurrentValue()
		} else {
			if !p.finalizeInListValue() {
				return
			}
			p.state = stateExpectListCommaOrEnd
		}
	}
}

func (p *Parser) inStateExpectListCommaOrEnd() {
	if p.char == nil {
		return
	}

	if p.char.isDelimiter() {
		p.storeTypedChar(CharTypeSpace)
		return
	} else if p.char.value == ',' {
		p.storeTypedChar(CharTypeOperator)
		p.state = stateExpectListValue
	} else if p.char.value == ']' {
		p.storeTypedChar(CharTypeOperator)
		p.extendTreeWithExpression(p.newInExpression())
		p.resetData()
		p.resetBoolOperator()
		p.state = stateExpectBoolOp
	} else {
		p.setErrorState("expected ',' or ']'", 46)
	}
}

func (p *Parser) finalizeParameter() {
	name := p.value
	if name == "" {
		p.setErrorState("empty parameter name", errEmptyParameterName)
		return
	}
	isDigitStart := name[0] >= '0' && name[0] <= '9'
	if isDigitStart {
		for _, ch := range name {
			if ch < '0' || ch > '9' {
				p.setErrorState("invalid parameter name", errInvalidParameterName)
				return
			}
		}
		if name == "0" {
			p.setErrorState("positional parameters are 1-indexed", errParameterZeroIndex)
			return
		}
	}
	param := &Parameter{Name: name, Positional: isDigitStart}
	exprEnd := p.valueEnd
	if exprEnd < 0 && p.char != nil {
		exprEnd = p.char.pos
	}
	exprRange, keyRange, operatorRange := p.buildExprRanges(exprEnd)
	var valueRange *Range
	if p.valueStart >= 0 {
		vr := Range{Start: p.valueStart, End: p.valueEnd}
		valueRange = &vr
	}
	key, _ := p.parseKeyWithRange(keyRange)
	expr := NewParameterExpression(key, p.keyValueOperator, param)
	expr.Range = exprRange
	expr.OperatorRange = operatorRange
	expr.ValueRange = valueRange
	p.extendTreeWithExpression(expr)
	p.resetData()
}

func (p *Parser) inStateParameter() {
	if p.char == nil {
		return
	}

	c := p.char.value
	if unicode.IsLetter(c) || unicode.IsDigit(c) || c == '_' {
		p.extendValue()
		p.storeTypedChar(CharTypeParameter)
	} else if p.char.isDelimiter() {
		p.finalizeParameter()
		if p.state != stateError {
			p.resetBoolOperator()
			p.state = stateExpectBoolOp
			p.storeTypedChar(CharTypeSpace)
		}
	} else if p.char.isGroupClose() {
		if len(p.nodesStack) == 0 {
			p.setErrorState("unmatched parenthesis", 9)
			return
		}
		p.finalizeParameter()
		if p.state != stateError {
			if len(p.boolOpStack) > 0 {
				p.boolOperator = p.boolOpStack[len(p.boolOpStack)-1]
				p.boolOpStack = p.boolOpStack[:len(p.boolOpStack)-1]
			}
			p.extendTreeFromStack(p.boolOperator)
			p.resetBoolOperator()
			p.state = stateExpectBoolOp
			p.storeTypedChar(CharTypeOperator)
		}
	} else {
		p.setErrorState("invalid character in parameter name", 10)
	}
}

func (p *Parser) inStateLastChar() {
	if p.state == stateInitial && len(p.nodesStack) == 0 {
		p.setErrorState("empty input", 24)
	} else if p.state == stateFunctionArgs ||
		p.state == stateFunctionDuration ||
		p.state == stateFunctionQuotedArg ||
		p.state == stateFunctionExpectCommaOrClose ||
		p.state == stateFunctionExpectArg ||
		p.state == stateFunctionParameter {
		p.setErrorState("unclosed function call", errInvalidFunctionArgs)
	} else if p.state == stateInitial ||
		p.state == stateSingleQuotedKey ||
		p.state == stateDoubleQuotedKey ||
		p.state == stateExpectOperator ||
		p.state == stateExpectValue ||
		p.state == stateExpectNotTarget ||
		p.state == stateExpectInKeyword ||
		p.state == stateExpectHasKeyword ||
		p.state == stateExpectLikeKeyword ||
		p.state == stateExpectListStart ||
		p.state == stateExpectListValue ||
		p.state == stateInListValue ||
		p.state == stateInListSingleQuotedValue ||
		p.state == stateInListDoubleQuotedValue ||
		p.state == stateExpectListCommaOrEnd ||
		p.state == stateInListParameter {
		p.setErrorState("unexpected EOF", 25)
	} else if p.state == stateKey {
		if p.key == NotKeyword {
			p.setErrorState("unexpected EOF after 'not'", 25)
		} else {
			p.extendTreeWithExpression(p.newTruthyExpression())
			p.resetBoolOperator()
		}
	} else if p.state == stateKeyOrBoolOp {
		p.extendTreeWithExpression(p.newTruthyExpression())
		p.resetBoolOperator()
	} else if p.state == stateDoubleQuotedValue || p.state == stateSingleQuotedValue {
		p.setErrorState("unclosed string", 28)
		return
	} else if p.state == stateValue {
		p.extendTree()
		p.resetBoolOperator()
	} else if p.state == stateParameter {
		p.finalizeParameter()
		if p.state != stateError {
			p.resetBoolOperator()
		}
	} else if p.state == stateBoolOpDelimiter {
		p.setErrorState("unexpected EOF", 26)
		return
	}

	if p.state != stateError && len(p.nodesStack) > 0 {
		p.setErrorState("unmatched parenthesis", 27)
	}
}

func (p *Parser) Parse(text string) error {
	p.depth = 0
	p.text = text
	p.pos = 0
	p.line = 0
	p.linePos = 0
	p.state = stateInitial
	p.boolOperator = BoolOpAnd
	p.currentNode = nil
	p.nodesStack = nil
	p.boolOpStack = nil
	p.Root = nil
	p.pendingNegation = false
	p.negationStack = nil
	p.TypedChars = nil
	p.transformerQuote = 0

	for _, c := range text {
		if p.state == stateError {
			break
		}

		ch := newChar(c, p.pos, p.line, p.linePos)
		p.char = &ch

		if p.char.isNewline() {
			p.line++
			p.linePos = 0
			p.pos++
			continue
		}

		switch p.state {
		case stateInitial:
			p.inStateInitial()
		case stateKey:
			p.inStateKey()
		case stateExpectOperator:
			p.inStateExpectOperator()
		case stateValue:
			p.inStateValue()
		case stateExpectValue:
			p.inStateExpectValue()
		case stateSingleQuotedValue:
			p.inStateSingleQuotedValue()
		case stateDoubleQuotedValue:
			p.inStateDoubleQuotedValue()
		case stateKeyValueOperator:
			p.inStateKeyValueOperator()
		case stateBoolOpDelimiter:
			p.inStateBoolOpDelimiter()
		case stateSingleQuotedKey:
			p.inStateSingleQuotedKey()
		case stateDoubleQuotedKey:
			p.inStateDoubleQuotedKey()
		case stateExpectBoolOp:
			p.inStateExpectBoolOp()
		case stateKeyOrBoolOp:
			p.inStateKeyOrBoolOp()
		case stateExpectNotTarget:
			p.inStateExpectNotTarget()
		case stateExpectInKeyword:
			p.inStateExpectInKeyword()
		case stateExpectHasKeyword:
			p.inStateExpectHasKeyword()
		case stateExpectListStart:
			p.inStateExpectListStart()
		case stateExpectLikeKeyword:
			p.inStateExpectLikeKeyword()
		case stateExpectListValue:
			p.inStateExpectListValue()
		case stateInListValue:
			p.inStateInListValue()
		case stateInListSingleQuotedValue:
			p.inStateInListSingleQuotedValue()
		case stateInListDoubleQuotedValue:
			p.inStateInListDoubleQuotedValue()
		case stateExpectListCommaOrEnd:
			p.inStateExpectListCommaOrEnd()
		case stateFunctionArgs:
			p.inStateFunctionArgs()
		case stateFunctionDuration:
			p.inStateFunctionDuration()
		case stateFunctionQuotedArg:
			p.inStateFunctionQuotedArg()
		case stateFunctionExpectCommaOrClose:
			p.inStateFunctionExpectCommaOrClose()
		case stateFunctionExpectArg:
			p.inStateFunctionExpectArg()
		case stateParameter:
			p.inStateParameter()
		case stateInListParameter:
			p.inStateInListParameter()
		case stateFunctionParameter:
			p.inStateFunctionParameter()
		default:
			p.setErrorState("unknown state", 1)
		}

		if p.state == stateError {
			break
		}

		p.pos++
		p.linePos++
	}

	if p.state == stateError {
		return &ParseError{
			Code:    p.errno,
			Message: p.errorText,
			Range:   p.errorRange,
		}
	}

	p.inStateLastChar()

	if p.state == stateError {
		return &ParseError{
			Code:    p.errno,
			Message: p.errorText,
			Range:   p.errorRange,
		}
	}

	p.Root = p.currentNode
	return nil
}
