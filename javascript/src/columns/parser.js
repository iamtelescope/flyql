import { Char } from './char.js'
import { State } from './state.js'
import { ParserError } from './exceptions.js'
import { ESCAPE_SEQUENCES, DOUBLE_QUOTE, SINGLE_QUOTE, VALID_ALIAS_OPERATOR, CharType } from './constants.js'
import { generateMonacoTokens as generateTokens } from './monaco.js'

export class Parser {
    constructor(capabilities) {
        const defaults = { modifiers: false }
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
        this.modifier = ''
        this.modifierArgument = ''
        this.modifierArgumentType = 'auto'
        this.modifiers = []
        this.modifierArguments = []
        this.columns = []
        this.text = ''
        this.typedChars = []
    }

    generateMonacoTokens() {
        return generateTokens(this)
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
        this.columns.push({
            name: this.column,
            modifiers: this.modifiers,
            alias: this.alias || null,
        })
        this.resetData()
    }

    storeModifier() {
        this.modifiers.push({
            name: this.modifier,
            arguments: this.modifierArguments,
        })
        this.resetModifier()
    }

    storeArgument() {
        let value = this.modifierArgument
        if (this.modifierArgumentType === 'auto') {
            const intValue = parseInt(value, 10)
            const floatValue = parseFloat(value)
            if (!isNaN(intValue) && intValue.toString() === value) {
                value = intValue
            } else if (!isNaN(floatValue)) {
                value = floatValue
            }
        }
        this.modifierArguments.push(value)
        this.resetModifierArgument()
    }

    setChar(char) {
        this.char = char
    }

    setState(state) {
        this.state = state
    }

    resetModifier() {
        this.modifier = ''
        this.modifierArguments = []
        this.modifierArgument = ''
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

    resetModifiers() {
        this.modifiers = []
    }

    resetModifierArgument() {
        this.modifierArgument = ''
        this.modifierArgumentType = 'auto'
    }

    resetData() {
        this.resetColumn()
        this.resetAlias()
        this.resetModifier()
        this.resetModifiers()
        this.resetAliasOperator()
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
            this.column += this.char.value
            this.trackChar(CharType.COLUMN)
        }
    }

    extendModifier() {
        if (this.char) {
            this.modifier += this.char.value
            this.trackChar(CharType.MODIFIER)
        }
    }

    extendModifierArgument() {
        if (this.char) {
            this.modifierArgument += this.char.value
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
            } else if (this.state === State.EXPECT_MODIFIER) {
                this.inStateExpectModifier()
            } else if (this.state === State.EXPECT_MODIFIER_ARGUMENT) {
                this.inStateExpectModifierArgument()
            } else if (this.state === State.MODIFIER) {
                this.inStateModifier()
            } else if (this.state === State.MODIFIER_ARGUMENT) {
                this.inStateModifierArgument()
            } else if (this.state === State.MODIFIER_COMPLETE) {
                this.inStateModifierComplete()
            } else if (this.state === State.MODIFIER_ARGUMENT_DOUBLE_QUOTED) {
                this.inStateModifierArgumentDoubleQuoted()
            } else if (this.state === State.MODIFIER_ARGUMENT_SINGLE_QUOTED) {
                this.inStateModifierArgumentSingleQuoted()
            } else if (this.state === State.EXPECT_MODIFIER_ARGUMENT_DELIMITER) {
                this.inStateExpectModifierArgumentDelimiter()
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
        } else if (this.state === State.MODIFIER) {
            if (this.modifier) {
                this.storeModifier()
            }
            if (this.column) {
                this.storeColumn()
            }
        } else if (this.state === State.MODIFIER_COMPLETE) {
            this.storeModifier()
            this.storeColumn()
        } else if (
            this.state === State.MODIFIER_ARGUMENT_DOUBLE_QUOTED ||
            this.state === State.MODIFIER_ARGUMENT_SINGLE_QUOTED
        ) {
            this.setErrorState('unexpected end of quoted argument value', 12)
        } else if (this.state === State.EXPECT_MODIFIER_ARGUMENT_DELIMITER) {
            this.setErrorState('unexpected end of arguments list', 15)
        } else if (this.state === State.EXPECT_MODIFIER_ARGUMENT) {
            this.setErrorState('expected closing parenthesis', 16)
        } else if (this.state === State.MODIFIER_ARGUMENT) {
            this.setErrorState('expected closing parenthesis', 16)
        } else if (this.state === State.EXPECT_MODIFIER) {
            this.setErrorState('expected modifier after operator', 7)
        }
    }

