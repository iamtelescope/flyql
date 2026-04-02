package flyql

import (
	"fmt"
	"strings"

	"github.com/iamtelescope/flyql/golang/types"
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
	inListValuesTypes          []types.ValueType
	isNotIn                    bool
	isNotHas                   bool
	valueQuoteChar             rune
	inListQuoteChar            rune
	pipeSeenInKey              bool
	transformerParenDepth      int
}

func NewParser() *Parser {
	return &Parser{
		boolOperator: BoolOpAnd,
		state:        stateInitial,
	}
}

func (p *Parser) setErrorState(errorText string, errno int) {
	p.state = stateError
	p.errorText = errorText
	p.errno = errno
	if p.char != nil {
		p.errorText += fmt.Sprintf(" [char '%c' at %d], errno=%d", p.char.value, p.char.pos, errno)
	}
}

func (p *Parser) resetKey() {
	p.key = ""
	p.pipeSeenInKey = false
	p.transformerParenDepth = 0
}

func (p *Parser) resetValue() {
	p.value = ""
	p.valueIsString = nil
}

func (p *Parser) resetKeyValueOperator() {
	p.keyValueOperator = ""
}

func (p *Parser) resetData() {
	p.resetKey()
	p.resetValue()
	p.resetKeyValueOperator()
	p.resetInListData()
}

func (p *Parser) resetInListData() {
	p.inListValues = nil
	p.inListCurrentValue = ""
	p.inListCurrentValueIsString = nil
	p.inListValuesType = nil
	p.inListValuesTypes = nil
	p.isNotIn = false
	p.isNotHas = false
}

