import {
    AT,
    UNDERSCORE,
    HYPHEN,
    DOT,
    COLON,
    SLASH,
    MODIFIER_ARGUMENT_DELIMITER,
    BRACKET_OPEN,
    BRACKET_CLOSE,
    DOUBLE_QUOTE,
    SINGLE_QUOTE,
    MODIFIER_OPERATOR,
    COLUMNS_DELIMITER,
    ALIAS_DELIMITER,
    SPACE,
    BACKSLASH,
    NEWLINE,
} from './constants.js'

export class Char {
    constructor(value, pos, line, linePos) {
        this.value = value
        this.pos = pos
        this.line = line
        this.linePos = linePos
    }

    isColumnValue() {
        return (
            /[a-zA-Z0-9]/.test(this.value) ||
            this.value === UNDERSCORE ||
            this.value === HYPHEN ||
            this.value === DOT ||
            this.value === COLON ||
            this.value === SLASH ||
            this.value === SINGLE_QUOTE ||
            this.value === DOUBLE_QUOTE ||
            this.value === BACKSLASH ||
            this.value === AT
        )
    }

    isModifierArgumentValue() {
        return this.value !== MODIFIER_ARGUMENT_DELIMITER && this.value !== BRACKET_OPEN && this.value !== BRACKET_CLOSE
    }

    isModifierDoubleQuotedArgumentValue() {
        return !this.isDoubleQuote()
    }

    isModifierSingleQuotedArgumentValue() {
        return !this.isSingleQuote()
    }

    isModifierValue() {
        return /[a-zA-Z0-9]/.test(this.value) || this.value === UNDERSCORE
    }

    isAliasChar() {
        return ['A', 'a', 'S', 's'].includes(this.value)
    }

    isBracketOpen() {
        return this.value === BRACKET_OPEN
    }

    isBracketClose() {
        return this.value === BRACKET_CLOSE
    }

    isDoubleQuote() {
        return this.value === DOUBLE_QUOTE
    }

    isSingleQuote() {
        return this.value === SINGLE_QUOTE
    }

    isModifierOperator() {
        return this.value === MODIFIER_OPERATOR
    }

    isModifierArgumentDelimiter() {
        return this.value === MODIFIER_ARGUMENT_DELIMITER
    }

    isColumnsDelimiter() {
        return this.value === COLUMNS_DELIMITER
    }

    isAliasDelimiter() {
        return this.value === ALIAS_DELIMITER
    }

    isSpace() {
        return this.value === SPACE
    }

    isBackslash() {
        return this.value === BACKSLASH
    }

    isNewline() {
        return this.value === NEWLINE
    }
}
