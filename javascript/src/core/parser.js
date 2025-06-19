import { Char } from './char.js'
import { Expression } from './expression.js'
import { Node } from './tree.js'
import { ParserError } from './exceptions.js'
import {
    State,
    CharType,
    VALID_KEY_VALUE_OPERATORS,
    VALID_BOOL_OPERATORS,
    VALID_BOOL_OPERATORS_CHARS,
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

    newNode(boolOperator, expression, left, right) {
        return new Node(boolOperator, expression, left, right)
    }

    newExpression() {
        return new Expression(this.key, this.keyValueOperator, this.value, this.valueIsString)
    }

    extendTree() {
        if (this.currentNode && this.currentNode.left === null) {
            const node = this.newNode('', this.newExpression(), null, null)
            this.currentNode.setLeft(node)
            this.currentNode.setBoolOperator(this.boolOperator)
        } else if (this.currentNode && this.currentNode.right === null) {
            const node = this.newNode('', this.newExpression(), null, null)
            this.currentNode.setRight(node)
            this.currentNode.setBoolOperator(this.boolOperator)
        } else {
            const right = this.newNode('', this.newExpression(), null, null)
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
        this.setCurrentNode(
            this.newNode(this.boolOperator, null, null, null)
        )
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
            this.setState(State.EXPECT_OPERATOR)
            this.storeTypedChar(CharType.SPACE)
        } else if (this.char.isKey()) {
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
        } else if (this.char.isOp()) {
            this.extendKeyValueOperator()
            this.setState(State.KEY_VALUE_OPERATOR)
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

    inStateKeyValueOperator() {
        if (!this.char) {
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
                if (this.key && this.value && this.keyValueOperator) {
                    this.extendTree()
                }
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
            if (
                this.boolOperator.length > 3 ||
                !VALID_BOOL_OPERATORS_CHARS.includes(this.char.value)
            ) {
                this.setErrorState('invalid character', 20)
            } else {
                if (VALID_BOOL_OPERATORS.includes(this.boolOperator)) {
                    const nextPos = this.char.pos + 1
                    if (this.text.length > nextPos) {
                        const nextChar = new Char(this.text[nextPos], nextPos, 0, 0)
                        if (!nextChar.isDelimiter()) {
                            this.setErrorState(
                                'expected delimiter after bool operator',
                                23
                            )
                            return
                        } else {
                            this.setState(State.BOOL_OP_DELIMITER)
                        }
                    }
                }
            }
        }
    }

    inStateLastChar() {
        if (this.state === State.INITIAL && !this.nodesStack.length) {
            this.setErrorState('empty input', 24)
        } else if (
            this.state === State.INITIAL ||
            this.state === State.KEY ||
            this.state === State.SINGLE_QUOTED_KEY ||
            this.state === State.DOUBLE_QUOTED_KEY ||
            this.state === State.EXPECT_OPERATOR ||
            this.state === State.EXPECT_VALUE
        ) {
            this.setErrorState('unexpected EOF', 25)
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