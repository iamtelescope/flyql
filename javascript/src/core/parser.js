import { Char } from './char.js'
import { Expression } from './expression.js'
import { Node } from './tree.js'
import { ParserError } from './exceptions.js'
import { parseKey } from './key.js'
import { tryConvertToNumber } from './utils.js'
import { ValueType } from '../types.js'
import {
    State,
    CharType,
    PIPE,
    VALID_KEY_VALUE_OPERATORS,
    VALID_BOOL_OPERATORS,
    VALID_BOOL_OPERATORS_CHARS,
    Operator,
    NOT_KEYWORD,
    IN_KEYWORD,
    HAS_KEYWORD,
} from './constants.js'

export class Parser {
    constructor() {
        this.pos = 0
        this.line = 0
        this.linePos = 0
        this.text = ''
        this.state = State.INITIAL
        this.char = null
        this.key = ''
        this.value = ''
        this.valueIsString = null
        this.keyValueOperator = ''
        this.boolOperator = 'and'
        this.currentNode = null
        this.nodesStack = []
        this.boolOpStack = []
        this.errorText = ''
        this.errno = 0
        this.root = null
        this.typedChars = []
        this._pipeSeenInKey = false
        this._transformerParenDepth = 0
        this.pendingNegation = false
        this.negationStack = []
        this.inListValues = []
        this.inListCurrentValue = ''
        this.inListCurrentValueIsString = null
        this.inListValuesType = null
        this.inListValuesTypes = []
        this.isNotIn = false
        this.isNotHas = false
        this.valueQuoteChar = ''
        this.inListQuoteChar = ''
    }

    setState(state) {
        this.state = state
    }

    setText(text) {
        this.text = text
    }

    setChar(char) {
        this.char = char
    }

    setCurrentNode(node) {
        this.currentNode = node
    }

    setValueIsString() {
        this.valueIsString = true
        this.valueQuoteChar = this.char.value
    }

    setErrorState(errorText, errno) {
        this.state = State.ERROR
        this.errorText = errorText
        this.errno = errno
        if (this.char) {
            this.errorText += ` [char ${this.char.value} at ${this.char.pos}], errno=${errno}`
        }
    }

    resetPos() {
        this.pos = 0
    }

    resetKey() {
        this.key = ''
        this._pipeSeenInKey = false
        this._transformerParenDepth = 0
    }

    resetValue() {
        this.value = ''
        this.resetValueIsString()
    }

    resetValueIsString() {
        this.valueIsString = null
    }

    resetKeyValueOperator() {
        this.keyValueOperator = ''
    }

    resetData() {
        this.resetKey()
        this.resetValue()
        this.resetKeyValueOperator()
        this.resetInListData()
    }

    resetInListData() {
        this.inListValues = []
        this.inListCurrentValue = ''
        this.inListCurrentValueIsString = null
        this.inListValuesType = null
        this.inListValuesTypes = []
        this.isNotIn = false
        this.isNotHas = false
    }

    extendInListCurrentValue() {
        if (this.char) {
            this.inListCurrentValue += this.char.value
        }
    }

