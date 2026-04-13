import { Char } from './char.js'
import { State } from './state.js'
import { ParserError } from './exceptions.js'
import { ESCAPE_SEQUENCES, DOUBLE_QUOTE, SINGLE_QUOTE, VALID_ALIAS_OPERATOR, CharType } from './constants.js'
import { Range } from '../core/range.js'

export class Parser {
    constructor(capabilities) {
        const defaults = { transformers: false }
        this.capabilities = capabilities ? { ...defaults, ...capabilities } : { ...defaults }
        this.line = 0
        this.linePos = 0
        this.char = null
        this.state = State.EXPECT_COLUMN
        this.errorText = ''
        this.errno = 0
        this.column = ''
        this.alias = ''
        this.aliasOperator = ''
        this.transformer = ''
        this.transformerArgument = ''
        this.transformerArgumentType = 'auto'
        this.transformers = []
        this.transformerArguments = []
        this.columns = []
        this.text = ''
        this.typedChars = []
        this._columnStart = -1
        this._transformerStart = -1
        this._transformerArgStart = -1
        this._transformerArgRanges = []
    }

    trackChar(charType) {
        if (this.char) {
            this.typedChars.push([this.char, charType])
        }
    }

    setText(text) {
        this.text = text
    }

    storeColumn() {
        const nameRange =
            this._columnStart >= 0 ? new Range(this._columnStart, this._columnStart + this.column.length) : null
        this.columns.push({
            name: this.column,
            transformers: this.transformers,
            alias: this.alias || null,
            nameRange,
        })
        this.resetData()
    }

    storeTransformer() {
        const nameRange =
            this._transformerStart >= 0
                ? new Range(this._transformerStart, this._transformerStart + this.transformer.length)
                : null
        this.transformers.push({
            name: this.transformer,
            arguments: this.transformerArguments,
            nameRange,
            argumentRanges: this._transformerArgRanges,
        })
        this.resetTransformer()
    }

    storeArgument() {
        let value = this.transformerArgument
        if (this.transformerArgumentType === 'auto') {
            const intValue = parseInt(value, 10)
            const floatValue = parseFloat(value)
            if (!isNaN(intValue) && intValue.toString() === value) {
                value = intValue
            } else if (!isNaN(floatValue)) {
                value = floatValue
            }
        }
        this.transformerArguments.push(value)
        if (this._transformerArgStart >= 0) {
            let end
            if (this.transformerArgumentType === 'str') {
                // Quoted argument: end after closing quote (char.pos is closing quote)
                end = this.char ? this.char.pos + 1 : this._transformerArgStart + this.transformerArgument.length + 2
            } else {
                end = this._transformerArgStart + this.transformerArgument.length
            }
            this._transformerArgRanges.push(new Range(this._transformerArgStart, end))
        }
        this.resetTransformerArgument()
    }

    setChar(char) {
        this.char = char
    }

    setState(state) {
        this.state = state
    }

    resetTransformer() {
        this.transformer = ''
        this.transformerArguments = []
        this.transformerArgument = ''
        this._transformerStart = -1
        this._transformerArgStart = -1
        this._transformerArgRanges = []
    }

    resetColumn() {
        this.column = ''
    }

    resetAliasOperator() {
        this.aliasOperator = ''
    }

    resetAlias() {
        this.alias = ''
    }

    resetTransformers() {
        this.transformers = []
    }

    resetTransformerArgument() {
        this.transformerArgument = ''
        this.transformerArgumentType = 'auto'
        this._transformerArgStart = -1
    }

    resetData() {
        this.resetColumn()
        this.resetAlias()
        this.resetTransformer()
        this.resetTransformers()
        this.resetAliasOperator()
        this._columnStart = -1
    }

    setErrorState(errorText, errno) {
        this.state = State.ERROR
        this.errorText = errorText
        this.errno = errno
        if (this.char) {
            this.errorText += ` [char ${this.char.value} at pos ${this.char.pos}], errno=${errno}`
        }
    }

    extendColumn() {
        if (this.char) {
            if (this._columnStart < 0) {
                this._columnStart = this.char.pos
            }
            this.column += this.char.value
            this.trackChar(CharType.COLUMN)
        }
    }

    extendTransformer() {
        if (this.char) {
            if (this._transformerStart < 0) {
                this._transformerStart = this.char.pos
            }
            this.transformer += this.char.value
            this.trackChar(CharType.TRANSFORMER)
        }
    }

    extendTransformerArgument() {
        if (this.char) {
            if (this._transformerArgStart < 0) {
                this._transformerArgStart = this.char.pos
            }
            this.transformerArgument += this.char.value
            this.trackChar(CharType.ARGUMENT)
        }
    }

    extendAlias() {
        if (this.char) {
            this.alias += this.char.value
            this.trackChar(CharType.ALIAS)
        }
    }

