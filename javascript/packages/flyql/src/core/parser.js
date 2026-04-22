import { Char } from './char.js'
import { Expression, FunctionCall, Duration, Parameter } from './expression.js'
import { Node } from './tree.js'
import { ParserError, KeyParseError } from './exceptions.js'
import { parseKey, Key } from './key.js'
import { Range } from './range.js'
import { convertUnquotedValue } from './utils.js'
import { LiteralKind } from '../literal/literal_kind.js'
import {
    State,
    CharType,
    PIPE,
    VALID_KEY_VALUE_OPERATORS,
    VALID_BOOL_OPERATORS,
    VALID_BOOL_OPERATORS_CHARS,
    Operator,
    NOT_KEYWORD,
    HAS_KEYWORD,
    LIKE_KEYWORD,
    ILIKE_KEYWORD,
    KNOWN_FUNCTIONS,
    DURATION_UNIT_MAGNITUDE,
    DOLLAR,
} from './constants.js'
import {
    ERR_EMPTY_INPUT,
    ERR_EMPTY_PARAMETER_NAME,
    ERR_EXPECTED_COMMA_OR_LIST_END,
    ERR_EXPECTED_DELIM_AFTER_BOOL_OP,
    ERR_EXPECTED_KEY_OR_PAREN_AFTER_NOT,
    ERR_EXPECTED_KEYWORD_AFTER_NOT,
    ERR_EXPECTED_LIST_START,
    ERR_EXPECTED_LIST_START_AFTER_IN,
    ERR_EXPECTED_NOT_OR_IN_KEYWORD,
    ERR_EXPECTED_OPERATOR_OR_BOOL_OP,
    ERR_EXPECTED_VALUE,
    ERR_EXPECTED_VALUE_AFTER_KEYWORD,
    ERR_EXPECTED_VALUE_IN_LIST,
    ERR_FUNCTION_NOT_ALLOWED_WITH_OPERATOR,
    ERR_INVALID_CHAR_IN_BOOL_DELIM,
    ERR_INVALID_CHAR_IN_EXPECT_BOOL,
    ERR_INVALID_CHAR_IN_KEY,
    ERR_INVALID_CHAR_IN_KEY_VALUE_OPERATOR,
    ERR_INVALID_CHAR_IN_PARAMETER_NAME,
    ERR_INVALID_CHAR_IN_VALUE,
    ERR_INVALID_CHAR_INITIAL,
    ERR_INVALID_DURATION,
    ERR_INVALID_FUNCTION_ARGS,
    ERR_INVALID_PARAMETER_NAME,
    ERR_KEY_PARSE_FAILED,
    ERR_MAX_DEPTH_EXCEEDED,
    ERR_NULL_NOT_ALLOWED_WITH_OPERATOR,
    ERR_PARAMETER_ZERO_INDEX,
    ERR_UNCLOSED_STRING,
    ERR_UNEXPECTED_CHAR_IN_LIST_VALUE,
    ERR_UNEXPECTED_EOF,
    ERR_UNEXPECTED_EOF_IN_KEY,
    ERR_UNKNOWN_FUNCTION,
    ERR_UNKNOWN_OPERATOR,
    ERR_UNMATCHED_PAREN_AT_EOF,
    ERR_UNMATCHED_PAREN_IN_BOOL_DELIM,
    ERR_UNMATCHED_PAREN_IN_EXPECT_BOOL,
    ERR_UNMATCHED_PAREN_IN_EXPR,
} from '../errors_generated.js'

const _BOOL_OP_PRECEDENCE_TABLE = Object.freeze({ and: 2, or: 1 })

function BOOL_OP_PRECEDENCE(op) {
    return _BOOL_OP_PRECEDENCE_TABLE[op] ?? 0
}

