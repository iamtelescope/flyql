import { describe, it, expect } from 'vitest'
import { Parser } from '../../src/columns/parser.js'
import { CharType } from '../../src/columns/constants.js'

const CAP_TRANSFORMERS = { transformers: true, renderers: false }
const CAP_RENDERERS = { transformers: false, renderers: true }

function parseText(text, capabilities) {
    const parser = new Parser(capabilities)
    parser.parse(text)
    return parser
}

function typedCharsForRange(parser, start, end) {
    return parser.typedChars.filter(([ch]) => ch.pos >= start && ch.pos < end)
}

function findSubstringPositions(text, needle) {
    const start = text.indexOf(needle)
    return { start, end: start + needle.length }
}

describe('Columns Parser — ARGUMENT_STRING typedChars (Issue #1)', () => {
    it('colors transformer single-quoted arg body + delimiters as ARGUMENT_STRING', () => {
        const text = "message|tag('red')"
        const parser = parseText(text, CAP_TRANSFORMERS)
        const { start, end } = findSubstringPositions(text, "'red'")
        const entries = typedCharsForRange(parser, start, end)
        expect(entries).toHaveLength(5)
        for (const [, type] of entries) {
            expect(type).toBe(CharType.ARGUMENT_STRING)
        }
    })

    it('colors transformer double-quoted arg body + delimiters as ARGUMENT_STRING', () => {
        const text = 'message|tag("red")'
        const parser = parseText(text, CAP_TRANSFORMERS)
        const { start, end } = findSubstringPositions(text, '"red"')
        const entries = typedCharsForRange(parser, start, end)
        expect(entries).toHaveLength(5)
        for (const [, type] of entries) {
            expect(type).toBe(CharType.ARGUMENT_STRING)
        }
    })

    it('colors renderer single-quoted arg body + delimiters as ARGUMENT_STRING', () => {
        const text = "message as msg|tag('red')"
        const parser = parseText(text, CAP_RENDERERS)
        const { start, end } = findSubstringPositions(text, "'red'")
        const entries = typedCharsForRange(parser, start, end)
        expect(entries).toHaveLength(5)
        for (const [, type] of entries) {
            expect(type).toBe(CharType.ARGUMENT_STRING)
        }
    })

    it('colors renderer double-quoted arg body + delimiters as ARGUMENT_STRING', () => {
        const text = 'message as msg|tag("red")'
        const parser = parseText(text, CAP_RENDERERS)
        const { start, end } = findSubstringPositions(text, '"red"')
        const entries = typedCharsForRange(parser, start, end)
        expect(entries).toHaveLength(5)
        for (const [, type] of entries) {
            expect(type).toBe(CharType.ARGUMENT_STRING)
        }
    })

    it('regression: unquoted numeric transformer arg is ARGUMENT_NUMBER, not ARGUMENT_STRING', () => {
        const text = 'message|some_transformer(123)'
        const parser = parseText(text, CAP_TRANSFORMERS)
        const { start, end } = findSubstringPositions(text, '123')
        const entries = typedCharsForRange(parser, start, end)
        expect(entries).toHaveLength(3)
        for (const [, type] of entries) {
            expect(type).toBe(CharType.ARGUMENT_NUMBER)
            expect(type).not.toBe(CharType.ARGUMENT_STRING)
        }
    })

    it('regression: unquoted numeric renderer arg is ARGUMENT_NUMBER', () => {
        const text = 'message as msg|widget(42)'
        const parser = parseText(text, CAP_RENDERERS)
        const { start, end } = findSubstringPositions(text, '42')
        const entries = typedCharsForRange(parser, start, end)
        expect(entries).toHaveLength(2)
        for (const [, type] of entries) {
            expect(type).toBe(CharType.ARGUMENT_NUMBER)
        }
    })
})