    extendAliasOperator() {
        if (this.char) {
            this.aliasOperator += this.char.value
        }
    }

    parse(text, raiseError = true, ignoreLastChar = false) {
        this.setText(text)
        this.raiseError = raiseError
        this.ignoreLastChar = ignoreLastChar

        let i = 0
        while (i < text.length) {
            let parsedNewline = false
            if (this.state === State.ERROR) {
                break
            }

            this.setChar(new Char(text[i], i, this.line, this.linePos))

            if (this.char.isBackslash()) {
                if (i + 1 < text.length) {
                    const nextChar = text[i + 1]
                    if (nextChar && ESCAPE_SEQUENCES[nextChar]) {
                        parsedNewline = true
                        this.setChar(new Char(ESCAPE_SEQUENCES[nextChar], i, this.line, this.linePos))
                        i += 1
                    }
                }
            }

            if (this.char.isNewline() && !parsedNewline) {
                this.trackChar(CharType.SPACE)
                this.line += 1
                this.linePos = 0
                i += 1
                continue
            }

            if (this.state === State.EXPECT_COLUMN) {
                this.inStateExpectColumn()
            } else if (this.state === State.COLUMN) {
                this.inStateColumn()
            } else if (this.state === State.EXPECT_ALIAS) {
                this.inStateExpectAlias()
            } else if (this.state === State.EXPECT_ALIAS_OPERATOR) {
                this.inStateExpectAliasOperator()
            } else if (this.state === State.EXPECT_ALIAS_DELIMITER) {
                this.inStateExpectAliasDelimiter()
            } else if (this.state === State.EXPECT_TRANSFORMER) {
                this.inStateExpectTransformer()
            } else if (this.state === State.EXPECT_TRANSFORMER_ARGUMENT) {
                this.inStateExpectTransformerArgument()
            } else if (this.state === State.TRANSFORMER) {
                this.inStateTransformer()
            } else if (this.state === State.TRANSFORMER_ARGUMENT) {
                this.inStateTransformerArgument()
            } else if (this.state === State.TRANSFORMER_COMPLETE) {
                this.inStateTransformerComplete()
            } else if (this.state === State.TRANSFORMER_ARGUMENT_DOUBLE_QUOTED) {
                this.inStateTransformerArgumentDoubleQuoted()
            } else if (this.state === State.TRANSFORMER_ARGUMENT_SINGLE_QUOTED) {
                this.inStateTransformerArgumentSingleQuoted()
            } else if (this.state === State.EXPECT_TRANSFORMER_ARGUMENT_DELIMITER) {
                this.inStateExpectTransformerArgumentDelimiter()
            } else {
                this.setErrorState(`unknown state: ${this.state}`, 1)
            }
            i += 1
            this.linePos += 1
        }

        if (this.state === State.ERROR && this.raiseError) {
            throw new ParserError(this.errorText, this.errno)
        }

        if (!this.ignoreLastChar) {
            this.inStateLastChar()
        }

        if (this.state === State.ERROR && this.raiseError) {
            throw new ParserError(this.errorText, this.errno)
        }
    }

    inStateLastChar() {
        if (this.state === State.COLUMN) {
            this.storeColumn()
        } else if (this.state === State.EXPECT_COLUMN) {
            return
        } else if (this.state === State.EXPECT_ALIAS) {
            if (this.alias) {
                this.storeColumn()
            } else {
                this.setErrorState('unexpected end of alias. Expected alias value', 13)
            }
        } else if (this.state === State.EXPECT_ALIAS_OPERATOR) {
            if (this.aliasOperator) {
                this.setErrorState('unexpected end of alias. Expected alias value', 14)
            } else {
                this.storeColumn()
            }
        } else if (this.state === State.EXPECT_ALIAS_DELIMITER) {
            this.setErrorState('unexpected end of alias. Expected alias value', 14)
        } else if (this.state === State.TRANSFORMER) {
            if (this.transformer) {
                this.storeTransformer()
            }
            if (this.column) {
                this.storeColumn()
            }
        } else if (this.state === State.TRANSFORMER_COMPLETE) {
            this.storeTransformer()
            this.storeColumn()
        } else if (
            this.state === State.TRANSFORMER_ARGUMENT_DOUBLE_QUOTED ||
            this.state === State.TRANSFORMER_ARGUMENT_SINGLE_QUOTED
        ) {
            this.setErrorState('unexpected end of quoted argument value', 12)
        } else if (this.state === State.EXPECT_TRANSFORMER_ARGUMENT_DELIMITER) {
            this.setErrorState('unexpected end of arguments list', 15)
        } else if (this.state === State.EXPECT_TRANSFORMER_ARGUMENT) {
            this.setErrorState('expected closing parenthesis', 16)
        } else if (this.state === State.TRANSFORMER_ARGUMENT) {
            this.setErrorState('expected closing parenthesis', 16)
        } else if (this.state === State.EXPECT_TRANSFORMER) {
            this.setErrorState('expected transformer after operator', 7)
        }
    }