export class Parser {
    // eslint-disable-next-line no-unused-vars
    constructor(capabilities = {}) {
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
        this._functionParameterArgs = []
        this._functionParamBuf = ''
        // Maximum nesting depth for boolean-grouping parens. Values `<= 0`
        // disable the limit. Read on every group-open, so mid-parse mutation
        // takes effect on the next `(`.
        this.maxDepth = 128
        this._depth = 0
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
            explicitType = LiteralKind.STRING
        } else if (this.inListCurrentValue === 'null') {
            value = null
            explicitType = LiteralKind.NULL
        } else if (this.inListCurrentValue === 'true' || this.inListCurrentValue === 'false') {
            value = this.inListCurrentValue === 'true'
            explicitType = LiteralKind.BOOLEAN
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
                this.setErrorState(e.message, ERR_KEY_PARSE_FAILED, e.range)
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
                this.setErrorState(
                    `null value cannot be used with operator '${this.keyValueOperator}'`,
                    ERR_NULL_NOT_ALLOWED_WITH_OPERATOR,
                )
            }
            return new Expression(
                key,
                this.keyValueOperator,
                null,
                null,
                null,
                null,
                null,
                LiteralKind.NULL,
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
                LiteralKind.BOOLEAN,
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

    // Fold `atom` into `current` under operator `op` respecting
    // AND > OR precedence. One-level descent is sufficient because
    // flyql has exactly two binary precedence levels.
    _foldWithPrecedence(current, op, atom) {
        if (BOOL_OP_PRECEDENCE(op) <= BOOL_OP_PRECEDENCE(current.boolOperator)) {
            const bopR = this._popBoolOpRange()
            const range = current.range && atom.range ? new Range(current.range.start, atom.range.end) : null
            return this.newNode(op, null, current, atom, false, range, bopR)
        }
        // Incoming strictly higher precedence — descend one level
        const bopR = this._popBoolOpRange()
        const descRange =
            current.right && current.right.range && atom.range
                ? new Range(current.right.range.start, atom.range.end)
                : null
        const descended = this.newNode(op, null, current.right, atom, false, descRange, bopR)
        current.right = descended
        if (current.range && atom.range) {
            current.range = new Range(current.range.start, atom.range.end)
        }
        return current
    }

    _attachExpr(expression) {
        const negated = this.consumePendingNegation()
        const exprRange = expression ? expression.range : null
        if (this.currentNode && this.currentNode.left === null) {
            if (this.currentNode.right !== null) {
                // Grouped-prefix wrapper: right holds a merged group
                // sub-tree from extendTreeFromStack's if-branch. Preserve
                // source order by promoting the group to left and placing
                // the new leaf in right.
                const newLeaf = this.newNode('', expression, null, null, negated, exprRange)
                this.currentNode.setLeft(this.currentNode.right)
                this.currentNode.setRight(newLeaf)
                this.currentNode.setBoolOperator(this.boolOperator)
                const bopR = this._popBoolOpRange()
                if (bopR !== null) {
                    this.currentNode.boolOperatorRange = bopR
                }
                if (exprRange && this.currentNode.range) {
                    this.currentNode.range = new Range(
                        this.currentNode.range.start,
                        Math.max(this.currentNode.range.end, exprRange.end),
                    )
                }
            } else {
                const node = this.newNode('', expression, null, null, negated, exprRange)
                this.currentNode.setLeft(node)
                this.currentNode.setBoolOperator(this.boolOperator)
                if (exprRange && this.currentNode.range) {
                    this.currentNode.range = new Range(
                        Math.min(this.currentNode.range.start, exprRange.start),
                        Math.max(this.currentNode.range.end, exprRange.end),
                    )
                }
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
            this.setCurrentNode(this._foldWithPrecedence(this.currentNode, this.boolOperator, right))
        }
    }

    extendTreeWithExpression(expression) {
        this._attachExpr(expression)
    }

    // Apply `negated` to `node` mirroring the Python/Go pattern: if the
    // node is a trivial single-leaf wrapper, push the flag down onto the
    // leaf; otherwise apply it directly to the node. Guarded on null to
    // match the Python/Go signatures.
    applyNegationToTree(node, negated) {
        if (!negated || !node) return
        if (node.expression === null && node.left !== null && node.left.expression !== null && node.right === null) {
            node.left.setNegated(true)
        } else {
            node.setNegated(true)
        }
    }

    // Return the inner leaf if `node` is a trivial single-leaf wrapper (a
    // non-negated binary-op node with a leaf in `left` and nothing in
    // `right`). Used at group-merge sites so a sub-tree produced by a
    // single-leaf group like `(a=1)` lands as a leaf in its parent, not
    // as a malformed `AND{left=leaf, right=null}` child node.
    _unwrapTrivialLeafWrapper(node) {
        if (
            node !== null &&
            !node.negated &&
            node.expression === null &&
            node.left !== null &&
            node.left.expression !== null &&
            node.left.left === null &&
            node.left.right === null &&
            node.right === null
        ) {
            return node.left
        }
        return node
    }

    extendTree() {
        this._attachExpr(this.newExpression())
    }

    extendTreeFromStack(boolOperator) {
        if (!this.nodesStack.length) return
        const node = this.nodesStack.pop()
        let groupStart = null
        if (this._groupStartStack.length > 0) {
            groupStart = this._groupStartStack.pop()
            this._depth -= 1
        }
        // Pop the sub-tree's negation BEFORE the merge and apply it
        // directly to the sub-tree (currentNode at entry). This mirrors
        // the Python/Go `_apply_negation_to_tree` call path and fixes
        // the JS NOT-scope bug where negation was formerly applied to
        // the merged parent tree via external post-call.
        const negated = this.negationStack.length > 0 ? this.negationStack.pop() : false
        this.applyNegationToTree(this.currentNode, negated)
        // Unwrap a trivial single-leaf wrapper so the merged sub-tree
        // lands as a leaf, not a malformed binary-op node.
        this.currentNode = this._unwrapTrivialLeafWrapper(this.currentNode)
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
            // Edge case: `node` is a grouped-prefix wrapper from a prior
            // if-branch merge — shape `{left=null, right=<sub-tree>}`.
            // Discard the wrapper entirely and build the new root
            // directly, preserving the OUTER group's `(` position from
            // `node.range.start` rather than using `groupStart` (which
            // tracks only the INNER group being closed now).
            if (node.left === null && node.right !== null) {
                const bopR = boolOperator ? this._popBoolOpRange() : null
                const rightEnd = this.char ? this.char.pos + 1 : this.currentNode.range.end
                const leftStart = node.range ? node.range.start : 0
                const newNode = this.newNode(
                    boolOperator,
                    null,
                    node.right,
                    this.currentNode,
                    false,
                    new Range(leftStart, rightEnd),
                    bopR,
                )
                this.setCurrentNode(newNode)
            } else {
                const newNode = this._foldWithPrecedence(node, boolOperator, this.currentNode)
                if (this.char && newNode.range) {
                    newNode.range = new Range(newNode.range.start, this.char.pos + 1)
                }
                this.setCurrentNode(newNode)
            }
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
            this.negationStack.push(false)
            this._groupStartStack.push(startPos)
            this._depth += 1
            if (this.maxDepth > 0 && this._depth > this.maxDepth) {
                this.setErrorState(`maximum nesting depth exceeded (${this.maxDepth})`, ERR_MAX_DEPTH_EXCEEDED)
                return
            }
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
            this.setErrorState('invalid character', ERR_INVALID_CHAR_INITIAL)
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
        } else if (this._transformerParenDepth > 0 && this.char.value === DOLLAR) {
            this.extendKey()
            this.storeTypedChar(CharType.PARAMETER)
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
                this.setErrorState('unmatched parenthesis', ERR_UNMATCHED_PAREN_IN_EXPR)
                return
            }
            this.extendTreeWithExpression(this.newTruthyExpression())
            this.resetData()
            if (this.boolOpStack.length) {
                this.boolOperator = this.boolOpStack.pop()
            }
            this.extendTreeFromStack(this.boolOperator)
            this.resetBoolOperator()
            this.setState(State.EXPECT_BOOL_OP)
            this.storeTypedChar(CharType.OPERATOR)
        } else {
            this.setErrorState('invalid character', ERR_INVALID_CHAR_IN_KEY)
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
            throw new Error('unreachable: State.EXPECT_OPERATOR is never entered by the state machine')
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
                this.setErrorState('unmatched parenthesis', ERR_UNMATCHED_PAREN_IN_EXPR)
                return
            }
            this.extendTreeWithExpression(this.newTruthyExpression())
            this.resetData()
            if (this.boolOpStack.length) {
                this.boolOperator = this.boolOpStack.pop()
            }
            this.extendTreeFromStack(this.boolOperator)
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
            this.setErrorState('expected operator or boolean operator', ERR_EXPECTED_OPERATOR_OR_BOOL_OP)
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
            this._depth += 1
            if (this.maxDepth > 0 && this._depth > this.maxDepth) {
                this.setErrorState(`maximum nesting depth exceeded (${this.maxDepth})`, ERR_MAX_DEPTH_EXCEEDED)
                return
            }
            this.setState(State.INITIAL)
            this.storeTypedChar(CharType.OPERATOR)
        } else {
            this.setErrorState('expected key or group after not', ERR_EXPECTED_KEY_OR_PAREN_AFTER_NOT)
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
            } else if (this.char.value === DOLLAR) {
                this.keyValueOperator = Operator.HAS
                this.isNotHas = false
                this._valueStart = this.char.pos
                this.setState(State.PARAMETER)
                this.storeTypedChar(CharType.PARAMETER)
            } else if (this.char.isValue()) {
                this.keyValueOperator = Operator.HAS
                this.isNotHas = false
                this.setState(State.VALUE)
                this.extendValue()
                this.storeTypedChar(CharType.VALUE)
            } else {
                this.setErrorState("expected value after 'has'", ERR_EXPECTED_VALUE_AFTER_KEYWORD)
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
            } else if (this.char.value === DOLLAR) {
                this.keyValueOperator = Operator.ILIKE
                this._valueStart = this.char.pos
                this.setState(State.PARAMETER)
                this.storeTypedChar(CharType.PARAMETER)
            } else if (this.char.isValue()) {
                this.keyValueOperator = Operator.ILIKE
                this.setState(State.VALUE)
                this.extendValue()
                this.storeTypedChar(CharType.VALUE)
            } else {
                this.setErrorState("expected value after 'ilike'", ERR_EXPECTED_VALUE_AFTER_KEYWORD)
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
            } else if (this.char.value === DOLLAR) {
                this.keyValueOperator = Operator.LIKE
                this._valueStart = this.char.pos
                this.setState(State.PARAMETER)
                this.storeTypedChar(CharType.PARAMETER)
            } else if (this.char.isValue()) {
                this.keyValueOperator = Operator.LIKE
                this.setState(State.VALUE)
                this.extendValue()
                this.storeTypedChar(CharType.VALUE)
            } else {
                this.setErrorState("expected value after 'like'", ERR_EXPECTED_VALUE_AFTER_KEYWORD)
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
                this.setErrorState("expected '[' after 'in'", ERR_EXPECTED_LIST_START_AFTER_IN)
            }
            return
        }

        if (this.char.isDelimiter()) {
            this.storeTypedChar(CharType.SPACE)
            if (!VALID_KEY_VALUE_OPERATORS.includes(this.keyValueOperator)) {
                this.setErrorState(`unknown operator: ${this.keyValueOperator}`, ERR_UNKNOWN_OPERATOR)
            } else {
                this.setState(State.EXPECT_VALUE)
            }
        } else if (this.char.isOp()) {
            this.extendKeyValueOperator()
            this.storeTypedChar(CharType.OPERATOR)
        } else if (this.char.value === DOLLAR) {
            if (!VALID_KEY_VALUE_OPERATORS.includes(this.keyValueOperator)) {
                this.setErrorState(`unknown operator: ${this.keyValueOperator}`, ERR_UNKNOWN_OPERATOR)
            } else {
                this._valueStart = this.char.pos
                this.setState(State.PARAMETER)
                this.storeTypedChar(CharType.PARAMETER)
            }
        } else if (this.char.isValue()) {
            if (!VALID_KEY_VALUE_OPERATORS.includes(this.keyValueOperator)) {
                this.setErrorState(`unknown operator: ${this.keyValueOperator}`, ERR_UNKNOWN_OPERATOR)
            } else {
                this.setState(State.VALUE)
                this.extendValue()
                this.storeTypedChar(CharType.VALUE)
            }
        } else if (this.char.isSingleQuote()) {
            if (!VALID_KEY_VALUE_OPERATORS.includes(this.keyValueOperator)) {
                this.setErrorState(`unknown operator: ${this.keyValueOperator}`, ERR_UNKNOWN_OPERATOR)
            } else {
                this.setValueIsString()
                this.setState(State.SINGLE_QUOTED_VALUE)
                this.storeTypedChar(CharType.VALUE)
            }
        } else if (this.char.isDoubleQuote()) {
            if (!VALID_KEY_VALUE_OPERATORS.includes(this.keyValueOperator)) {
                this.setErrorState(`unknown operator: ${this.keyValueOperator}`, ERR_UNKNOWN_OPERATOR)
            } else {
                this.setValueIsString()
                this.setState(State.DOUBLE_QUOTED_VALUE)
                this.storeTypedChar(CharType.VALUE)
            }
        } else {
            this.setErrorState('invalid character', ERR_INVALID_CHAR_IN_KEY_VALUE_OPERATOR)
        }
    }

    inStateExpectValue() {
        if (!this.char) {
            return
        }

        if (this.char.isDelimiter()) {
            this.storeTypedChar(CharType.SPACE)
            return
        } else if (this.char.value === DOLLAR) {
            this._valueStart = this.char.pos
            this.setState(State.PARAMETER)
            this.storeTypedChar(CharType.PARAMETER)
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
            this.setErrorState('expected value', ERR_EXPECTED_VALUE)
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
                const nameLen = this.value.length
                const start = Math.max(0, this.typedChars.length - nameLen)
                for (let i = start; i < this.typedChars.length; i++) {
                    if (this.typedChars[i][1] === CharType.VALUE) {
                        this.typedChars[i] = [this.typedChars[i][0], CharType.FUNCTION]
                    }
                }
                this._functionName = this.value
                this.value = ''
                this.setState(State.FUNCTION_ARGS)
                this.storeTypedChar(CharType.OPERATOR)
            } else {
                this.setErrorState(`unknown function '${this.value}'`, ERR_UNKNOWN_FUNCTION)
            }
        } else if (this.char.isGroupClose()) {
            if (!this.nodesStack.length) {
                this.setErrorState('unmatched parenthesis', ERR_UNMATCHED_PAREN_IN_EXPR)
                return
            } else {
                this.extendTree()
                this.resetData()
                if (this.boolOpStack.length) {
                    this.boolOperator = this.boolOpStack.pop()
                }
                this.extendTreeFromStack(this.boolOperator)
                this.resetBoolOperator()
                this.setState(State.EXPECT_BOOL_OP)
                this.storeTypedChar(CharType.OPERATOR)
            }
        } else {
            this.setErrorState('invalid character', ERR_INVALID_CHAR_IN_VALUE)
        }
    }

    resetFunctionData() {
        this._functionName = ''
        this._functionDurationBuf = ''
        this._functionArgs = []
        this._functionDurations = []
        this._functionCurrentArg = ''
        this._functionParameterArgs = []
        this._functionParamBuf = ''
    }

    parseDurationBuf() {
        const buf = this._functionDurationBuf
        if (!buf) return false
        let numBuf = ''
        // Enforce strictly descending, unique-unit duration literals
        // (Prometheus-style). prevMagnitude starts at +Infinity so the
        // first unit is always accepted; each subsequent unit must have
        // strictly lower magnitude.
        let prevMagnitude = Infinity
        for (let i = 0; i < buf.length; i++) {
            const c = buf[i]
            if (c >= '0' && c <= '9') {
                numBuf += c
            } else {
                const magnitude = DURATION_UNIT_MAGNITUDE[c]
                if (magnitude === undefined) {
                    this.setErrorState(`invalid duration unit '${c}' — expected s, m, h, d, or w`, ERR_INVALID_DURATION)
                    return false
                }
                if (!numBuf) {
                    this.setErrorState('invalid duration format', ERR_INVALID_DURATION)
                    return false
                }
                if (magnitude >= prevMagnitude) {
                    this.setErrorState(
                        `invalid duration '${buf}' — units must appear in strictly descending order and only once (e.g. '1w2d3h4m5s')`,
                        ERR_INVALID_DURATION,
                    )
                    return false
                }
                prevMagnitude = magnitude
                this._functionDurations.push(new Duration(parseInt(numBuf, ERR_UNKNOWN_OPERATOR), c))
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

        if (this._functionParameterArgs.length > 0) {
            // Currently unreachable: the state machine can't produce both
            // parameter args and a non-empty duration buf in the same call
            // (FUNCTION_DURATION has no `,` transition). Kept defensive: if
            // parseDurationBuf ever sets the error state, honor it rather
            // than silently overwriting with stateExpectBoolOp below.
            if (this._functionDurationBuf && !this.parseDurationBuf()) return
            fc = new FunctionCall(name, [...this._functionDurations])
            fc.parameterArgs = [...this._functionParameterArgs]
            if (this._functionArgs.length > 0) {
                if (name === 'startOf') {
                    fc.unit = this._functionArgs[0]
                    fc.timezone = this._functionArgs.length > 1 ? this._functionArgs[1] : ''
                } else if (name === 'today') {
                    fc.timezone = this._functionArgs[0]
                }
            }
        } else if (name === 'ago') {
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
            LiteralKind.FUNCTION,
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
            this.storeTypedChar(CharType.OPERATOR)
            this.completeFunctionCall()
        } else if (this.char.value === DOLLAR) {
            this._functionParamBuf = ''
            this.setState(State.FUNCTION_PARAMETER)
            this.storeTypedChar(CharType.PARAMETER)
        } else if (this.char.value >= '0' && this.char.value <= '9') {
            this._functionDurationBuf += this.char.value
            this.setState(State.FUNCTION_DURATION)
            this.storeTypedChar(CharType.NUMBER)
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
            this.storeTypedChar(CharType.NUMBER)
        } else if (['s', 'm', 'h', 'd', 'w'].includes(this.char.value)) {
            this._functionDurationBuf += this.char.value
            this.storeTypedChar(CharType.NUMBER)
        } else if (this.char.isGroupClose()) {
            this.storeTypedChar(CharType.OPERATOR)
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
            this.storeTypedChar(CharType.OPERATOR)
            this.completeFunctionCall()
        } else if (this.char.value === ',') {
            this.setState(State.FUNCTION_EXPECT_ARG)
            this.storeTypedChar(CharType.OPERATOR)
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
        } else if (this.char.value === DOLLAR) {
            this._functionParamBuf = ''
            this.setState(State.FUNCTION_PARAMETER)
            this.storeTypedChar(CharType.PARAMETER)
        } else if (this.char.isDelimiter()) {
            this.storeTypedChar(CharType.SPACE)
        } else {
            this.setErrorState('expected quoted argument in function call', ERR_INVALID_FUNCTION_ARGS)
        }
    }

    _finalizeFunctionParameter() {
        const name = this._functionParamBuf
        if (!name) {
            this.setErrorState('empty parameter name', ERR_EMPTY_PARAMETER_NAME)
            return false
        }
        if (name[0] >= '0' && name[0] <= '9') {
            if (!/^\d+$/.test(name)) {
                this.setErrorState('invalid parameter name', ERR_INVALID_PARAMETER_NAME)
                return false
            }
            if (parseInt(name, ERR_UNKNOWN_OPERATOR) === 0) {
                this.setErrorState('positional parameters are 1-indexed', ERR_PARAMETER_ZERO_INDEX)
                return false
            }
        }
        const param = new Parameter(name, name[0] >= '0' && name[0] <= '9')
        this._functionParameterArgs.push(param)
        this._functionParamBuf = ''
        return true
    }

    inStateFunctionParameter() {
        if (!this.char) return

        const c = this.char.value
        if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_') {
            this._functionParamBuf += c
            this.storeTypedChar(CharType.PARAMETER)
        } else if (this.char.isGroupClose()) {
            if (!this._finalizeFunctionParameter()) {
                return
            }
            this.storeTypedChar(CharType.OPERATOR)
            this.completeFunctionCall()
        } else if (c === ',') {
            if (!this._finalizeFunctionParameter()) {
                return
            }
            this.setState(State.FUNCTION_EXPECT_ARG)
            this.storeTypedChar(CharType.OPERATOR)
        } else if (this.char.isDelimiter()) {
            if (!this._finalizeFunctionParameter()) {
                return
            }
            this.setState(State.FUNCTION_EXPECT_COMMA_OR_CLOSE)
            this.storeTypedChar(CharType.SPACE)
        } else {
            this.setErrorState('invalid character in parameter name', ERR_INVALID_CHAR_IN_PARAMETER_NAME)
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
            throw new Error('unreachable: isXQuotedValue() is true for every non-quote char')
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
            throw new Error('unreachable: isXQuotedValue() is true for every non-quote char')
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
            throw new Error('unreachable: isSingleQuotedValue() is true for every non-quote char')
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
            throw new Error('unreachable: isDoubleQuotedValue() is true for every non-quote char')
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
            this._depth += 1
            if (this.maxDepth > 0 && this._depth > this.maxDepth) {
                this.setErrorState(`maximum nesting depth exceeded (${this.maxDepth})`, ERR_MAX_DEPTH_EXCEEDED)
                return
            }
            this.setState(State.INITIAL)
            this.storeTypedChar(CharType.OPERATOR)
        } else if (this.char.isGroupClose()) {
            if (!this.nodesStack.length) {
                this.setErrorState('unmatched parenthesis', ERR_UNMATCHED_PAREN_IN_BOOL_DELIM)
                return
            } else {
                this.resetData()
                if (this.boolOpStack.length) {
                    this.extendTreeFromStack(this.boolOpStack.pop())
                }
                this.setState(State.EXPECT_BOOL_OP)
                this.storeTypedChar(CharType.OPERATOR)
            }
        } else {
            this.setErrorState('invalid character', ERR_INVALID_CHAR_IN_BOOL_DELIM)
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
                this.setErrorState('unmatched parenthesis', ERR_UNMATCHED_PAREN_IN_EXPECT_BOOL)
                return
            } else {
                this.resetData()
                this.resetBoolOperator()
                if (this.boolOpStack.length) {
                    this.extendTreeFromStack(this.boolOpStack.pop())
                }
                this.setState(State.EXPECT_BOOL_OP)
                this.storeTypedChar(CharType.OPERATOR)
            }
        } else {
            this.extendBoolOperator()
            this.storeTypedChar(CharType.OPERATOR)
            if (this.boolOperator.length > 3 || !VALID_BOOL_OPERATORS_CHARS.includes(this.char.value)) {
                this.setErrorState('invalid character', ERR_INVALID_CHAR_IN_EXPECT_BOOL)
            } else {
                if (VALID_BOOL_OPERATORS.includes(this.boolOperator)) {
                    const nextPos = this.char.pos + 1
                    if (this.text.length > nextPos) {
                        const nextChar = new Char(this.text[nextPos], nextPos, 0, 0)
                        if (!nextChar.isDelimiter()) {
                            this.setErrorState(
                                'expected delimiter after bool operator',
                                ERR_EXPECTED_DELIM_AFTER_BOOL_OP,
                            )
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
                this.setErrorState("expected 'not' or 'in' keyword", ERR_EXPECTED_NOT_OR_IN_KEYWORD)
            }
        } else if (this.keyValueOperator === 'no') {
            if (this.char.value === 't') {
                this.keyValueOperator += 't'
                this.storeTypedChar(CharType.OPERATOR)
            } else {
                this.setErrorState("expected 'not' keyword", ERR_EXPECTED_NOT_OR_IN_KEYWORD)
            }
        } else if (this.keyValueOperator === 'not') {
            if (this.char.isDelimiter()) {
                this.storeTypedChar(CharType.SPACE)
                this.keyValueOperator = ''
                this.isNotIn = true
                this.setState(State.EXPECT_LIST_START)
            } else {
                this.setErrorState("expected space after 'not'", ERR_EXPECTED_NOT_OR_IN_KEYWORD)
            }
        } else {
            throw new Error(`unreachable: expect_in_keyword with keyValueOperator=${this.keyValueOperator}`)
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
            this.setErrorState("expected '['", ERR_EXPECTED_LIST_START)
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
            } else if (this.char.value === DOLLAR) {
                this.keyValueOperator = Operator.NOT_HAS
                this._valueStart = this.char.pos
                this.setState(State.PARAMETER)
                this.storeTypedChar(CharType.PARAMETER)
            } else if (this.char.isValue()) {
                this.keyValueOperator = Operator.NOT_HAS
                this.setState(State.VALUE)
                this.extendValue()
                this.storeTypedChar(CharType.VALUE)
            } else {
                this.setErrorState("expected value after 'not has'", ERR_EXPECTED_VALUE_AFTER_KEYWORD)
            }
        } else {
            this.setErrorState("expected 'has' keyword", ERR_EXPECTED_KEYWORD_AFTER_NOT)
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
            } else if (this.char.value === DOLLAR) {
                this.keyValueOperator = Operator.NOT_LIKE
                this._valueStart = this.char.pos
                this.setState(State.PARAMETER)
                this.storeTypedChar(CharType.PARAMETER)
            } else if (this.char.isValue()) {
                this.keyValueOperator = Operator.NOT_LIKE
                this.setState(State.VALUE)
                this.extendValue()
                this.storeTypedChar(CharType.VALUE)
            } else {
                this.setErrorState("expected value after 'not like'", ERR_EXPECTED_VALUE_AFTER_KEYWORD)
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
            } else if (this.char.value === DOLLAR) {
                this.keyValueOperator = Operator.NOT_ILIKE
                this._valueStart = this.char.pos
                this.setState(State.PARAMETER)
                this.storeTypedChar(CharType.PARAMETER)
            } else if (this.char.isValue()) {
                this.keyValueOperator = Operator.NOT_ILIKE
                this.setState(State.VALUE)
                this.extendValue()
                this.storeTypedChar(CharType.VALUE)
            } else {
                this.setErrorState("expected value after 'not ilike'", ERR_EXPECTED_VALUE_AFTER_KEYWORD)
            }
        } else {
            this.setErrorState("expected 'like' or 'ilike' keyword", ERR_EXPECTED_KEYWORD_AFTER_NOT)
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
        } else if (this.char.value === DOLLAR) {
            this._inListValueStart = this.char.pos
            this.setState(State.IN_LIST_PARAMETER)
            this.storeTypedChar(CharType.PARAMETER)
        } else if (this.char.isValue()) {
            this.extendInListCurrentValue()
            this.storeTypedChar(CharType.VALUE)
            this.setState(State.IN_LIST_VALUE)
        } else {
            this.setErrorState('expected value in list', ERR_EXPECTED_VALUE_IN_LIST)
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
            this.setErrorState('unexpected character in list value', ERR_UNEXPECTED_CHAR_IN_LIST_VALUE)
        }
    }

    _finalizeInListParameter() {
        const name = this.inListCurrentValue
        if (!name) {
            this.setErrorState('empty parameter name', ERR_EMPTY_PARAMETER_NAME)
            return false
        }
        if (name[0] >= '0' && name[0] <= '9') {
            if (!/^\d+$/.test(name)) {
                this.setErrorState('invalid parameter name', ERR_INVALID_PARAMETER_NAME)
                return false
            }
            if (parseInt(name, ERR_UNKNOWN_OPERATOR) === 0) {
                this.setErrorState('positional parameters are 1-indexed', ERR_PARAMETER_ZERO_INDEX)
                return false
            }
        }
        const param = new Parameter(name, name[0] >= '0' && name[0] <= '9')
        this.inListValues.push(param)
        this.inListValuesTypes.push(LiteralKind.PARAMETER)
        if (this._inListValueStart >= 0) {
            this._inListValueRanges.push(new Range(this._inListValueStart, this._inListValueEnd))
        }
        this.inListCurrentValue = ''
        this.inListCurrentValueIsString = null
        this._inListValueStart = -1
        this._inListValueEnd = -1
        return true
    }

    inStateInListParameter() {
        if (!this.char) {
            return
        }

        const c = this.char.value
        if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_') {
            this.inListCurrentValue += c
            this._inListValueEnd = this.char.pos + 1
            this.storeTypedChar(CharType.PARAMETER)
        } else if (this.char.isDelimiter()) {
            if (!this._finalizeInListParameter()) {
                return
            }
            this.storeTypedChar(CharType.SPACE)
            this.setState(State.EXPECT_LIST_COMMA_OR_END)
        } else if (c === ',') {
            if (!this._finalizeInListParameter()) {
                return
            }
            this.storeTypedChar(CharType.OPERATOR)
            this.setState(State.EXPECT_LIST_VALUE)
        } else if (c === ']') {
            if (!this._finalizeInListParameter()) {
                return
            }
            this.storeTypedChar(CharType.OPERATOR)
            this.extendTreeWithExpression(this.newInExpression())
            this.resetData()
            this.resetBoolOperator()
            this.setState(State.EXPECT_BOOL_OP)
        } else {
            this.setErrorState('invalid character in parameter name', ERR_INVALID_CHAR_IN_PARAMETER_NAME)
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
            throw new Error('unreachable: isXQuotedValue() is true for every non-quote char')
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
            throw new Error('unreachable: isXQuotedValue() is true for every non-quote char')
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
            this.setErrorState("expected ',' or ']'", ERR_EXPECTED_COMMA_OR_LIST_END)
        }
    }

    _finalizeParameter() {
        const name = this.value
        if (!name) {
            this.setErrorState('empty parameter name', ERR_EMPTY_PARAMETER_NAME)
            return
        }
        if (name[0] >= '0' && name[0] <= '9') {
            if (!/^\d+$/.test(name)) {
                this.setErrorState('invalid parameter name', ERR_INVALID_PARAMETER_NAME)
                return
            }
            if (parseInt(name, ERR_UNKNOWN_OPERATOR) === 0) {
                this.setErrorState('positional parameters are 1-indexed', ERR_PARAMETER_ZERO_INDEX)
                return
            }
        }
        const param = new Parameter(name, name[0] >= '0' && name[0] <= '9')
        const exprEnd = this._valueEnd >= 0 ? this._valueEnd : this.char ? this.char.pos : 0
        const { exprRange, keyRange, operatorRange } = this._buildExprRanges(exprEnd)
        const valueRange = this._valueStart >= 0 ? new Range(this._valueStart, this._valueEnd) : null
        const key = this._parseKeyWithRange(keyRange)
        const expression = new Expression(
            key,
            this.keyValueOperator,
            param,
            null,
            null,
            null,
            null,
            LiteralKind.PARAMETER,
            exprRange,
            operatorRange,
            valueRange,
        )
        this.extendTreeWithExpression(expression)
        this.resetData()
    }

    inStateParameter() {
        if (!this.char) return

        const c = this.char.value
        if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_') {
            this.extendValue()
            this.storeTypedChar(CharType.PARAMETER)
        } else if (this.char.isDelimiter()) {
            this._finalizeParameter()
            if (this.state !== State.ERROR) {
                this.resetBoolOperator()
                this.setState(State.EXPECT_BOOL_OP)
                this.storeTypedChar(CharType.SPACE)
            }
        } else if (this.char.isGroupClose()) {
            if (!this.nodesStack.length) {
                this.setErrorState('unmatched parenthesis', ERR_UNMATCHED_PAREN_IN_EXPR)
                return
            }
            this._finalizeParameter()
            if (this.state !== State.ERROR) {
                if (this.boolOpStack.length) {
                    this.boolOperator = this.boolOpStack.pop()
                }
                this.extendTreeFromStack(this.boolOperator)
                this.resetBoolOperator()
                this.setState(State.EXPECT_BOOL_OP)
                this.storeTypedChar(CharType.OPERATOR)
            }
        } else {
            this.setErrorState('invalid character in parameter name', ERR_INVALID_CHAR_IN_PARAMETER_NAME)
        }
    }

    inStateLastChar() {
        if (this.state === State.INITIAL && !this.nodesStack.length) {
            this.setErrorState('empty input', ERR_EMPTY_INPUT)
        } else if (
            this.state === State.FUNCTION_ARGS ||
            this.state === State.FUNCTION_DURATION ||
            this.state === State.FUNCTION_QUOTED_ARG ||
            this.state === State.FUNCTION_EXPECT_COMMA_OR_CLOSE ||
            this.state === State.FUNCTION_EXPECT_ARG ||
            this.state === State.FUNCTION_PARAMETER
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
            this.state === State.EXPECT_LIST_COMMA_OR_END ||
            this.state === State.IN_LIST_PARAMETER
        ) {
            this.setErrorState('unexpected EOF', ERR_UNEXPECTED_EOF)
        } else if (this.state === State.KEY) {
            if (this.key === NOT_KEYWORD) {
                this.setErrorState('unexpected EOF after not', ERR_UNEXPECTED_EOF)
            } else {
                this.extendTreeWithExpression(this.newTruthyExpression())
                this.resetBoolOperator()
            }
        } else if (this.state === State.KEY_OR_BOOL_OP) {
            this.extendTreeWithExpression(this.newTruthyExpression())
            this.resetBoolOperator()
        } else if (this.state === State.DOUBLE_QUOTED_VALUE || this.state === State.SINGLE_QUOTED_VALUE) {
            this.setErrorState('unclosed string', ERR_UNCLOSED_STRING)
            return
        } else if (this.state === State.VALUE) {
            this.extendTree()
            this.resetBoolOperator()
        } else if (this.state === State.PARAMETER) {
            this._finalizeParameter()
            if (this.state !== State.ERROR) {
                this.resetBoolOperator()
            }
        } else if (this.state === State.BOOL_OP_DELIMITER) {
            this.setErrorState('unexpected EOF', ERR_UNEXPECTED_EOF_IN_KEY)
            return
        }

        if (this.state !== State.ERROR && this.nodesStack.length) {
            this.setErrorState('unmatched parenthesis', ERR_UNMATCHED_PAREN_AT_EOF)
        }
    }

    // eslint-disable-next-line no-unused-vars
    parse(text, raiseError = true, ignoreLastChar = false, capabilities = {}) {
        this._depth = 0
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
                case State.FUNCTION_PARAMETER:
                    this.inStateFunctionParameter()
                    break
                case State.IN_LIST_PARAMETER:
                    this.inStateInListParameter()
                    break
                case State.PARAMETER:
                    this.inStateParameter()
                    break
                default:
                    throw new Error(`unreachable: unexpected parser state ${this.state}`)
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

export class ParseResult {
    constructor(root) {
        this.root = root
    }
}

// eslint-disable-next-line no-unused-vars
export function parse(text, raiseError = true, ignoreLastChar = false, capabilities = {}) {
    const parser = new Parser()
    parser.parse(text, raiseError, ignoreLastChar)
    return new ParseResult(parser.root)
}
