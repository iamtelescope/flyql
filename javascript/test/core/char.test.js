import { describe, it, expect } from 'vitest'
import { Char } from '../../src/index.js'

describe('Char', () => {
    it('should initialize correctly', () => {
        const char = new Char('a', 0, 0, 0)
        expect(char.value).toBe('a')
        expect(char.pos).toBe(0)
        expect(char.line).toBe(0)
        expect(char.linePos).toBe(0)
    })

    it('should identify delimiters', () => {
        const spaceChar = new Char(' ', 0, 0, 0)
        expect(spaceChar.isDelimiter()).toBe(true)

        const letterChar = new Char('a', 0, 0, 0)
        expect(letterChar.isDelimiter()).toBe(false)
    })

    it('should identify key characters', () => {
        const validKeyChars = ['a', 'A', '1', '_', '.', ':', '/']
        validKeyChars.forEach((value) => {
            const char = new Char(value, 0, 0, 0)
            expect(char.isKey()).toBe(true)
        })

        const invalidKeyChars = [' ', '!', '=', '(', ')']
        invalidKeyChars.forEach((value) => {
            const char = new Char(value, 0, 0, 0)
            expect(char.isKey()).toBe(false)
        })
    })

    it('should identify operator characters', () => {
        const opChars = ['=', '!', '~', '<', '>']
        opChars.forEach((value) => {
            const char = new Char(value, 0, 0, 0)
            expect(char.isOp()).toBe(true)
        })

        const nonOpChars = ['a', ' ', '(', ')']
        nonOpChars.forEach((value) => {
            const char = new Char(value, 0, 0, 0)
            expect(char.isOp()).toBe(false)
        })
    })

    it('should identify group characters', () => {
        const openChar = new Char('(', 0, 0, 0)
        expect(openChar.isGroupOpen()).toBe(true)

        const closeChar = new Char(')', 0, 0, 0)
        expect(closeChar.isGroupClose()).toBe(true)

        const otherChar = new Char('a', 0, 0, 0)
        expect(otherChar.isGroupOpen()).toBe(false)
        expect(otherChar.isGroupClose()).toBe(false)
    })

    it('should identify quote characters', () => {
        const doubleQuoteChar = new Char('"', 0, 0, 0)
        expect(doubleQuoteChar.isDoubleQuote()).toBe(true)
        expect(doubleQuoteChar.isDoubleQuotedValue()).toBe(false)

        const singleQuoteChar = new Char("'", 0, 0, 0)
        expect(singleQuoteChar.isSingleQuote()).toBe(true)
        expect(singleQuoteChar.isSingleQuotedValue()).toBe(false)

        const regularChar = new Char('a', 0, 0, 0)
        expect(regularChar.isDoubleQuote()).toBe(false)
        expect(regularChar.isSingleQuote()).toBe(false)
        expect(regularChar.isDoubleQuotedValue()).toBe(true)
        expect(regularChar.isSingleQuotedValue()).toBe(true)
    })

    it('should identify backslash', () => {
        const backslashChar = new Char('\\', 0, 0, 0)
        expect(backslashChar.isBackslash()).toBe(true)

        const otherChar = new Char('a', 0, 0, 0)
        expect(otherChar.isBackslash()).toBe(false)
    })

    it('should identify equals', () => {
        const equalsChar = new Char('=', 0, 0, 0)
        expect(equalsChar.isEquals()).toBe(true)

        const otherChar = new Char('a', 0, 0, 0)
        expect(otherChar.isEquals()).toBe(false)
    })

    it('should identify value characters', () => {
        const validValueChars = ['a', '1', '!', '<', '>']
        validValueChars.forEach((value) => {
            const char = new Char(value, 0, 0, 0)
            expect(char.isValue()).toBe(true)
        })

        const invalidValueChars = ['"', "'", ' ', '(', ')', '=']
        invalidValueChars.forEach((value) => {
            const char = new Char(value, 0, 0, 0)
            expect(char.isValue()).toBe(false)
        })
    })

    it('should identify newline', () => {
        const newlineChar = new Char('\n', 0, 0, 0)
        expect(newlineChar.isNewline()).toBe(true)

        const otherChar = new Char('a', 0, 0, 0)
        expect(otherChar.isNewline()).toBe(false)
    })
})