    inStateExpectColumn() {
        if (!this.char) return
        if (this.char.isSpace()) {
            this.trackChar(CharType.SPACE)
            return
        } else if (this.char.isColumnValue()) {
            this.extendColumn()
            this.setState(State.COLUMN)
        } else {
            this.trackChar(CharType.ERROR)
            this.setErrorState('invalid character', 2)
        }
    }

    inStateColumn() {
        if (!this.char) return
        if (this.char.isSpace()) {
            this.trackChar(CharType.SPACE)
            this.setState(State.EXPECT_ALIAS_OPERATOR)
        } else if (this.char.isColumnValue()) {
            this.extendColumn()
        } else if (this.char.isColumnsDelimiter()) {
            this.trackChar(CharType.OPERATOR)
            this.setState(State.EXPECT_COLUMN)
            this.storeColumn()
        } else if (this.char.isTransformerOperator()) {
            if (!this.capabilities.transformers) {
                this.trackChar(CharType.ERROR)
                this.setErrorState('transformers are not enabled', 17)
                return
            }
            this.trackChar(CharType.OPERATOR)
            this.setState(State.EXPECT_TRANSFORMER)
        } else {
            this.trackChar(CharType.ERROR)
            this.setErrorState('invalid character', 6)
        }
    }

    inStateExpectTransformer() {
        if (!this.char) return
        if (this.char.isTransformerValue()) {
            this.extendTransformer()
            this.setState(State.TRANSFORMER)
        } else {
            this.trackChar(CharType.ERROR)
            this.setErrorState('invalid character, expected transformer', 7)
        }
    }

    inStateTransformer() {
        if (!this.char) return
        if (this.char.isTransformerValue()) {
            this.extendTransformer()
        } else if (this.char.isColumnsDelimiter()) {
            this.trackChar(CharType.OPERATOR)
            this.storeTransformer()
            this.storeColumn()
            this.setState(State.EXPECT_COLUMN)
        } else if (this.char.isTransformerOperator()) {
            this.trackChar(CharType.OPERATOR)
            this.storeTransformer()
            this.setState(State.EXPECT_TRANSFORMER)
        } else if (this.char.isSpace()) {
            this.trackChar(CharType.SPACE)
            this.storeTransformer()
            this.setState(State.EXPECT_ALIAS_OPERATOR)
        } else if (this.char.isBracketOpen()) {
            this.trackChar(CharType.OPERATOR)
            this.setState(State.EXPECT_TRANSFORMER_ARGUMENT)
        } else if (this.char.isBracketClose()) {
            this.trackChar(CharType.OPERATOR)
            this.storeArgument()
            this.storeTransformer()
            throw new Error('unsupported close bracket')
        } else {
            this.trackChar(CharType.ERROR)
            throw new Error('unsupported char in transformer')
        }
    }

    inStateExpectTransformerArgument() {
        if (!this.char) return
        if (this.char.isSpace()) {
            this.trackChar(CharType.SPACE)
            return
        }
        if (this.char.isDoubleQuote()) {
            this.transformerArgumentType = 'str'
            this._transformerArgStart = this.char.pos
            this.setState(State.TRANSFORMER_ARGUMENT_DOUBLE_QUOTED)
        } else if (this.char.isSingleQuote()) {
            this.transformerArgumentType = 'str'
            this._transformerArgStart = this.char.pos
            this.setState(State.TRANSFORMER_ARGUMENT_SINGLE_QUOTED)
        } else if (this.char.isTransformerArgumentValue()) {
            this.extendTransformerArgument()
            this.setState(State.TRANSFORMER_ARGUMENT)
        } else if (this.char.isBracketClose()) {
            this.trackChar(CharType.OPERATOR)
            if (this.transformerArgument) {
                this.storeArgument()
            }
            this.setState(State.TRANSFORMER_COMPLETE)
        }
    }

    inStateTransformerArgument() {
        if (!this.char) return
        if (this.char.isTransformerArgumentDelimiter()) {
            this.trackChar(CharType.OPERATOR)
            this.storeArgument()
            this.setState(State.EXPECT_TRANSFORMER_ARGUMENT)
        } else if (this.char.isTransformerArgumentValue()) {
            this.extendTransformerArgument()
        } else if (this.char.isBracketClose()) {
            this.trackChar(CharType.OPERATOR)
            this.storeArgument()
            this.setState(State.TRANSFORMER_COMPLETE)
        }
    }

