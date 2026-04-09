import { Char } from './char.js'
import { Expression, FunctionCall, Duration } from './expression.js'
import { Node } from './tree.js'
import { ParserError, KeyParseError } from './exceptions.js'
import { parseKey, Key } from './key.js'
import { Range } from './range.js'
import { convertUnquotedValue } from './utils.js'
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
    LIKE_KEYWORD,
    ILIKE_KEYWORD,
    KNOWN_FUNCTIONS,
    ERR_UNKNOWN_FUNCTION,
    ERR_INVALID_FUNCTION_ARGS,
    ERR_FUNCTION_NOT_ALLOWED_WITH_OPERATOR,
    ERR_INVALID_DURATION,
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
        this._transformerQuote = null
        this.pendingNegation = false
        this.negationStack = []
        this.inListValues = []
        this.inListCurrentValue = ''
        this.inListCurrentValueIsString = null
        this.inListValuesType = null
        this.inListValuesTypes = []
        this.isNotIn = false
        this.isNotHas = false
        this.isNotLike = false
        this.isNotIlike = false
        this.valueQuoteChar = ''
        this.inListQuoteChar = ''
        // Position tracking
        this._keyStart = -1
        this._keyEnd = -1
        this._valueStart = -1
        this._valueEnd = -1
        this._operatorStart = -1
        this._operatorEnd = -1
        this._exprStart = -1
        this._boolOpStartStack = []
        this._boolOpEndStack = []
        this._groupStartStack = []
        this._inListValueStart = -1
        this._inListValueEnd = -1
        this._inListValueRanges = []
        this._errorRange = null
        this._functionName = ''
        this._functionDurationBuf = ''
        this._functionArgs = []
        this._functionDurations = []
        this._functionCurrentArg = ''
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
        if (this.char) {
            this.valueQuoteChar = this.char.value
            if (this._valueStart === -1) {
                this._valueStart = this.char.pos
            }
            this._valueEnd = this.char.pos + 1
        }
    }

    setErrorState(errorText, errno, range = null) {
        this.state = State.ERROR
        this.errorText = errorText
        this.errno = errno
        if (range !== null) {
            this._errorRange = range
        } else if (this.char) {
            this._errorRange = new Range(this.char.pos, this.char.pos + 1)
        } else {
            this._errorRange = null
        }
    }

    resetPos() {
        this.pos = 0
    }

    resetKey() {
        this.key = ''
        this._pipeSeenInKey = false
        this._transformerParenDepth = 0
        this._transformerQuote = null
        this._keyStart = -1
        this._keyEnd = -1
    }

    resetValue() {
        this.value = ''
        this.resetValueIsString()
        this._valueStart = -1
        this._valueEnd = -1
    }

    resetValueIsString() {
        this.valueIsString = null
    }

    resetKeyValueOperator() {
        this.keyValueOperator = ''
        this._operatorStart = -1
        this._operatorEnd = -1
    }

    resetData() {
        this.resetKey()
        this.resetValue()
        this.resetKeyValueOperator()
        this.resetInListData()
        this._exprStart = -1
    }

    resetInListData() {
        this.inListValues = []
        this.inListCurrentValue = ''
        this.inListCurrentValueIsString = null
        this.inListValuesType = null
        this.inListValuesTypes = []
        this.isNotIn = false
        this.isNotHas = false
        this.isNotLike = false
        this.isNotIlike = false
        this._inListValueStart = -1
        this._inListValueEnd = -1
        this._inListValueRanges = []
    }

    extendInListCurrentValue() {
        if (this.char) {
            if (this._inListValueStart === -1) {
                this._inListValueStart = this.char.pos
            }
            this._inListValueEnd = this.char.pos + 1
            this.inListCurrentValue += this.char.value
        }
    }

    finalizeInListValue() {
        if (!this.inListCurrentValue && this.inListCurrentValueIsString === null) {
            return true
        }

        let value
        let explicitType
        if (this.inListCurrentValueIsString) {
            value =
                this.inListQuoteChar === "'"
                    ? this.inListCurrentValue.replace(/\\'/g, "'")
                    : this.inListCurrentValue.replace(/\\"/g, '"')
            explicitType = ValueType.STRING
        } else if (this.inListCurrentValue === 'null') {
            value = null
            explicitType = ValueType.NULL
        } else if (this.inListCurrentValue === 'true' || this.inListCurrentValue === 'false') {
            value = this.inListCurrentValue === 'true'
            explicitType = ValueType.BOOLEAN
        } else {
            const [convertedValue, detectedType] = convertUnquotedValue(this.inListCurrentValue)
            value = convertedValue
            explicitType = detectedType
        }

        this.inListValues.push(value)
        this.inListValuesTypes.push(explicitType)
        if (this._inListValueStart >= 0) {
            this._inListValueRanges.push(new Range(this._inListValueStart, this._inListValueEnd))
        }
        this.inListCurrentValue = ''
        this.inListCurrentValueIsString = null
        this._inListValueStart = -1
        this._inListValueEnd = -1
        return true
    }

    resetBoolOperator() {
        this.boolOperator = ''
    }

    extendKey() {
        if (this.char) {
            if (this._keyStart === -1) {
                this._keyStart = this.char.pos
                if (this._exprStart === -1) {
                    this._exprStart = this.char.pos
                }
            }
            this._keyEnd = this.char.pos + 1
            this.key += this.char.value
        }
    }

    extendValue() {
        if (this.char) {
            if (this._valueStart === -1) {
                this._valueStart = this.char.pos
            }
            this._valueEnd = this.char.pos + 1
            this.value += this.char.value
        }
    }

    extendKeyValueOperator() {
        if (this.char) {
            if (this._operatorStart === -1) {
                this._operatorStart = this.char.pos
            }
            this._operatorEnd = this.char.pos + 1
            this.keyValueOperator += this.char.value
        }
    }

    extendBoolOperator() {
        if (this.char) {
            if (this.boolOperator === '') {
                this._boolOpStartStack.push(this.char.pos)
                this._boolOpEndStack.push(this.char.pos + 1)
            } else if (this._boolOpEndStack.length > 0) {
                this._boolOpEndStack[this._boolOpEndStack.length - 1] = this.char.pos + 1
            }
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

    newNode(boolOperator, expression, left, right, negated = false, range = null, boolOperatorRange = null) {
        return new Node(boolOperator, expression, left, right, negated, range, boolOperatorRange)
    }

    _buildExprRanges(end) {
        const keyRange = new Range(this._keyStart, this._keyEnd)
        const operatorRange = this._operatorStart >= 0 ? new Range(this._operatorStart, this._operatorEnd) : null
        const start = this._exprStart >= 0 ? this._exprStart : this._keyStart
        const exprRange = new Range(start, end)
        return { exprRange, keyRange, operatorRange }
    }

    _parseKeyWithRange(keyRange) {
        try {
            return parseKey(this.key, keyRange.start)
        } catch (e) {
            if (e instanceof KeyParseError) {
                this.setErrorState(e.message, 60, e.range)
                return new Key([''], '', [], [false], keyRange, [keyRange])
            }
            throw e
        }
    }

    newExpression() {
        const exprEnd = this._valueEnd >= 0 ? this._valueEnd : this._operatorEnd >= 0 ? this._operatorEnd : this._keyEnd
        const { exprRange, keyRange, operatorRange } = this._buildExprRanges(exprEnd)
        const valueRange = this._valueStart >= 0 ? new Range(this._valueStart, this._valueEnd) : null
        const key = this._parseKeyWithRange(keyRange)
        let value = this.value

        if (value === 'null' && !this.valueIsString) {
            if (this.keyValueOperator !== Operator.EQUALS && this.keyValueOperator !== Operator.NOT_EQUALS) {
                this.setErrorState(`null value cannot be used with operator '${this.keyValueOperator}'`, 51)
            }
            return new Expression(
                key,
                this.keyValueOperator,
                null,
                null,
                null,
                null,
                null,
                ValueType.NULL,
                exprRange,
                operatorRange,
                valueRange,
                null,
            )
        }

        if ((value === 'true' || value === 'false') && !this.valueIsString) {
            return new Expression(
                key,
                this.keyValueOperator,
                value === 'true',
                null,
                null,
                null,
                null,
                ValueType.BOOLEAN,
                exprRange,
                operatorRange,
                valueRange,
                null,
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
        return new Expression(
            key,
            this.keyValueOperator,
            value,
            this.valueIsString,
            null,
            null,
            null,
            undefined,
            exprRange,
            operatorRange,
            valueRange,
            null,
        )
    }

    newTruthyExpression() {
        const exprEnd = this._keyEnd
        const { exprRange, keyRange } = this._buildExprRanges(exprEnd)
        const key = this._parseKeyWithRange(keyRange)
        return new Expression(key, Operator.TRUTHY, '', true, null, null, null, undefined, exprRange, null, null, null)
    }

    newInExpression() {
        const exprEnd = this.char ? this.char.pos + 1 : this._keyEnd
        const { exprRange, keyRange } = this._buildExprRanges(exprEnd)
        const key = this._parseKeyWithRange(keyRange)
        const operator = this.isNotIn ? Operator.NOT_IN : Operator.IN
        return new Expression(
            key,
            operator,
            '',
            null,
            this.inListValues,
            this.inListValuesType,
            this.inListValuesTypes.length > 0 ? this.inListValuesTypes : null,
            undefined,
            exprRange,
            null,
            null,
            this._inListValueRanges.length > 0 ? [...this._inListValueRanges] : null,
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

    _popBoolOpRange() {
        if (this._boolOpStartStack.length > 0 && this._boolOpEndStack.length > 0) {
            const s = this._boolOpStartStack.pop()
            const e = this._boolOpEndStack.pop()
            return new Range(s, e)
        }
        return null
    }

    _attachExpr(expression) {
        const negated = this.consumePendingNegation()
        const exprRange = expression ? expression.range : null
        if (this.currentNode && this.currentNode.left === null) {
            const node = this.newNode('', expression, null, null, negated, exprRange)
            this.currentNode.setLeft(node)
            this.currentNode.setBoolOperator(this.boolOperator)
            if (exprRange && this.currentNode.range) {
                this.currentNode.range = new Range(
                    Math.min(this.currentNode.range.start, exprRange.start),
                    Math.max(this.currentNode.range.end, exprRange.end),
                )
            }
        } else if (this.currentNode && this.currentNode.right === null) {
            const node = this.newNode('', expression, null, null, negated, exprRange)
            this.currentNode.setRight(node)
            this.currentNode.setBoolOperator(this.boolOperator)
            const bopR = this._popBoolOpRange()
            if (bopR !== null) {
                this.currentNode.boolOperatorRange = bopR
            }
            if (exprRange && this.currentNode.range) {
                this.currentNode.range = new Range(
                    Math.min(this.currentNode.range.start, exprRange.start),
                    Math.max(this.currentNode.range.end, exprRange.end),
                )
            }
        } else {
            const right = this.newNode('', expression, null, null, negated, exprRange)
            const bopR = this._popBoolOpRange()
            const parentRange =
                this.currentNode && this.currentNode.range && exprRange
                    ? new Range(this.currentNode.range.start, exprRange.end)
                    : null
            const node = this.newNode(this.boolOperator, null, this.currentNode, right, false, parentRange, bopR)
            this.setCurrentNode(node)
        }
    }

    extendTreeWithExpression(expression) {
        this._attachExpr(expression)
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
        this._attachExpr(this.newExpression())
    }

    extendTreeFromStack(boolOperator) {
        const node = this.nodesStack.pop()
        const groupStart = this._groupStartStack.length > 0 ? this._groupStartStack.pop() : null
        if (node.right === null) {
            node.right = this.currentNode
            if (boolOperator) {
                node.setBoolOperator(boolOperator)
                const bopR = this._popBoolOpRange()
                if (bopR !== null) node.boolOperatorRange = bopR
            }
            if (groupStart !== null && this.char) {
                node.range = new Range(groupStart, this.char.pos + 1)
            } else if (this.currentNode && this.currentNode.range) {
                node.range = new Range(
                    node.range ? node.range.start : this.currentNode.range.start,
                    this.currentNode.range.end,
                )
            }
            this.setCurrentNode(node)
        } else {
            const bopR = boolOperator ? this._popBoolOpRange() : null
            let leftStart = node.range ? node.range.start : 0
            let rightEnd = this.currentNode && this.currentNode.range ? this.currentNode.range.end : 0
            if (groupStart !== null && this.char) {
                leftStart = groupStart
                rightEnd = this.char.pos + 1
            }
            const newNode = this.newNode(
                boolOperator,
                null,
                node,
                this.currentNode,
                false,
                new Range(leftStart, rightEnd),
                bopR,
            )
            this.setCurrentNode(newNode)
        }
    }

    inStateInitial() {
        if (!this.char) {
            return
        }

        this.resetData()
        this._exprStart = -1
        const startPos = this.char.pos
        this.setCurrentNode(this.newNode(this.boolOperator, null, null, null, false, new Range(startPos, startPos)))
        if (this.char.isGroupOpen()) {
            this.extendNodesStack()
            this.extendBoolOpStack()
            this._groupStartStack.push(startPos)
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

        if (this._transformerQuote) {
            this.extendKey()
            if (this.char.value === this._transformerQuote) {
                this._transformerQuote = null
            }
            this.storeTypedChar(CharType.ARGUMENT_STRING)
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
            } else if (this._transformerParenDepth > 0) {
                this.storeTypedChar(CharType.ARGUMENT_NUMBER)
            } else if (this._pipeSeenInKey) {
                this.storeTypedChar(CharType.TRANSFORMER)
            } else {
                this.storeTypedChar(CharType.KEY)
            }
        } else if (this._pipeSeenInKey && '(),"\''.includes(this.char.value)) {
            if (this.char.value === '(') this._transformerParenDepth++
            else if (this.char.value === ')') this._transformerParenDepth--
            else if (this._transformerParenDepth > 0 && (this.char.value === '"' || this.char.value === "'")) {
                this._transformerQuote = this.char.value
                this.extendKey()
                this.storeTypedChar(CharType.ARGUMENT_STRING)
                return
            }
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
                this.setErrorState('unmatched parenthesis', 9)
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
                this.setErrorState('unmatched parenthesis', 9)
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
        } else if (this.char.value === 'l') {
            this.keyValueOperator = 'l'
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
            this._groupStartStack.push(this.char.pos)
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

        if (this.keyValueOperator === 'i' && this.char.value === 'l') {
            this.keyValueOperator = 'il'
            this.storeTypedChar(CharType.OPERATOR)
            return
        }

        if (this.keyValueOperator === 'il' && this.char.value === 'i') {
            this.keyValueOperator = 'ili'
            this.storeTypedChar(CharType.OPERATOR)
            return
        }

        if (this.keyValueOperator === 'ili' && this.char.value === 'k') {
            this.keyValueOperator = 'ilik'
            this.storeTypedChar(CharType.OPERATOR)
            return
        }

        if (this.keyValueOperator === 'ilik' && this.char.value === 'e') {
            this.keyValueOperator = ILIKE_KEYWORD
            this.storeTypedChar(CharType.OPERATOR)
            return
        }

        if (this.keyValueOperator === ILIKE_KEYWORD) {
            if (this.char.isDelimiter()) {
                this.storeTypedChar(CharType.SPACE)
                this.keyValueOperator = Operator.ILIKE
                this.setState(State.EXPECT_VALUE)
            } else if (this.char.isSingleQuote()) {
                this.keyValueOperator = Operator.ILIKE
                this.setValueIsString()
                this.setState(State.SINGLE_QUOTED_VALUE)
                this.storeTypedChar(CharType.VALUE)
            } else if (this.char.isDoubleQuote()) {
                this.keyValueOperator = Operator.ILIKE
                this.setValueIsString()
                this.setState(State.DOUBLE_QUOTED_VALUE)
                this.storeTypedChar(CharType.VALUE)
            } else if (this.char.isValue()) {
                this.keyValueOperator = Operator.ILIKE
                this.setState(State.VALUE)
                this.extendValue()
                this.storeTypedChar(CharType.VALUE)
            } else {
                this.setErrorState("expected value after 'ilike'", 50)
            }
            return
        }

        if (this.keyValueOperator === 'l' && this.char.value === 'i') {
            this.keyValueOperator = 'li'
            this.storeTypedChar(CharType.OPERATOR)
            return
        }

        if (this.keyValueOperator === 'li' && this.char.value === 'k') {
            this.keyValueOperator = 'lik'
            this.storeTypedChar(CharType.OPERATOR)
            return
        }

        if (this.keyValueOperator === 'lik' && this.char.value === 'e') {
            this.keyValueOperator = LIKE_KEYWORD
            this.storeTypedChar(CharType.OPERATOR)
            return
        }

        if (this.keyValueOperator === LIKE_KEYWORD) {
            if (this.char.isDelimiter()) {
                this.storeTypedChar(CharType.SPACE)
                this.keyValueOperator = Operator.LIKE
                this.setState(State.EXPECT_VALUE)
            } else if (this.char.isSingleQuote()) {
                this.keyValueOperator = Operator.LIKE
                this.setValueIsString()
                this.setState(State.SINGLE_QUOTED_VALUE)
                this.storeTypedChar(CharType.VALUE)
            } else if (this.char.isDoubleQuote()) {
                this.keyValueOperator = Operator.LIKE
                this.setValueIsString()
                this.setState(State.DOUBLE_QUOTED_VALUE)
                this.storeTypedChar(CharType.VALUE)
            } else if (this.char.isValue()) {
                this.keyValueOperator = Operator.LIKE
                this.setState(State.VALUE)
                this.extendValue()
                this.storeTypedChar(CharType.VALUE)
            } else {
                this.setErrorState("expected value after 'like'", 50)
            }
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

    _isLikeOperator() {
        return (
            this.keyValueOperator === Operator.LIKE ||
            this.keyValueOperator === Operator.NOT_LIKE ||
            this.keyValueOperator === Operator.ILIKE ||
            this.keyValueOperator === Operator.NOT_ILIKE
        )
    }

    inStateValue() {
        if (!this.char) {
            return
        }

        if (this.char.isValue()) {
            this.extendValue()
            if (this._isLikeOperator() && (this.char.value === '%' || this.char.value === '_')) {
                const prevPos = this.char.pos - 1
                if (prevPos < 0 || this.text[prevPos] !== '\\') {
                    this.storeTypedChar(CharType.WILDCARD)
                } else {
                    this.storeTypedChar(CharType.VALUE)
                }
            } else {
                this.storeTypedChar(CharType.VALUE)
            }
        } else if (this.char.isDelimiter()) {
            this.setState(State.EXPECT_BOOL_OP)
            this.extendTree()
            this.resetData()
            this.resetBoolOperator()
            this.storeTypedChar(CharType.SPACE)
        } else if (this.char.isGroupOpen()) {
            if (KNOWN_FUNCTIONS.has(this.value)) {
                this._functionName = this.value
                this.value = ''
                this.setState(State.FUNCTION_ARGS)
                this.storeTypedChar(CharType.VALUE)
            } else {
                this.setErrorState(`unknown function '${this.value}'`, ERR_UNKNOWN_FUNCTION)
            }
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

    resetFunctionData() {
        this._functionName = ''
        this._functionDurationBuf = ''
        this._functionArgs = []
        this._functionDurations = []
        this._functionCurrentArg = ''
    }

    parseDurationBuf() {
        const buf = this._functionDurationBuf
        if (!buf) return false
        let numBuf = ''
        for (let i = 0; i < buf.length; i++) {
            const c = buf[i]
            if (c >= '0' && c <= '9') {
                numBuf += c
            } else {
                if (!['s', 'm', 'h', 'd', 'w'].includes(c)) {
                    this.setErrorState(`invalid duration unit '${c}' — expected s, m, h, d, or w`, ERR_INVALID_DURATION)
                    return false
                }
                if (!numBuf) {
                    this.setErrorState('invalid duration format', ERR_INVALID_DURATION)
                    return false
                }
                this._functionDurations.push(new Duration(parseInt(numBuf, 10), c))
                numBuf = ''
            }
        }
        if (numBuf) {
            this.setErrorState('invalid duration format — missing unit', ERR_INVALID_DURATION)
            return false
        }
        return true
    }

    completeFunctionCall() {
        const name = this._functionName

        if (this.keyValueOperator === Operator.REGEX || this.keyValueOperator === Operator.NOT_REGEX) {
            this.setErrorState(
                `operator '${this.keyValueOperator}' is not valid with a temporal function`,
                ERR_FUNCTION_NOT_ALLOWED_WITH_OPERATOR,
            )
            return
        }

        let fc = null

        if (name === 'ago') {
            if (this._functionArgs.length > 0) {
                this.setErrorState('ago() requires a duration, not a string argument', ERR_INVALID_DURATION)
                return
            }
            if (!this.parseDurationBuf()) {
                if (this.state !== State.ERROR) {
                    this.setErrorState('ago() requires a duration argument', ERR_INVALID_DURATION)
                }
                return
            }
            if (this._functionDurations.length === 0) {
                this.setErrorState('ago() requires a duration argument', ERR_INVALID_DURATION)
                return
            }
            fc = new FunctionCall('ago', [...this._functionDurations])
        } else if (name === 'now') {
            if (this._functionArgs.length > 0 || this._functionDurationBuf) {
                this.setErrorState('now() does not accept arguments', ERR_INVALID_DURATION)
                return
            }
            fc = new FunctionCall('now')
        } else if (name === 'today') {
            if (this._functionDurationBuf) {
                this.setErrorState('today() does not accept duration arguments', ERR_INVALID_DURATION)
                return
            }
            if (this._functionArgs.length > 1) {
                this.setErrorState('today() accepts at most one argument (timezone)', ERR_INVALID_DURATION)
                return
            }
            const tz = this._functionArgs.length === 1 ? this._functionArgs[0] : ''
            fc = new FunctionCall('today', [], '', tz)
        } else if (name === 'startOf') {
            if (this._functionDurationBuf) {
                this.setErrorState('startOf() does not accept duration arguments', ERR_INVALID_DURATION)
                return
            }
            if (this._functionArgs.length === 0) {
                this.setErrorState(
                    "startOf() requires a unit argument ('day', 'week', or 'month')",
                    ERR_INVALID_DURATION,
                )
                return
            }
            const unit = this._functionArgs[0]
            if (unit !== 'day' && unit !== 'week' && unit !== 'month') {
                this.setErrorState(`invalid unit '${unit}' — expected 'day', 'week', or 'month'`, ERR_INVALID_DURATION)
                return
            }
            if (this._functionArgs.length > 2) {
                this.setErrorState('startOf() accepts at most two arguments (unit, timezone)', ERR_INVALID_DURATION)
                return
            }
            const tz = this._functionArgs.length === 2 ? this._functionArgs[1] : ''
            fc = new FunctionCall('startOf', [], unit, tz)
        }

        if (fc === null) return

        const keyRange = new Range(this._keyStart, this._keyEnd)
        const key = this._parseKeyWithRange(keyRange)
        const exprRange = new Range(this._exprStart, this.char.pos + 1)
        const operatorRange = new Range(this._operatorStart, this._operatorEnd)
        const valueRange = new Range(this._valueStart, this.char.pos + 1)

        const expr = new Expression(
            key,
            this.keyValueOperator,
            fc,
            false,
            null,
            null,
            null,
            ValueType.FUNCTION,
            exprRange,
            operatorRange,
            valueRange,
        )

        this.extendTreeWithExpression(expr)
        this.resetData()
        this.resetFunctionData()
        this.resetBoolOperator()
        this.setState(State.EXPECT_BOOL_OP)
    }

    inStateFunctionArgs() {
        if (!this.char) return

        if (this.char.isGroupClose()) {
            this.storeTypedChar(CharType.VALUE)
            this.completeFunctionCall()
        } else if (this.char.value >= '0' && this.char.value <= '9') {
            this._functionDurationBuf += this.char.value
            this.setState(State.FUNCTION_DURATION)
            this.storeTypedChar(CharType.VALUE)
        } else if (this.char.isSingleQuote()) {
            this._functionCurrentArg = ''
            this.setState(State.FUNCTION_QUOTED_ARG)
            this.storeTypedChar(CharType.VALUE)
        } else if (this.char.isDelimiter()) {
            this.storeTypedChar(CharType.SPACE)
        } else {
            this.setErrorState('invalid function argument', ERR_INVALID_FUNCTION_ARGS)
        }
    }

    inStateFunctionDuration() {
        if (!this.char) return

        if (this.char.value >= '0' && this.char.value <= '9') {
            this._functionDurationBuf += this.char.value
            this.storeTypedChar(CharType.VALUE)
        } else if (['s', 'm', 'h', 'd', 'w'].includes(this.char.value)) {
            this._functionDurationBuf += this.char.value
            this.storeTypedChar(CharType.VALUE)
        } else if (this.char.isGroupClose()) {
            this.storeTypedChar(CharType.VALUE)
            this.completeFunctionCall()
        } else {
            this.setErrorState(
                `invalid duration unit '${this.char.value}' — expected s, m, h, d, or w`,
                ERR_INVALID_DURATION,
            )
        }
    }

    inStateFunctionQuotedArg() {
        if (!this.char) return

        if (this.char.isSingleQuote()) {
            const prevPos = this.char.pos - 1
            if (prevPos >= 0 && this.text[prevPos] === '\\') {
                this._functionCurrentArg += this.char.value
                this.storeTypedChar(CharType.VALUE)
            } else {
                this._functionArgs.push(this._functionCurrentArg)
                this.setState(State.FUNCTION_EXPECT_COMMA_OR_CLOSE)
                this.storeTypedChar(CharType.VALUE)
            }
        } else {
            this._functionCurrentArg += this.char.value
            this.storeTypedChar(CharType.VALUE)
        }
    }

    inStateFunctionExpectCommaOrClose() {
        if (!this.char) return

        if (this.char.isGroupClose()) {
            this.storeTypedChar(CharType.VALUE)
            this.completeFunctionCall()
        } else if (this.char.value === ',') {
            this.setState(State.FUNCTION_EXPECT_ARG)
            this.storeTypedChar(CharType.VALUE)
        } else if (this.char.isDelimiter()) {
            this.storeTypedChar(CharType.SPACE)
        } else {
            this.setErrorState("expected ',' or ')' in function call", ERR_INVALID_FUNCTION_ARGS)
        }
    }

    inStateFunctionExpectArg() {
        if (!this.char) return

        if (this.char.isSingleQuote()) {
            this._functionCurrentArg = ''
            this.setState(State.FUNCTION_QUOTED_ARG)
            this.storeTypedChar(CharType.VALUE)
        } else if (this.char.isDelimiter()) {
            this.storeTypedChar(CharType.SPACE)
        } else {
            this.setErrorState('expected quoted argument in function call', ERR_INVALID_FUNCTION_ARGS)
        }
    }

    inStateSingleQuotedValue() {
        if (!this.char) {
            return
        }

        if (this.char.isSingleQuotedValue()) {
            this.extendValue()
            if (this._isLikeOperator() && (this.char.value === '%' || this.char.value === '_')) {
                const prevPos = this.char.pos - 1
                if (prevPos < 0 || this.text[prevPos] !== '\\') {
                    this.storeTypedChar(CharType.WILDCARD)
                } else {
                    this.storeTypedChar(CharType.VALUE)
                }
            } else {
                this.storeTypedChar(CharType.VALUE)
            }
        } else if (this.char.isSingleQuote()) {
            this.storeTypedChar(CharType.VALUE)
            const prevPos = this.char.pos - 1
            if (prevPos >= 0 && this.text[prevPos] === '\\') {
                this.extendValue()
            } else {
                this._valueEnd = this.char.pos + 1
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
            if (this._isLikeOperator() && (this.char.value === '%' || this.char.value === '_')) {
                const prevPos = this.char.pos - 1
                if (prevPos < 0 || this.text[prevPos] !== '\\') {
                    this.storeTypedChar(CharType.WILDCARD)
                } else {
                    this.storeTypedChar(CharType.VALUE)
                }
            } else {
                this.storeTypedChar(CharType.VALUE)
            }
        } else if (this.char.isDoubleQuote()) {
            this.storeTypedChar(CharType.VALUE)
            const prevPos = this.char.pos - 1
            if (prevPos >= 0 && this.text[prevPos] === '\\') {
                this.extendValue()
            } else {
                this._valueEnd = this.char.pos + 1
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
            this._groupStartStack.push(this.char.pos)
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
                    } else {
                        this.setState(State.BOOL_OP_DELIMITER)
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
        } else if (this.char.value === 'l' && this.isNotIn) {
            this.keyValueOperator = 'l'
            this.isNotIn = false
            this.isNotLike = true
            this.setState(State.EXPECT_LIKE_KEYWORD)
            this.storeTypedChar(CharType.OPERATOR)
        } else if (this.char.value === 'i') {
            if (this.isNotIn) {
                this.keyValueOperator = 'i'
                this.setState(State.EXPECT_LIKE_KEYWORD)
                this.storeTypedChar(CharType.OPERATOR)
            } else {
                this.keyValueOperator = 'i'
                this.storeTypedChar(CharType.OPERATOR)
            }
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

    inStateExpectLikeKeyword() {
        if (!this.char) {
            return
        }

        // Path A: building "like" for "not like" (entered with keyValueOperator = 'l')
        if (this.keyValueOperator === 'l' && this.char.value === 'i') {
            this.keyValueOperator = 'li'
            this.storeTypedChar(CharType.OPERATOR)
        } else if (this.keyValueOperator === 'li' && this.char.value === 'k') {
            this.keyValueOperator = 'lik'
            this.storeTypedChar(CharType.OPERATOR)
        } else if (this.keyValueOperator === 'lik' && this.char.value === 'e') {
            this.keyValueOperator = LIKE_KEYWORD
            this.storeTypedChar(CharType.OPERATOR)
        } else if (this.keyValueOperator === LIKE_KEYWORD && this.isNotLike) {
            if (this.char.isDelimiter()) {
                this.storeTypedChar(CharType.SPACE)
                this.keyValueOperator = Operator.NOT_LIKE
                this.setState(State.EXPECT_VALUE)
            } else if (this.char.isSingleQuote()) {
                this.keyValueOperator = Operator.NOT_LIKE
                this.setValueIsString()
                this.setState(State.SINGLE_QUOTED_VALUE)
                this.storeTypedChar(CharType.VALUE)
            } else if (this.char.isDoubleQuote()) {
                this.keyValueOperator = Operator.NOT_LIKE
                this.setValueIsString()
                this.setState(State.DOUBLE_QUOTED_VALUE)
                this.storeTypedChar(CharType.VALUE)
            } else if (this.char.isValue()) {
                this.keyValueOperator = Operator.NOT_LIKE
                this.setState(State.VALUE)
                this.extendValue()
                this.storeTypedChar(CharType.VALUE)
            } else {
                this.setErrorState("expected value after 'not like'", 50)
            }
            // Path B: disambiguating "not in" vs "not ilike" (entered with keyValueOperator = 'i')
        } else if (this.keyValueOperator === 'i' && this.char.value === 'n') {
            // "not in" path
            this.keyValueOperator = ''
            this.isNotIn = true
            this.storeTypedChar(CharType.OPERATOR)
            this.setState(State.EXPECT_LIST_START)
        } else if (this.keyValueOperator === 'i' && this.char.value === 'l') {
            // "not ilike" path
            this.keyValueOperator = 'il'
            this.isNotIn = false
            this.isNotIlike = true
            this.storeTypedChar(CharType.OPERATOR)
        } else if (this.keyValueOperator === 'il' && this.char.value === 'i') {
            this.keyValueOperator = 'ili'
            this.storeTypedChar(CharType.OPERATOR)
        } else if (this.keyValueOperator === 'ili' && this.char.value === 'k') {
            this.keyValueOperator = 'ilik'
            this.storeTypedChar(CharType.OPERATOR)
        } else if (this.keyValueOperator === 'ilik' && this.char.value === 'e') {
            this.keyValueOperator = ILIKE_KEYWORD
            this.storeTypedChar(CharType.OPERATOR)
        } else if (this.keyValueOperator === ILIKE_KEYWORD && this.isNotIlike) {
            if (this.char.isDelimiter()) {
                this.storeTypedChar(CharType.SPACE)
                this.keyValueOperator = Operator.NOT_ILIKE
                this.setState(State.EXPECT_VALUE)
            } else if (this.char.isSingleQuote()) {
                this.keyValueOperator = Operator.NOT_ILIKE
                this.setValueIsString()
                this.setState(State.SINGLE_QUOTED_VALUE)
                this.storeTypedChar(CharType.VALUE)
            } else if (this.char.isDoubleQuote()) {
                this.keyValueOperator = Operator.NOT_ILIKE
                this.setValueIsString()
                this.setState(State.DOUBLE_QUOTED_VALUE)
                this.storeTypedChar(CharType.VALUE)
            } else if (this.char.isValue()) {
                this.keyValueOperator = Operator.NOT_ILIKE
                this.setState(State.VALUE)
                this.extendValue()
                this.storeTypedChar(CharType.VALUE)
            } else {
                this.setErrorState("expected value after 'not ilike'", 50)
            }
        } else {
            this.setErrorState("expected 'like' or 'ilike' keyword", 50)
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
            this.state === State.FUNCTION_ARGS ||
            this.state === State.FUNCTION_DURATION ||
            this.state === State.FUNCTION_QUOTED_ARG ||
            this.state === State.FUNCTION_EXPECT_COMMA_OR_CLOSE ||
            this.state === State.FUNCTION_EXPECT_ARG
        ) {
            this.setErrorState('unclosed function call', ERR_INVALID_FUNCTION_ARGS)
        } else if (
            this.state === State.INITIAL ||
            this.state === State.SINGLE_QUOTED_KEY ||
            this.state === State.DOUBLE_QUOTED_KEY ||
            this.state === State.EXPECT_OPERATOR ||
            this.state === State.EXPECT_VALUE ||
            this.state === State.EXPECT_NOT_TARGET ||
            this.state === State.EXPECT_IN_KEYWORD ||
            this.state === State.EXPECT_HAS_KEYWORD ||
            this.state === State.EXPECT_LIKE_KEYWORD ||
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
        } else if (this.state === State.DOUBLE_QUOTED_VALUE || this.state === State.SINGLE_QUOTED_VALUE) {
            this.setErrorState('unclosed string', 28)
            return
        } else if (this.state === State.VALUE) {
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
                case State.EXPECT_LIKE_KEYWORD:
                    this.inStateExpectLikeKeyword()
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
                case State.FUNCTION_ARGS:
                    this.inStateFunctionArgs()
                    break
                case State.FUNCTION_DURATION:
                    this.inStateFunctionDuration()
                    break
                case State.FUNCTION_QUOTED_ARG:
                    this.inStateFunctionQuotedArg()
                    break
                case State.FUNCTION_EXPECT_COMMA_OR_CLOSE:
                    this.inStateFunctionExpectCommaOrClose()
                    break
                case State.FUNCTION_EXPECT_ARG:
                    this.inStateFunctionExpectArg()
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
                throw new ParserError(this.errorText, this.errno, this._errorRange)
            } else {
                return
            }
        }

        if (!ignoreLastChar) {
            this.inStateLastChar()
        }

        if (this.state === State.ERROR) {
            if (raiseError) {
                throw new ParserError(this.errorText, this.errno, this._errorRange)
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