func (p *Parser) extendInListCurrentValue() {
	if p.char != nil {
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
	var explicitType types.ValueType
	var coarseType string

	if p.inListCurrentValueIsString != nil && *p.inListCurrentValueIsString {
		value = unescapeQuotes(p.inListCurrentValue, p.inListQuoteChar)
		coarseType = "string"
		explicitType = types.String
	} else {
		value, explicitType = tryConvertToNumber(p.inListCurrentValue)
		if explicitType == types.String {
			coarseType = "string"
		} else {
			coarseType = "number"
		}
	}

	if p.inListValuesType == nil {
		p.inListValuesType = &coarseType
	} else if *p.inListValuesType != coarseType {
		p.setErrorState("mixed types in list", 40)
		return false
	}

	p.inListValues = append(p.inListValues, value)
	p.inListValuesTypes = append(p.inListValuesTypes, explicitType)
	p.inListCurrentValue = ""
	p.inListCurrentValueIsString = nil
	return true
}

func (p *Parser) resetBoolOperator() {
	p.boolOperator = ""
}

func (p *Parser) setValueIsString() {
	t := true
	p.valueIsString = &t
	p.valueQuoteChar = p.char.value
}

func (p *Parser) extendKey() {
	if p.char != nil {
		p.key += string(p.char.value)
	}
}

func (p *Parser) extendValue() {
	if p.char != nil {
		p.value += string(p.char.value)
	}
}

func (p *Parser) extendKeyValueOperator() {
	if p.char != nil {
		p.keyValueOperator += string(p.char.value)
	}
}

func (p *Parser) extendBoolOperator() {
	if p.char != nil {
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

func (p *Parser) newExpression() *Expression {
	key, _ := ParseKey(p.key)
	valueIsString := p.valueIsString != nil && *p.valueIsString
	value := p.value

	if value == "null" && !valueIsString {
		if p.keyValueOperator != OpEquals && p.keyValueOperator != OpNotEquals {
			p.setErrorState(fmt.Sprintf("null value cannot be used with operator '%s'", p.keyValueOperator), 51)
		}
		return &Expression{
			Key:       key,
			Operator:  p.keyValueOperator,
			Value:     nil,
			ValueType: types.Null,
		}
	}

	if (value == "true" || value == "false") && !valueIsString {
		return &Expression{
			Key:       key,
			Operator:  p.keyValueOperator,
			Value:     value == "true",
			ValueType: types.Boolean,
		}
	}

	if valueIsString && p.keyValueOperator != OpRegex && p.keyValueOperator != OpNotRegex {
		value = unescapeQuotes(value, p.valueQuoteChar)
	}
	return NewExpression(key, p.keyValueOperator, value, valueIsString)
}

func (p *Parser) newTruthyExpression() *Expression {
	key, _ := ParseKey(p.key)
	return NewExpression(key, OpTruthy, "", true)
}

func (p *Parser) newInExpression() *Expression {
	key, _ := ParseKey(p.key)
	operator := OpIn
	if p.isNotIn {
		operator = OpNotIn
	}
	return NewInExpression(key, operator, p.inListValues, p.inListValuesType, p.inListValuesTypes)
}

func (p *Parser) togglePendingNegation() {
	p.pendingNegation = !p.pendingNegation
}

func (p *Parser) consumePendingNegation() bool {
	negated := p.pendingNegation
	p.pendingNegation = false
	return negated
}

func (p *Parser) extendTreeWithExpression(expression *Expression) {
	negated := p.consumePendingNegation()
	if p.currentNode != nil && p.currentNode.Left == nil {
		node := NewNode("", expression, nil, nil, negated)
		p.currentNode.Left = node
		p.currentNode.BoolOperator = p.boolOperator
	} else if p.currentNode != nil && p.currentNode.Right == nil {
		node := NewNode("", expression, nil, nil, negated)
		p.currentNode.Right = node
		p.currentNode.BoolOperator = p.boolOperator
	} else {
		right := NewNode("", expression, nil, nil, negated)
		node := NewBranchNode(p.boolOperator, p.currentNode, right)
		p.currentNode = node
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

	if node.Right == nil {
		if p.currentNode != nil {
			p.applyNegationToTree(p.currentNode, negated)
		}
		node.Right = p.currentNode
		node.BoolOperator = boolOperator
		p.currentNode = node
	} else {
		if p.currentNode != nil {
			p.applyNegationToTree(p.currentNode, negated)
		}
		newNode := NewBranchNode(boolOperator, node, p.currentNode)
		p.currentNode = newNode
	}
}

func (p *Parser) inStateInitial() {
	if p.char == nil {
		return
	}

	p.resetData()
	p.currentNode = NewNode(p.boolOperator, nil, nil, nil, false)

	if p.char.isGroupOpen() {
		if p.pendingNegation {
			p.negationStack = append(p.negationStack, true)
			p.pendingNegation = false
		} else {
			p.negationStack = append(p.negationStack, false)
		}
		p.extendNodesStack()
		p.extendBoolOpStack()
		p.state = stateInitial
	} else if p.char.isDelimiter() {
		p.state = stateBoolOpDelimiter
	} else if p.char.isKey() {
		p.extendKey()
		p.state = stateKey
	} else if p.char.isSingleQuote() {
		p.extendKey()
		p.state = stateSingleQuotedKey
	} else if p.char.isDoubleQuote() {
		p.extendKey()
		p.state = stateDoubleQuotedKey
	} else {
		p.setErrorState("invalid character", 1)
	}
}

func (p *Parser) inStateKey() {
	if p.char == nil {
		return
	}

	if p.char.isDelimiter() {
		if p.transformerParenDepth > 0 {
			p.extendKey()
			return
		}
		if p.key == NotKeyword {
			p.togglePendingNegation()
			p.resetKey()
			p.state = stateExpectNotTarget
		} else {
			p.state = stateKeyOrBoolOp
		}
	} else if p.char.isKey() {
		if p.char.value == '|' {
			p.pipeSeenInKey = true
		}
		p.extendKey()
	} else if p.pipeSeenInKey && (p.char.isGroupOpen() || p.char.isGroupClose() || p.char.isDoubleQuote() || p.char.isSingleQuote() || p.char.value == ',') {
		if p.char.isGroupOpen() {
			p.transformerParenDepth++
		} else if p.char.isGroupClose() {
			p.transformerParenDepth--
		}
		p.extendKey()
	} else if p.char.isSingleQuote() {
		p.extendKey()
		p.state = stateSingleQuotedKey
	} else if p.char.isDoubleQuote() {
		p.extendKey()
		p.state = stateDoubleQuotedKey
	} else if p.char.isOp() {
		p.extendKeyValueOperator()
		p.state = stateKeyValueOperator
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
	} else {
		p.setErrorState("invalid character", 3)
	}
}

func (p *Parser) inStateExpectOperator() {
	if p.char == nil {
		return
	}

	if p.char.isDelimiter() {
		return
	} else if p.char.isOp() {
		p.extendKeyValueOperator()
		p.state = stateKeyValueOperator
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
		return
	} else if p.keyValueOperator == "ha" && p.char.value == 's' {
		p.keyValueOperator = HasKeyword
		return
	} else if p.keyValueOperator == HasKeyword {
		if p.char.isDelimiter() {
			p.keyValueOperator = OpHas
			p.isNotHas = false
			p.state = stateExpectValue
		} else if p.char.isSingleQuote() {
			p.keyValueOperator = OpHas
			p.isNotHas = false
			p.setValueIsString()
			p.state = stateSingleQuotedValue
		} else if p.char.isDoubleQuote() {
			p.keyValueOperator = OpHas
			p.isNotHas = false
			p.setValueIsString()
			p.state = stateDoubleQuotedValue
		} else if p.char.isValue() {
			p.keyValueOperator = OpHas
			p.isNotHas = false
			p.state = stateValue
			p.extendValue()
		} else {
			p.setErrorState("expected value after 'has'", 50)
		}
		return
	}

	if p.keyValueOperator == "i" && p.char.value == 'n' {
		p.keyValueOperator = "in"
		return
	} else if p.keyValueOperator == "in" {
		if p.char.isDelimiter() {
			p.keyValueOperator = ""
			p.isNotIn = false
			p.state = stateExpectListStart
		} else if p.char.value == '[' {
			p.keyValueOperator = ""
			p.isNotIn = false
			p.state = stateExpectListValue
		} else {
			p.setErrorState("expected '[' after 'in'", 47)
		}
		return
	}

	if p.char.isDelimiter() {
		if !validKeyValueOperators[p.keyValueOperator] {
			p.setErrorState("unknown operator: "+p.keyValueOperator, 10)
		} else {
			p.state = stateExpectValue
		}
	} else if p.char.isOp() {
		p.extendKeyValueOperator()
	} else if p.char.isValue() {
		if !validKeyValueOperators[p.keyValueOperator] {
			p.setErrorState("unknown operator: "+p.keyValueOperator, 10)
		} else {
			p.state = stateValue
			p.extendValue()
		}
	} else if p.char.isSingleQuote() {
		if !validKeyValueOperators[p.keyValueOperator] {
			p.setErrorState("unknown operator: "+p.keyValueOperator, 10)
		} else {
			p.setValueIsString()
			p.state = stateSingleQuotedValue
		}
	} else if p.char.isDoubleQuote() {
		if !validKeyValueOperators[p.keyValueOperator] {
			p.setErrorState("unknown operator: "+p.keyValueOperator, 10)
		} else {
			p.setValueIsString()
			p.state = stateDoubleQuotedValue
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
		return
	} else if p.char.isValue() {
		p.state = stateValue
		p.extendValue()
	} else if p.char.isSingleQuote() {
		p.setValueIsString()
		p.state = stateSingleQuotedValue
	} else if p.char.isDoubleQuote() {
		p.setValueIsString()
		p.state = stateDoubleQuotedValue
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
	} else if p.char.isDelimiter() {
		p.state = stateExpectBoolOp
		p.extendTree()
		p.resetData()
		p.resetBoolOperator()
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
	} else {
		p.setErrorState("invalid character", 10)
	}
}

func (p *Parser) inStateSingleQuotedValue() {
	if p.char == nil {
		return
	}

	if !p.char.isSingleQuote() {
		p.extendValue()
	} else {
		prevPos := p.char.pos - 1
		if prevPos >= 0 && p.text[prevPos] == '\\' {
			p.extendValue()
		} else {
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
	} else {
		prevPos := p.char.pos - 1
		if prevPos >= 0 && p.text[prevPos] == '\\' {
			p.extendValue()
		} else {
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
	} else {
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
	} else {
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
		return
	} else if p.char.isKey() {
		p.state = stateKey
		p.extendKey()
	} else if p.char.isSingleQuote() {
		p.extendKey()
		p.state = stateSingleQuotedKey
	} else if p.char.isDoubleQuote() {
		p.extendKey()
		p.state = stateDoubleQuotedKey
	} else if p.char.isGroupOpen() {
		if p.pendingNegation {
			p.negationStack = append(p.negationStack, true)
			p.pendingNegation = false
		} else {
			p.negationStack = append(p.negationStack, false)
		}
		p.extendNodesStack()
		p.extendBoolOpStack()
		p.state = stateInitial
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
	} else {
		p.setErrorState("invalid character", 18)
	}
}

func (p *Parser) inStateExpectBoolOp() {
	if p.char == nil {
		return
	}

	if p.char.isDelimiter() {
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
	} else {
		p.extendBoolOperator()
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
		return
	} else if p.char.isOp() {
		p.extendKeyValueOperator()
		p.state = stateKeyValueOperator
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
	} else if p.char.value == 'i' {
		p.keyValueOperator = "i"
		p.state = stateKeyValueOperator
	} else if p.char.value == 'h' {
		p.keyValueOperator = "h"
		p.state = stateKeyValueOperator
	} else if p.char.value == 'n' {
		p.keyValueOperator = "n"
		p.state = stateExpectInKeyword
	} else if validBoolOperatorChars[p.char.value] {
		p.extendTreeWithExpression(p.newTruthyExpression())
		p.resetData()
		p.resetBoolOperator()
		p.state = stateExpectBoolOp
		p.extendBoolOperator()
		if validBoolOperators[p.boolOperator] {
			nextPos := p.char.pos + 1
			if nextPos < len(p.text) {
				nextChar := newChar(rune(p.text[nextPos]), nextPos, 0, 0)
				if !nextChar.isDelimiter() {
					p.setErrorState("expected delimiter after bool operator", 23)
					return
				}
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
		return
	} else if p.char.isKey() {
		p.extendKey()
		p.state = stateKey
	} else if p.char.isSingleQuote() {
		p.extendKey()
		p.state = stateSingleQuotedKey
	} else if p.char.isDoubleQuote() {
		p.extendKey()
		p.state = stateDoubleQuotedKey
	} else if p.char.isGroupOpen() {
		p.negationStack = append(p.negationStack, p.pendingNegation)
		p.pendingNegation = false
		p.extendNodesStack()
		p.extendBoolOpStack()
		p.state = stateInitial
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
		} else {
			p.setErrorState("expected 'not' or 'in' keyword", 41)
		}
	} else if p.keyValueOperator == "no" {
		if p.char.value == 't' {
			p.keyValueOperator += "t"
		} else {
			p.setErrorState("expected 'not' keyword", 41)
		}
	} else if p.keyValueOperator == "not" {
		if p.char.isDelimiter() {
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
		return
	} else if p.char.value == 'h' && p.isNotIn {
		p.keyValueOperator = "h"
		p.isNotIn = false
		p.isNotHas = true
		p.state = stateExpectHasKeyword
	} else if p.char.value == 'i' {
		p.keyValueOperator = "i"
	} else if p.keyValueOperator == "i" && p.char.value == 'n' {
		p.keyValueOperator = ""
	} else if p.char.value == '[' {
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
	} else if p.keyValueOperator == "ha" && p.char.value == 's' {
		p.keyValueOperator = HasKeyword
	} else if p.keyValueOperator == HasKeyword {
		if p.char.isDelimiter() {
			p.keyValueOperator = OpNotHas
			p.state = stateExpectValue
		} else if p.char.isSingleQuote() {
			p.keyValueOperator = OpNotHas
			p.setValueIsString()
			p.state = stateSingleQuotedValue
		} else if p.char.isDoubleQuote() {
			p.keyValueOperator = OpNotHas
			p.setValueIsString()
			p.state = stateDoubleQuotedValue
		} else if p.char.isValue() {
			p.keyValueOperator = OpNotHas
			p.state = stateValue
			p.extendValue()
		} else {
			p.setErrorState("expected value after 'not has'", 50)
		}
	} else {
		p.setErrorState("expected 'has' keyword", 50)
	}
}

func (p *Parser) inStateExpectListValue() {
	if p.char == nil {
		return
	}

	if p.char.isDelimiter() {
		return
	} else if p.char.value == ']' {
		p.extendTreeWithExpression(p.newInExpression())
		p.resetData()
		p.resetBoolOperator()
		p.state = stateExpectBoolOp
	} else if p.char.isSingleQuote() {
		p.setInListCurrentValueIsString()
		p.state = stateInListSingleQuotedValue
	} else if p.char.isDoubleQuote() {
		p.setInListCurrentValueIsString()
		p.state = stateInListDoubleQuotedValue
	} else if p.char.isValue() && p.char.value != ',' && p.char.value != ']' {
		p.extendInListCurrentValue()
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
	} else if p.char.isDelimiter() {
		if !p.finalizeInListValue() {
			return
		}
		p.state = stateExpectListCommaOrEnd
	} else if p.char.value == ',' {
		if !p.finalizeInListValue() {
			return
		}
		p.state = stateExpectListValue
	} else if p.char.value == ']' {
		if !p.finalizeInListValue() {
			return
		}
		p.extendTreeWithExpression(p.newInExpression())
		p.resetData()
		p.resetBoolOperator()
		p.state = stateExpectBoolOp
	} else {
		p.setErrorState("unexpected character in list value", 44)
	}
}

func (p *Parser) inStateInListSingleQuotedValue() {
	if p.char == nil {
		return
	}

	if !p.char.isSingleQuote() {
		p.extendInListCurrentValue()
	} else {
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
	} else {
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
		return
	} else if p.char.value == ',' {
		p.state = stateExpectListValue
	} else if p.char.value == ']' {
		p.extendTreeWithExpression(p.newInExpression())
		p.resetData()
		p.resetBoolOperator()
		p.state = stateExpectBoolOp
	} else {
		p.setErrorState("expected ',' or ']'", 46)
	}
}

func (p *Parser) inStateLastChar() {
	if p.state == stateInitial && len(p.nodesStack) == 0 {
		p.setErrorState("empty input", 24)
	} else if p.state == stateInitial ||
		p.state == stateSingleQuotedKey ||
		p.state == stateDoubleQuotedKey ||
		p.state == stateExpectOperator ||
		p.state == stateExpectValue ||
		p.state == stateExpectNotTarget ||
		p.state == stateExpectInKeyword ||
		p.state == stateExpectHasKeyword ||
		p.state == stateExpectListStart ||
		p.state == stateExpectListValue ||
		p.state == stateInListValue ||
		p.state == stateInListSingleQuotedValue ||
		p.state == stateInListDoubleQuotedValue ||
		p.state == stateExpectListCommaOrEnd {
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
	} else if p.state == stateValue ||
		p.state == stateDoubleQuotedValue ||
		p.state == stateSingleQuotedValue {
		p.extendTree()
		p.resetBoolOperator()
	} else if p.state == stateBoolOpDelimiter {
		p.setErrorState("unexpected EOF", 26)
		return
	}

	if p.state != stateError && len(p.nodesStack) > 0 {
		p.setErrorState("unmatched parenthesis", 27)
	}
}

func (p *Parser) Parse(text string) error {
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
			Pos:     p.pos,
		}
	}

	p.inStateLastChar()

	if p.state == stateError {
		return &ParseError{
			Code:    p.errno,
			Message: p.errorText,
			Pos:     p.pos,
		}
	}

	p.Root = p.currentNode
	return nil
}