    inStateExpectTransformerArgumentDelimiter() {
        if (!this.char) return
        if (this.char.isTransformerArgumentDelimiter()) {
            this.setState(State.EXPECT_TRANSFORMER_ARGUMENT)
        } else if (this.char.isBracketClose()) {
            this.setState(State.TRANSFORMER_COMPLETE)
        } else {
            this.setErrorState('invalid character. Expected bracket close or transformer argument delimiter', 9)
        }
    }

    inStateTransformerArgumentDoubleQuoted() {
        if (!this.char) return
        if (this.char.isBackslash()) {
            const nextPos = this.char.pos + 1
            if (nextPos < this.text.length) {
                const nextChar = this.text[nextPos]
                if (nextChar !== DOUBLE_QUOTE) {
                    this.extendTransformerArgument()
                }
            } else {
                this.extendTransformerArgument()
            }
        } else if (this.char.isTransformerDoubleQuotedArgumentValue()) {
            this.extendTransformerArgument()
        } else if (this.char.isDoubleQuote()) {
            const prevPos = this.char.pos - 1
            if (this.text[prevPos] === '\\') {
                this.extendTransformerArgument()
            } else {
                this.storeArgument()
                this.setState(State.EXPECT_TRANSFORMER_ARGUMENT_DELIMITER)
            }
        } else {
            this.setErrorState('invalid character', 10)
        }
    }

    inStateTransformerArgumentSingleQuoted() {
        if (!this.char) return
        if (this.char.isBackslash()) {
            const nextPos = this.char.pos + 1
            if (nextPos < this.text.length) {
                const nextChar = this.text[nextPos]
                if (nextChar !== SINGLE_QUOTE) {
                    this.extendTransformerArgument()
                }
            } else {
                this.extendTransformerArgument()
            }
        } else if (this.char.isTransformerSingleQuotedArgumentValue()) {
            this.extendTransformerArgument()
        } else if (this.char.isSingleQuote()) {
            const prevPos = this.char.pos - 1
            if (this.text[prevPos] === '\\') {
                this.extendTransformerArgument()
            } else {
                this.storeArgument()
                this.setState(State.EXPECT_TRANSFORMER_ARGUMENT_DELIMITER)
            }
        } else {
            this.setErrorState('invalid character', 10)
        }
    }

    inStateTransformerComplete() {
        if (!this.char) return
        if (this.char.isSpace()) {
            this.trackChar(CharType.SPACE)
            this.storeTransformer()
            this.setState(State.EXPECT_ALIAS_OPERATOR)
        } else if (this.char.isColumnsDelimiter()) {
            this.trackChar(CharType.OPERATOR)
            this.storeTransformer()
            this.storeColumn()
            this.setState(State.EXPECT_COLUMN)
        } else if (this.char.isTransformerOperator()) {
            if (!this.capabilities.transformers) {
                this.trackChar(CharType.ERROR)
                this.setErrorState('transformers are not enabled', 17)
                return
            }
            this.trackChar(CharType.OPERATOR)
            this.storeTransformer()
            this.setState(State.EXPECT_TRANSFORMER)
        } else {
            this.trackChar(CharType.ERROR)
            this.setErrorState('invalid character', 8)
        }
    }

    inStateExpectAliasOperator() {
        if (!this.char) return
        if (this.char.isSpace()) {
            this.trackChar(CharType.SPACE)
            return
        } else if (this.char.isColumnsDelimiter()) {
            this.trackChar(CharType.OPERATOR)
            this.storeColumn()
            this.setState(State.EXPECT_COLUMN)
        } else if (this.char.isAliasChar()) {
            this.trackChar(CharType.ALIAS_OPERATOR)
            this.extendAliasOperator()
            if (this.aliasOperator.length < 2) {
                return
            }
            if (this.aliasOperator.length === 2) {
                if (this.aliasOperator.toLowerCase() !== VALID_ALIAS_OPERATOR) {
                    this.setErrorState('invalid character', 3)
                } else {
                    this.setState(State.EXPECT_ALIAS_DELIMITER)
                    this.resetAliasOperator()
                }
            }
        } else {
            this.setErrorState('invalid character, expected alias operator', 4)
        }
    }

    inStateExpectAlias() {
        if (!this.char) return
        if (this.char.isSpace()) {
            this.trackChar(CharType.SPACE)
            return
        } else if (this.char.isColumnValue()) {
            this.extendAlias()
        } else if (this.char.isColumnsDelimiter()) {
            this.trackChar(CharType.OPERATOR)
            this.setState(State.EXPECT_COLUMN)
            this.storeColumn()
        }
    }

    inStateExpectAliasDelimiter() {
        if (!this.char) return
        if (this.char.isAliasDelimiter()) {
            this.trackChar(CharType.SPACE)
            this.setState(State.EXPECT_ALIAS)
        } else {
            this.trackChar(CharType.ERROR)
            this.setErrorState('invalid character, expected alias delimiter', 5)
        }
    }
}