    inStateExpectColumn() {
        if (!this.char) return
        if (this.char.isSpace()) {
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
            this.setState(State.EXPECT_ALIAS_OPERATOR)
        } else if (this.char.isColumnValue()) {
            this.extendColumn()
        } else if (this.char.isColumnsDelimiter()) {
            this.trackChar(CharType.OPERATOR)
            this.setState(State.EXPECT_COLUMN)
            this.storeColumn()
        } else if (this.char.isModifierOperator()) {
            if (!this.capabilities.modifiers) {
                this.trackChar(CharType.ERROR)
                this.setErrorState('modifiers are not enabled', 17)
                return
            }
            this.trackChar(CharType.OPERATOR)
            this.setState(State.EXPECT_MODIFIER)
        } else {
            this.trackChar(CharType.ERROR)
            this.setErrorState('invalid character', 6)
        }
    }

    inStateExpectModifier() {
        if (!this.char) return
        if (this.char.isModifierValue()) {
            this.extendModifier()
            this.setState(State.MODIFIER)
        } else {
            this.trackChar(CharType.ERROR)
            this.setErrorState('invalid character, expected modifier', 7)
        }
    }

    inStateModifier() {
        if (!this.char) return
        if (this.char.isModifierValue()) {
            this.extendModifier()
        } else if (this.char.isColumnsDelimiter()) {
            this.trackChar(CharType.OPERATOR)
            this.storeModifier()
            this.storeColumn()
            this.setState(State.EXPECT_COLUMN)
        } else if (this.char.isModifierOperator()) {
            this.trackChar(CharType.OPERATOR)
            this.storeModifier()
            this.setState(State.EXPECT_MODIFIER)
        } else if (this.char.isSpace()) {
            this.storeModifier()
            this.setState(State.EXPECT_ALIAS_OPERATOR)
        } else if (this.char.isBracketOpen()) {
            this.trackChar(CharType.OPERATOR)
            this.setState(State.EXPECT_MODIFIER_ARGUMENT)
        } else if (this.char.isBracketClose()) {
            this.trackChar(CharType.OPERATOR)
            this.storeArgument()
            this.storeModifier()
            throw new Error('unsupported close bracket')
        } else {
            this.trackChar(CharType.ERROR)
            throw new Error('unsupported char in modifier')
        }
    }

    inStateExpectModifierArgument() {
        if (!this.char) return
        if (this.char.isSpace()) {
            return
        }
        if (this.char.isDoubleQuote()) {
            this.modifierArgumentType = 'str'
            this.setState(State.MODIFIER_ARGUMENT_DOUBLE_QUOTED)
        } else if (this.char.isSingleQuote()) {
            this.modifierArgumentType = 'str'
            this.setState(State.MODIFIER_ARGUMENT_SINGLE_QUOTED)
        } else if (this.char.isModifierArgumentValue()) {
            this.extendModifierArgument()
            this.setState(State.MODIFIER_ARGUMENT)
        } else if (this.char.isBracketClose()) {
            this.trackChar(CharType.OPERATOR)
            if (this.modifierArgument) {
                this.storeArgument()
            }
            this.setState(State.MODIFIER_COMPLETE)
        }
    }