    finalizeInListValue() {
        if (!this.inListCurrentValue && this.inListCurrentValueIsString === null) {
            return true
        }

        let value
        let coarseType
        let explicitType
        if (this.inListCurrentValueIsString) {
            value =
                this.inListQuoteChar === "'"
                    ? this.inListCurrentValue.replace(/\\'/g, "'")
                    : this.inListCurrentValue.replace(/\\"/g, '"')
            coarseType = 'string'
            explicitType = ValueType.STRING
        } else {
            const [convertedValue, detectedType] = tryConvertToNumber(this.inListCurrentValue)
            value = convertedValue
            explicitType = detectedType
            coarseType = detectedType === ValueType.STRING ? 'string' : 'number'
        }

        if (this.inListValuesType === null) {
            this.inListValuesType = coarseType
        } else if (this.inListValuesType !== coarseType) {
            this.setErrorState('mixed types in list', 40)
            return false
        }

        this.inListValues.push(value)
        this.inListValuesTypes.push(explicitType)
        this.inListCurrentValue = ''
        this.inListCurrentValueIsString = null
        return true
    }

    resetBoolOperator() {
        this.boolOperator = ''
    }

    extendKey() {
        if (this.char) {
            this.key += this.char.value
        }
    }

    extendValue() {
        if (this.char) {
            this.value += this.char.value
        }
    }

    extendKeyValueOperator() {
        if (this.char) {
            this.keyValueOperator += this.char.value
        }
    }

    extendBoolOperator() {
        if (this.char) {
            this.boolOperator += this.char.value
        }
    }

    extendNodesStack() {
        if (this.currentNode) {
            this.nodesStack.push(this.currentNode)
        }
    }

    extendBoolOpStack() {
        this.boolOpStack.push(this.boolOperator)
    }

    storeTypedChar(charType) {
        this.typedChars.push([this.char, charType])
    }

    newNode(boolOperator, expression, left, right, negated = false) {
        return new Node(boolOperator, expression, left, right, negated)
    }

    newExpression() {
        let value = this.value

        if (value === 'null' && !this.valueIsString) {
            if (this.keyValueOperator !== Operator.EQUALS && this.keyValueOperator !== Operator.NOT_EQUALS) {
                this.setErrorState(`null value cannot be used with operator '${this.keyValueOperator}'`, 51)
            }
            return new Expression(
                parseKey(this.key),
                this.keyValueOperator,
                null,
                null,
                null,
                null,
                null,
                ValueType.NULL,
            )
        }

        if ((value === 'true' || value === 'false') && !this.valueIsString) {
            return new Expression(
                parseKey(this.key),
                this.keyValueOperator,
                value === 'true',
                null,
                null,
                null,
                null,
                ValueType.BOOLEAN,
            )
        }

        if (
            this.valueIsString &&
            this.keyValueOperator !== Operator.REGEX &&
            this.keyValueOperator !== Operator.NOT_REGEX
        ) {
            if (this.valueQuoteChar === "'") {
                value = value.replace(/\\'/g, "'")
            } else {
                value = value.replace(/\\"/g, '"')
            }
        }
        return new Expression(parseKey(this.key), this.keyValueOperator, value, this.valueIsString)
    }

    newTruthyExpression() {
        return new Expression(parseKey(this.key), Operator.TRUTHY, null, null)
    }

    newInExpression() {
        const operator = this.isNotIn ? Operator.NOT_IN : Operator.IN
        return new Expression(
            parseKey(this.key),
            operator,
            '',
            null,
            this.inListValues,
            this.inListValuesType,
            this.inListValuesTypes.length > 0 ? this.inListValuesTypes : null,
        )
    }

    togglePendingNegation() {
        this.pendingNegation = !this.pendingNegation
    }

    consumePendingNegation() {
        const negated = this.pendingNegation
        this.pendingNegation = false
        return negated
    }

    extendTreeWithExpression(expression) {
        const negated = this.consumePendingNegation()
        if (this.currentNode && this.currentNode.left === null) {
            const node = this.newNode('', expression, null, null, negated)
            this.currentNode.setLeft(node)
            this.currentNode.setBoolOperator(this.boolOperator)
        } else if (this.currentNode && this.currentNode.right === null) {
            const node = this.newNode('', expression, null, null, negated)
            this.currentNode.setRight(node)
            this.currentNode.setBoolOperator(this.boolOperator)
        } else {
            const right = this.newNode('', expression, null, null, negated)
            const node = this.newNode(this.boolOperator, null, this.currentNode, right)
            this.setCurrentNode(node)
        }
    }

    applyNegationToTree() {
        if (this.negationStack.length > 0) {
            const negated = this.negationStack.pop()
            if (negated && this.currentNode) {
                this.currentNode.setNegated(true)
            }
        }
    }

    extendTree() {
        const negated = this.consumePendingNegation()
        if (this.currentNode && this.currentNode.left === null) {
            const node = this.newNode('', this.newExpression(), null, null, negated)
            this.currentNode.setLeft(node)
            this.currentNode.setBoolOperator(this.boolOperator)
        } else if (this.currentNode && this.currentNode.right === null) {
            const node = this.newNode('', this.newExpression(), null, null, negated)
            this.currentNode.setRight(node)
            this.currentNode.setBoolOperator(this.boolOperator)
        } else {
            const right = this.newNode('', this.newExpression(), null, null, negated)
            const node = this.newNode(this.boolOperator, null, this.currentNode, right)
            this.setCurrentNode(node)
        }
    }

    extendTreeFromStack(boolOperator) {
        const node = this.nodesStack.pop()
        if (node.right === null) {
            node.right = this.currentNode
            node.setBoolOperator(boolOperator)
            this.setCurrentNode(node)
        } else {
            const newNode = this.newNode(boolOperator, null, node, this.currentNode)
            this.setCurrentNode(newNode)
        }
    }

    inStateInitial() {
        if (!this.char) {
            return
        }

        this.resetData()
        this.setCurrentNode(this.newNode(this.boolOperator, null, null, null))
        if (this.char.isGroupOpen()) {
            this.extendNodesStack()
            this.extendBoolOpStack()
            this.setState(State.INITIAL)
            this.storeTypedChar(CharType.OPERATOR)
        } else if (this.char.isDelimiter()) {
            this.setState(State.BOOL_OP_DELIMITER)
            this.storeTypedChar(CharType.SPACE)
        } else if (this.char.isKey()) {
            this.extendKey()
            this.setState(State.KEY)
            this.storeTypedChar(CharType.KEY)
        } else if (this.char.isSingleQuote()) {
            this.extendKey()
            this.setState(State.SINGLE_QUOTED_KEY)
            this.storeTypedChar(CharType.KEY)
        } else if (this.char.isDoubleQuote()) {
            this.extendKey()
            this.setState(State.DOUBLE_QUOTED_KEY)
            this.storeTypedChar(CharType.KEY)
        } else {
            this.setErrorState('invalid character', 1)
        }
    }

    inStateKey() {
        if (!this.char) {
            return
        }

        if (this.char.isDelimiter()) {
            if (this._transformerParenDepth > 0) {
                this.extendKey()
                this.storeTypedChar(CharType.ARGUMENT)
                return
            }
            if (this.key === NOT_KEYWORD) {
                this.togglePendingNegation()
                this.resetKey()
                this.setState(State.EXPECT_NOT_TARGET)
            } else {
                this.setState(State.KEY_OR_BOOL_OP)
            }
            this.storeTypedChar(CharType.SPACE)
        } else if (this.char.isKey()) {
            this.extendKey()
            if (this.char.value === PIPE) {
                this._pipeSeenInKey = true
                this.storeTypedChar(CharType.PIPE)
            } else if (this._pipeSeenInKey) {
                this.storeTypedChar(CharType.TRANSFORMER)
            } else {
                this.storeTypedChar(CharType.KEY)
            }
        } else if (this._pipeSeenInKey && '(),"\''.includes(this.char.value)) {
            if (this.char.value === '(') this._transformerParenDepth++
            else if (this.char.value === ')') this._transformerParenDepth--
            this.extendKey()
            this.storeTypedChar(CharType.ARGUMENT)
        } else if (this.char.isSingleQuote()) {
            this.extendKey()
            this.setState(State.SINGLE_QUOTED_KEY)
            this.storeTypedChar(CharType.KEY)
        } else if (this.char.isDoubleQuote()) {
            this.extendKey()
            this.setState(State.DOUBLE_QUOTED_KEY)
            this.storeTypedChar(CharType.KEY)
        } else if (this.char.isOp()) {
            this.extendKeyValueOperator()
            this.setState(State.KEY_VALUE_OPERATOR)
            this.storeTypedChar(CharType.OPERATOR)
        } else if (this.char.isGroupClose()) {
            if (!this.nodesStack.length) {
                this.setErrorState('unmatched parenthesis', 3)
                return
            }
            this.extendTreeWithExpression(this.newTruthyExpression())
            this.resetData()
            if (this.boolOpStack.length) {
                this.boolOperator = this.boolOpStack.pop()
            }
            this.extendTreeFromStack(this.boolOperator)
            this.applyNegationToTree()
            this.resetBoolOperator()
            this.setState(State.EXPECT_BOOL_OP)
            this.storeTypedChar(CharType.OPERATOR)
        } else {
            this.setErrorState('invalid character', 3)
        }
    }

    inStateExpectOperator() {
        if (!this.char) {
            return
        }

        if (this.char.isDelimiter()) {
            this.storeTypedChar(CharType.SPACE)
            return
        } else if (this.char.isOp()) {
            this.extendKeyValueOperator()
            this.setState(State.KEY_VALUE_OPERATOR)
            this.storeTypedChar(CharType.OPERATOR)
        } else {
            this.setErrorState('expected operator', 28)
        }
    }

    inStateKeyOrBoolOp() {
        if (!this.char) {
            return
        }

        if (this.char.isDelimiter()) {
            this.storeTypedChar(CharType.SPACE)
            return
        } else if (this.char.isOp()) {
            this.extendKeyValueOperator()
            this.setState(State.KEY_VALUE_OPERATOR)
            this.storeTypedChar(CharType.OPERATOR)
        } else if (this.char.isGroupClose()) {
            if (!this.nodesStack.length) {
                this.setErrorState('unmatched parenthesis', 32)
                return
            }
            this.extendTreeWithExpression(this.newTruthyExpression())
            this.resetData()
            if (this.boolOpStack.length) {
                this.boolOperator = this.boolOpStack.pop()
            }
            this.extendTreeFromStack(this.boolOperator)
            this.applyNegationToTree()
            this.resetBoolOperator()
            this.setState(State.EXPECT_BOOL_OP)
            this.storeTypedChar(CharType.OPERATOR)
        } else if (this.char.value === 'i') {
            this.keyValueOperator = 'i'
            this.setState(State.KEY_VALUE_OPERATOR)
            this.storeTypedChar(CharType.OPERATOR)
        } else if (this.char.value === 'h') {
            this.keyValueOperator = 'h'
            this.setState(State.KEY_VALUE_OPERATOR)
            this.storeTypedChar(CharType.OPERATOR)
        } else if (this.char.value === 'n') {
            this.keyValueOperator = 'n'
            this.setState(State.EXPECT_IN_KEYWORD)
            this.storeTypedChar(CharType.OPERATOR)
        } else if (this.char.isBoolOpChar()) {
            this.extendTreeWithExpression(this.newTruthyExpression())
            this.resetData()
            this.resetBoolOperator()
            this.extendBoolOperator()
            this.storeTypedChar(CharType.OPERATOR)
            this.setState(State.EXPECT_BOOL_OP)
        } else {
            this.setErrorState('expected operator or boolean operator', 32)
        }
    }

    inStateExpectNotTarget() {
        if (!this.char) {
            return
        }

        if (this.char.isDelimiter()) {
            this.storeTypedChar(CharType.SPACE)
            return
        } else if (this.char.isKey()) {
            this.extendKey()
            this.setState(State.KEY)
            this.storeTypedChar(CharType.KEY)
        } else if (this.char.isSingleQuote()) {
            this.extendKey()
            this.setState(State.SINGLE_QUOTED_KEY)
            this.storeTypedChar(CharType.KEY)
        } else if (this.char.isDoubleQuote()) {
            this.extendKey()
            this.setState(State.DOUBLE_QUOTED_KEY)
            this.storeTypedChar(CharType.KEY)
        } else if (this.char.isGroupOpen()) {
            if (this.pendingNegation) {
                this.negationStack.push(true)
                this.pendingNegation = false
            } else {
                this.negationStack.push(false)
            }
            this.extendNodesStack()
            this.extendBoolOpStack()
            this.setState(State.INITIAL)
            this.storeTypedChar(CharType.OPERATOR)
        } else {
            this.setErrorState('expected key or group after not', 33)
        }
    }

    inStateKeyValueOperator() {
        if (!this.char) {
            return
        }

        if (this.keyValueOperator === 'h' && this.char.value === 'a') {
            this.keyValueOperator = 'ha'
            this.storeTypedChar(CharType.OPERATOR)
            return
        }

        if (this.keyValueOperator === 'ha' && this.char.value === 's') {
            this.keyValueOperator = HAS_KEYWORD
            this.storeTypedChar(CharType.OPERATOR)
            return
        }

        if (this.keyValueOperator === HAS_KEYWORD) {
            if (this.char.isDelimiter()) {
                this.storeTypedChar(CharType.SPACE)
                this.keyValueOperator = Operator.HAS
                this.isNotHas = false
                this.setState(State.EXPECT_VALUE)
            } else if (this.char.isSingleQuote()) {
                this.keyValueOperator = Operator.HAS
                this.isNotHas = false
                this.setValueIsString()
                this.setState(State.SINGLE_QUOTED_VALUE)
                this.storeTypedChar(CharType.VALUE)
            } else if (this.char.isDoubleQuote()) {
                this.keyValueOperator = Operator.HAS
                this.isNotHas = false
                this.setValueIsString()
                this.setState(State.DOUBLE_QUOTED_VALUE)
                this.storeTypedChar(CharType.VALUE)
            } else if (this.char.isValue()) {
                this.keyValueOperator = Operator.HAS
                this.isNotHas = false
                this.setState(State.VALUE)
                this.extendValue()
                this.storeTypedChar(CharType.VALUE)
            } else {
                this.setErrorState("expected value after 'has'", 50)
            }
            return
        }

        if (this.keyValueOperator === 'i' && this.char.value === 'n') {
            this.keyValueOperator = 'in'
            this.storeTypedChar(CharType.OPERATOR)
            return
        }

        if (this.keyValueOperator === 'in') {
            if (this.char.isDelimiter()) {
                this.storeTypedChar(CharType.SPACE)
                this.keyValueOperator = ''
                this.isNotIn = false
                this.setState(State.EXPECT_LIST_START)
            } else if (this.char.value === '[') {
                this.storeTypedChar(CharType.OPERATOR)
                this.keyValueOperator = ''
                this.isNotIn = false
                this.setState(State.EXPECT_LIST_VALUE)
            } else {
                this.setErrorState("expected '[' after 'in'", 47)
            }
            return
        }

        if (this.char.isDelimiter()) {
            this.storeTypedChar(CharType.SPACE)
            if (!VALID_KEY_VALUE_OPERATORS.includes(this.keyValueOperator)) {
                this.setErrorState(`unknown operator: ${this.keyValueOperator}`, 10)
            } else {
                this.setState(State.EXPECT_VALUE)
            }
        } else if (this.char.isOp()) {
            this.extendKeyValueOperator()
            this.storeTypedChar(CharType.OPERATOR)
        } else if (this.char.isValue()) {
            if (!VALID_KEY_VALUE_OPERATORS.includes(this.keyValueOperator)) {
                this.setErrorState(`unknown operator: ${this.keyValueOperator}`, 10)
            } else {
                this.setState(State.VALUE)
                this.extendValue()
                this.storeTypedChar(CharType.VALUE)
            }
        } else if (this.char.isSingleQuote()) {
            if (!VALID_KEY_VALUE_OPERATORS.includes(this.keyValueOperator)) {
                this.setErrorState(`unknown operator: ${this.keyValueOperator}`, 10)
            } else {
                this.setValueIsString()
                this.setState(State.SINGLE_QUOTED_VALUE)
                this.storeTypedChar(CharType.VALUE)
            }
        } else if (this.char.isDoubleQuote()) {
            if (!VALID_KEY_VALUE_OPERATORS.includes(this.keyValueOperator)) {
                this.setErrorState(`unknown operator: ${this.keyValueOperator}`, 10)
            } else {
                this.setValueIsString()
                this.setState(State.DOUBLE_QUOTED_VALUE)
                this.storeTypedChar(CharType.VALUE)
            }
        } else {
            this.setErrorState('invalid character', 4)
        }
    }

    inStateExpectValue() {
        if (!this.char) {
            return
        }

        if (this.char.isDelimiter()) {
            this.storeTypedChar(CharType.SPACE)
            return
        } else if (this.char.isValue()) {
            this.setState(State.VALUE)
            this.extendValue()
            this.storeTypedChar(CharType.VALUE)
        } else if (this.char.isSingleQuote()) {
            this.setValueIsString()
            this.setState(State.SINGLE_QUOTED_VALUE)
            this.storeTypedChar(CharType.VALUE)
        } else if (this.char.isDoubleQuote()) {
            this.setValueIsString()
            this.setState(State.DOUBLE_QUOTED_VALUE)
            this.storeTypedChar(CharType.VALUE)
        } else {
            this.setErrorState('expected value', 29)
        }
    }

    inStateValue() {
        if (!this.char) {
            return
        }

        if (this.char.isValue()) {
            this.extendValue()
            this.storeTypedChar(CharType.VALUE)
        } else if (this.char.isDelimiter()) {
            this.setState(State.EXPECT_BOOL_OP)
            this.extendTree()
            this.resetData()
            this.resetBoolOperator()
            this.storeTypedChar(CharType.SPACE)
        } else if (this.char.isGroupClose()) {
            if (!this.nodesStack.length) {
                this.setErrorState('unmatched parenthesis', 9)
                return
            } else {
                this.extendTree()
                this.resetData()
                if (this.boolOpStack.length) {
                    this.boolOperator = this.boolOpStack.pop()
                }
                this.extendTreeFromStack(this.boolOperator)
                this.applyNegationToTree()
                this.resetBoolOperator()
                this.setState(State.EXPECT_BOOL_OP)
                this.storeTypedChar(CharType.OPERATOR)
            }
        } else {
            this.setErrorState('invalid character', 10)
        }
    }

    inStateSingleQuotedValue() {
        if (!this.char) {
            return
        }

        if (this.char.isSingleQuotedValue()) {
            this.extendValue()
            this.storeTypedChar(CharType.VALUE)
        } else if (this.char.isSingleQuote()) {
            this.storeTypedChar(CharType.VALUE)
            const prevPos = this.char.pos - 1
            if (prevPos >= 0 && this.text[prevPos] === '\\') {
                this.extendValue()
            } else {
                this.setState(State.EXPECT_BOOL_OP)
                this.extendTree()
                this.resetData()
                this.resetBoolOperator()
            }
        } else {
            this.setErrorState('invalid character', 11)
        }
    }

    inStateDoubleQuotedValue() {
        if (!this.char) {
            return
        }

        if (this.char.isDoubleQuotedValue()) {
            this.extendValue()
            this.storeTypedChar(CharType.VALUE)
        } else if (this.char.isDoubleQuote()) {
            this.storeTypedChar(CharType.VALUE)
            const prevPos = this.char.pos - 1
            if (prevPos >= 0 && this.text[prevPos] === '\\') {
                this.extendValue()
            } else {
                this.setState(State.EXPECT_BOOL_OP)
                this.extendTree()
                this.resetData()
                this.resetBoolOperator()
            }
        } else {
            this.setErrorState('invalid character', 11)
        }
    }

    inStateSingleQuotedKey() {
        if (!this.char) {
            return
        }

        if (this.char.isSingleQuotedValue()) {
            this.extendKey()
            this.storeTypedChar(CharType.KEY)
        } else if (this.char.isSingleQuote()) {
            this.storeTypedChar(CharType.KEY)
            const prevPos = this.char.pos - 1
            if (prevPos >= 0 && this.text[prevPos] === '\\') {
                this.extendKey()
            } else {
                this.extendKey()
                this.setState(State.KEY)
            }
        } else {
            this.setErrorState('invalid character in quoted key', 30)
        }
    }

    inStateDoubleQuotedKey() {
        if (!this.char) {
            return
        }

        if (this.char.isDoubleQuotedValue()) {
            this.extendKey()
            this.storeTypedChar(CharType.KEY)
        } else if (this.char.isDoubleQuote()) {
            this.storeTypedChar(CharType.KEY)
            const prevPos = this.char.pos - 1
            if (prevPos >= 0 && this.text[prevPos] === '\\') {
                this.extendKey()
            } else {
                this.extendKey()
                this.setState(State.KEY)
            }
        } else {
            this.setErrorState('invalid character in quoted key', 31)
        }
    }

    inStateBoolOpDelimiter() {
        if (!this.char) {
            return
        }

        if (this.char.isDelimiter()) {
            this.storeTypedChar(CharType.SPACE)
            return
        } else if (this.char.isKey()) {
            this.setState(State.KEY)
            this.extendKey()
            this.storeTypedChar(CharType.KEY)
        } else if (this.char.isSingleQuote()) {
            this.extendKey()
            this.setState(State.SINGLE_QUOTED_KEY)
            this.storeTypedChar(CharType.KEY)
        } else if (this.char.isDoubleQuote()) {
            this.extendKey()
            this.setState(State.DOUBLE_QUOTED_KEY)
            this.storeTypedChar(CharType.KEY)
        } else if (this.char.isGroupOpen()) {
            if (this.pendingNegation) {
                this.negationStack.push(true)
                this.pendingNegation = false
            } else {
                this.negationStack.push(false)
            }
            this.extendNodesStack()
            this.extendBoolOpStack()
            this.setState(State.INITIAL)
            this.storeTypedChar(CharType.OPERATOR)
        } else if (this.char.isGroupClose()) {
            if (!this.nodesStack.length) {
                this.setErrorState('unmatched parenthesis', 15)
                return
            } else {
                this.resetData()
                if (this.boolOpStack.length) {
                    this.extendTreeFromStack(this.boolOpStack.pop())
                }
                this.applyNegationToTree()
                this.setState(State.EXPECT_BOOL_OP)
                this.storeTypedChar(CharType.OPERATOR)
            }
        } else {
            this.setErrorState('invalid character', 18)
        }
    }

    inStateExpectBoolOp() {
        if (!this.char) {
            return
        }

        if (this.char.isDelimiter()) {
            this.storeTypedChar(CharType.SPACE)
            return
        } else if (this.char.isGroupClose()) {
            if (!this.nodesStack.length) {
                this.setErrorState('unmatched parenthesis', 19)
                return
            } else {
                this.resetData()
                this.resetBoolOperator()
                if (this.boolOpStack.length) {
                    this.extendTreeFromStack(this.boolOpStack.pop())
                }
                this.applyNegationToTree()
                this.setState(State.EXPECT_BOOL_OP)
                this.storeTypedChar(CharType.OPERATOR)
            }
        } else {
            this.extendBoolOperator()
            this.storeTypedChar(CharType.OPERATOR)
            if (this.boolOperator.length > 3 || !VALID_BOOL_OPERATORS_CHARS.includes(this.char.value)) {
                this.setErrorState('invalid character', 20)
            } else {
                if (VALID_BOOL_OPERATORS.includes(this.boolOperator)) {
                    const nextPos = this.char.pos + 1
                    if (this.text.length > nextPos) {
                        const nextChar = new Char(this.text[nextPos], nextPos, 0, 0)
                        if (!nextChar.isDelimiter()) {
                            this.setErrorState('expected delimiter after bool operator', 23)
                            return
                        } else {
                            this.setState(State.BOOL_OP_DELIMITER)
                        }
                    }
                }
            }
        }
    }

    inStateExpectInKeyword() {
        if (!this.char) {
            return
        }

        if (this.keyValueOperator === 'n') {
            if (this.char.value === 'o') {
                this.keyValueOperator += 'o'
                this.storeTypedChar(CharType.OPERATOR)
            } else {
                this.setErrorState("expected 'not' or 'in' keyword", 41)
            }
        } else if (this.keyValueOperator === 'no') {
            if (this.char.value === 't') {
                this.keyValueOperator += 't'
                this.storeTypedChar(CharType.OPERATOR)
            } else {
                this.setErrorState("expected 'not' keyword", 41)
            }
        } else if (this.keyValueOperator === 'not') {
            if (this.char.isDelimiter()) {
                this.storeTypedChar(CharType.SPACE)
                this.keyValueOperator = ''
                this.isNotIn = true
                this.setState(State.EXPECT_LIST_START)
            } else {
                this.setErrorState("expected space after 'not'", 41)
            }
        } else {
            this.setErrorState('unexpected state in expect_in_keyword', 41)
        }
    }

    inStateExpectListStart() {
        if (!this.char) {
            return
        }

        if (this.char.isDelimiter()) {
            this.storeTypedChar(CharType.SPACE)
            return
        } else if (this.char.value === 'h' && this.isNotIn) {
            this.keyValueOperator = 'h'
            this.isNotIn = false
            this.isNotHas = true
            this.setState(State.EXPECT_HAS_KEYWORD)
            this.storeTypedChar(CharType.OPERATOR)
        } else if (this.char.value === 'i') {
            this.keyValueOperator = 'i'
            this.storeTypedChar(CharType.OPERATOR)
        } else if (this.keyValueOperator === 'i' && this.char.value === 'n') {
            this.keyValueOperator = ''
            this.storeTypedChar(CharType.OPERATOR)
        } else if (this.char.value === '[') {
            this.storeTypedChar(CharType.OPERATOR)
            this.setState(State.EXPECT_LIST_VALUE)
        } else {
            this.setErrorState("expected '['", 42)
        }
    }

    inStateExpectHasKeyword() {
        if (!this.char) {
            return
        }

        if (this.keyValueOperator === 'h' && this.char.value === 'a') {
            this.keyValueOperator = 'ha'
            this.storeTypedChar(CharType.OPERATOR)
        } else if (this.keyValueOperator === 'ha' && this.char.value === 's') {
            this.keyValueOperator = HAS_KEYWORD
            this.storeTypedChar(CharType.OPERATOR)
        } else if (this.keyValueOperator === HAS_KEYWORD) {
            if (this.char.isDelimiter()) {
                this.storeTypedChar(CharType.SPACE)
                this.keyValueOperator = Operator.NOT_HAS
                this.setState(State.EXPECT_VALUE)
            } else if (this.char.isSingleQuote()) {
                this.keyValueOperator = Operator.NOT_HAS
                this.setValueIsString()
                this.setState(State.SINGLE_QUOTED_VALUE)
                this.storeTypedChar(CharType.VALUE)
            } else if (this.char.isDoubleQuote()) {
                this.keyValueOperator = Operator.NOT_HAS
                this.setValueIsString()
                this.setState(State.DOUBLE_QUOTED_VALUE)
                this.storeTypedChar(CharType.VALUE)
            } else if (this.char.isValue()) {
                this.keyValueOperator = Operator.NOT_HAS
                this.setState(State.VALUE)
                this.extendValue()
                this.storeTypedChar(CharType.VALUE)
            } else {
                this.setErrorState("expected value after 'not has'", 50)
            }
        } else {
            this.setErrorState("expected 'has' keyword", 50)
        }
    }

    inStateExpectListValue() {
        if (!this.char) {
            return
        }

        if (this.char.isDelimiter()) {
            this.storeTypedChar(CharType.SPACE)
            return
        } else if (this.char.value === ']') {
            this.storeTypedChar(CharType.OPERATOR)
            this.extendTreeWithExpression(this.newInExpression())
            this.resetData()
            this.resetBoolOperator()
            this.setState(State.EXPECT_BOOL_OP)
        } else if (this.char.isSingleQuote()) {
            this.inListCurrentValueIsString = true
            this.inListQuoteChar = this.char.value
            this.storeTypedChar(CharType.VALUE)
            this.setState(State.IN_LIST_SINGLE_QUOTED_VALUE)
        } else if (this.char.isDoubleQuote()) {
            this.inListCurrentValueIsString = true
            this.inListQuoteChar = this.char.value
            this.storeTypedChar(CharType.VALUE)
            this.setState(State.IN_LIST_DOUBLE_QUOTED_VALUE)
        } else if (this.char.isValue()) {
            this.extendInListCurrentValue()
            this.storeTypedChar(CharType.VALUE)
            this.setState(State.IN_LIST_VALUE)
        } else {
            this.setErrorState('expected value in list', 43)
        }
    }

    inStateInListValue() {
        if (!this.char) {
            return
        }

        if (this.char.isValue() && this.char.value !== ',' && this.char.value !== ']') {
            this.extendInListCurrentValue()
            this.storeTypedChar(CharType.VALUE)
        } else if (this.char.isDelimiter()) {
            if (!this.finalizeInListValue()) {
                return
            }
            this.storeTypedChar(CharType.SPACE)
            this.setState(State.EXPECT_LIST_COMMA_OR_END)
        } else if (this.char.value === ',') {
            if (!this.finalizeInListValue()) {
                return
            }
            this.storeTypedChar(CharType.OPERATOR)
            this.setState(State.EXPECT_LIST_VALUE)
        } else if (this.char.value === ']') {
            if (!this.finalizeInListValue()) {
                return
            }
            this.storeTypedChar(CharType.OPERATOR)
            this.extendTreeWithExpression(this.newInExpression())
            this.resetData()
            this.resetBoolOperator()
            this.setState(State.EXPECT_BOOL_OP)
        } else {
            this.setErrorState('unexpected character in list value', 44)
        }
    }

    inStateInListSingleQuotedValue() {
        if (!this.char) {
            return
        }

        if (this.char.isSingleQuotedValue()) {
            this.extendInListCurrentValue()
            this.storeTypedChar(CharType.VALUE)
        } else if (this.char.isSingleQuote()) {
            this.storeTypedChar(CharType.VALUE)
            const prevPos = this.char.pos - 1
            if (prevPos >= 0 && this.text[prevPos] === '\\') {
                this.extendInListCurrentValue()
            } else {
                if (!this.finalizeInListValue()) {
                    return
                }
                this.setState(State.EXPECT_LIST_COMMA_OR_END)
            }
        } else {
            this.setErrorState('invalid character in quoted value', 45)
        }
    }

    inStateInListDoubleQuotedValue() {
        if (!this.char) {
            return
        }

        if (this.char.isDoubleQuotedValue()) {
            this.extendInListCurrentValue()
            this.storeTypedChar(CharType.VALUE)
        } else if (this.char.isDoubleQuote()) {
            this.storeTypedChar(CharType.VALUE)
            const prevPos = this.char.pos - 1
            if (prevPos >= 0 && this.text[prevPos] === '\\') {
                this.extendInListCurrentValue()
            } else {
                if (!this.finalizeInListValue()) {
                    return
                }
                this.setState(State.EXPECT_LIST_COMMA_OR_END)
            }
        } else {
            this.setErrorState('invalid character in quoted value', 45)
        }
    }

    inStateExpectListCommaOrEnd() {
        if (!this.char) {
            return
        }

        if (this.char.isDelimiter()) {
            this.storeTypedChar(CharType.SPACE)
            return
        } else if (this.char.value === ',') {
            this.storeTypedChar(CharType.OPERATOR)
            this.setState(State.EXPECT_LIST_VALUE)
        } else if (this.char.value === ']') {
            this.storeTypedChar(CharType.OPERATOR)
            this.extendTreeWithExpression(this.newInExpression())
            this.resetData()
            this.resetBoolOperator()
            this.setState(State.EXPECT_BOOL_OP)
        } else {
            this.setErrorState("expected ',' or ']'", 46)
        }
    }

    inStateLastChar() {
        if (this.state === State.INITIAL && !this.nodesStack.length) {
            this.setErrorState('empty input', 24)
        } else if (
            this.state === State.INITIAL ||
            this.state === State.SINGLE_QUOTED_KEY ||
            this.state === State.DOUBLE_QUOTED_KEY ||
            this.state === State.EXPECT_OPERATOR ||
            this.state === State.EXPECT_VALUE ||
            this.state === State.EXPECT_NOT_TARGET ||
            this.state === State.EXPECT_IN_KEYWORD ||
            this.state === State.EXPECT_HAS_KEYWORD ||
            this.state === State.EXPECT_LIST_START ||
            this.state === State.EXPECT_LIST_VALUE ||
            this.state === State.IN_LIST_VALUE ||
            this.state === State.IN_LIST_SINGLE_QUOTED_VALUE ||
            this.state === State.IN_LIST_DOUBLE_QUOTED_VALUE ||
            this.state === State.EXPECT_LIST_COMMA_OR_END
        ) {
            this.setErrorState('unexpected EOF', 25)
        } else if (this.state === State.KEY) {
            if (this.key === NOT_KEYWORD) {
                this.setErrorState('unexpected EOF after not', 25)
            } else {
                this.extendTreeWithExpression(this.newTruthyExpression())
                this.resetBoolOperator()
            }
        } else if (this.state === State.KEY_OR_BOOL_OP) {
            this.extendTreeWithExpression(this.newTruthyExpression())
            this.resetBoolOperator()
        } else if (
            this.state === State.VALUE ||
            this.state === State.DOUBLE_QUOTED_VALUE ||
            this.state === State.SINGLE_QUOTED_VALUE
        ) {
            this.extendTree()
            this.resetBoolOperator()
        } else if (this.state === State.BOOL_OP_DELIMITER) {
            this.setErrorState('unexpected EOF', 26)
            return
        }

        if (this.state !== State.ERROR && this.nodesStack.length) {
            this.setErrorState('unmatched parenthesis', 27)
        }
    }

    parse(text, raiseError = true, ignoreLastChar = false) {
        this.setText(text)

        for (let c of text) {
            if (this.state === State.ERROR) {
                break
            }

            this.setChar(new Char(c, this.pos, this.line, this.linePos))

            if (this.char && this.char.isNewline()) {
                this.line += 1
                this.linePos = 0
                this.pos += 1
                continue
            }

            switch (this.state) {
                case State.INITIAL:
                    this.inStateInitial()
                    break
                case State.KEY:
                    this.inStateKey()
                    break
                case State.SINGLE_QUOTED_KEY:
                    this.inStateSingleQuotedKey()
                    break
                case State.DOUBLE_QUOTED_KEY:
                    this.inStateDoubleQuotedKey()
                    break
                case State.EXPECT_OPERATOR:
                    this.inStateExpectOperator()
                    break
                case State.VALUE:
                    this.inStateValue()
                    break
                case State.EXPECT_VALUE:
                    this.inStateExpectValue()
                    break
                case State.SINGLE_QUOTED_VALUE:
                    this.inStateSingleQuotedValue()
                    break
                case State.DOUBLE_QUOTED_VALUE:
                    this.inStateDoubleQuotedValue()
                    break
                case State.KEY_VALUE_OPERATOR:
                    this.inStateKeyValueOperator()
                    break
                case State.BOOL_OP_DELIMITER:
                    this.inStateBoolOpDelimiter()
                    break
                case State.EXPECT_BOOL_OP:
                    this.inStateExpectBoolOp()
                    break
                case State.KEY_OR_BOOL_OP:
                    this.inStateKeyOrBoolOp()
                    break
                case State.EXPECT_NOT_TARGET:
                    this.inStateExpectNotTarget()
                    break
                case State.EXPECT_IN_KEYWORD:
                    this.inStateExpectInKeyword()
                    break
                case State.EXPECT_HAS_KEYWORD:
                    this.inStateExpectHasKeyword()
                    break
                case State.EXPECT_LIST_START:
                    this.inStateExpectListStart()
                    break
                case State.EXPECT_LIST_VALUE:
                    this.inStateExpectListValue()
                    break
                case State.IN_LIST_VALUE:
                    this.inStateInListValue()
                    break
                case State.IN_LIST_SINGLE_QUOTED_VALUE:
                    this.inStateInListSingleQuotedValue()
                    break
                case State.IN_LIST_DOUBLE_QUOTED_VALUE:
                    this.inStateInListDoubleQuotedValue()
                    break
                case State.EXPECT_LIST_COMMA_OR_END:
                    this.inStateExpectListCommaOrEnd()
                    break
                default:
                    this.setErrorState(`Unknown state: ${this.state}`, 1)
            }

            if (this.state === State.ERROR) {
                break
            }

            this.pos += 1
            this.linePos += 1
        }

        if (this.state === State.ERROR) {
            if (raiseError) {
                throw new ParserError(this.errorText, this.errno)
            } else {
                return
            }
        }

        if (!ignoreLastChar) {
            this.inStateLastChar()
        }

        if (this.state === State.ERROR) {
            if (raiseError) {
                throw new ParserError(this.errorText, this.errno)
            } else {
                return
            }
        }

        this.root = this.currentNode
    }
}

export function parse(text, raiseError = true, ignoreLastChar = false) {
    const parser = new Parser()
    parser.parse(text, raiseError, ignoreLastChar)
    return parser
}