    inStateModifierArgument() {
        if (!this.char) return
        if (this.char.isModifierArgumentDelimiter()) {
            this.trackChar(CharType.OPERATOR)
            this.storeArgument()
            this.setState(State.EXPECT_MODIFIER_ARGUMENT)
        } else if (this.char.isModifierArgumentValue()) {
            this.extendModifierArgument()
        } else if (this.char.isBracketClose()) {
            this.trackChar(CharType.OPERATOR)
            this.storeArgument()
            this.setState(State.MODIFIER_COMPLETE)
        }
    }

    inStateExpectModifierArgumentDelimiter() {
        if (!this.char) return
        if (this.char.isModifierArgumentDelimiter()) {
            this.setState(State.EXPECT_MODIFIER_ARGUMENT)
        } else if (this.char.isBracketClose()) {
            this.setState(State.MODIFIER_COMPLETE)
        } else {
            this.setErrorState('invalid character. Expected bracket close or modifier argument delimiter', 9)
        }
    }

    inStateModifierArgumentDoubleQuoted() {
        if (!this.char) return
        if (this.char.isBackslash()) {
            const nextPos = this.char.pos + 1
            if (nextPos < this.text.length) {
                const nextChar = this.text[nextPos]
                if (nextChar !== DOUBLE_QUOTE) {
                    this.extendModifierArgument()
                }
            } else {
                this.extendModifierArgument()
            }
        } else if (this.char.isModifierDoubleQuotedArgumentValue()) {
            this.extendModifierArgument()
        } else if (this.char.isDoubleQuote()) {
            const prevPos = this.char.pos - 1
            if (this.text[prevPos] === '\\') {
                this.extendModifierArgument()
            } else {
                this.storeArgument()
                this.setState(State.EXPECT_MODIFIER_ARGUMENT_DELIMITER)
            }
        } else {
            this.setErrorState('invalid character', 10)
        }
    }

    inStateModifierArgumentSingleQuoted() {
        if (!this.char) return
        if (this.char.isBackslash()) {
            const nextPos = this.char.pos + 1
            if (nextPos < this.text.length) {
                const nextChar = this.text[nextPos]
                if (nextChar !== SINGLE_QUOTE) {
                    this.extendModifierArgument()
                }
            } else {
                this.extendModifierArgument()
            }
        } else if (this.char.isModifierSingleQuotedArgumentValue()) {
            this.extendModifierArgument()
        } else if (this.char.isSingleQuote()) {
            const prevPos = this.char.pos - 1
            if (this.text[prevPos] === '\\') {
                this.extendModifierArgument()
            } else {
                this.storeArgument()
                this.setState(State.EXPECT_MODIFIER_ARGUMENT_DELIMITER)
            }
        } else {
            this.setErrorState('invalid character', 10)
        }
    }

    inStateModifierComplete() {
        if (!this.char) return
        if (this.char.isSpace()) {
            this.storeModifier()
            this.setState(State.EXPECT_ALIAS_OPERATOR)
        } else if (this.char.isColumnsDelimiter()) {
            this.trackChar(CharType.OPERATOR)
            this.storeModifier()
            this.storeColumn()
            this.setState(State.EXPECT_COLUMN)
        } else if (this.char.isModifierOperator()) {
            if (!this.capabilities.modifiers) {
                this.trackChar(CharType.ERROR)
                this.setErrorState('modifiers are not enabled', 17)
                return
            }
            this.trackChar(CharType.OPERATOR)
            this.storeModifier()
            this.setState(State.EXPECT_MODIFIER)
        } else {
            this.trackChar(CharType.ERROR)
            this.setErrorState('invalid character', 8)
        }
    }

    inStateExpectAliasOperator() {
        if (!this.char) return
        if (this.char.isSpace()) {
            return
        } else if (this.char.isColumnsDelimiter()) {
            this.storeColumn()
            this.setState(State.EXPECT_COLUMN)
        } else if (this.char.isAliasChar()) {
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
            this.setState(State.EXPECT_ALIAS)
        } else {
            this.trackChar(CharType.ERROR)
            this.setErrorState('invalid character, expected alias delimiter', 5)
        }
    }
}
