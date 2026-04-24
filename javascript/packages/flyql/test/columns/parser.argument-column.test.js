import { describe, it, expect } from 'vitest'
import { Parser } from '../../src/columns/parser.js'
import { CharType } from '../../src/columns/constants.js'

const CAP_TRANSFORMERS = { transformers: true, renderers: false }

function parseText(text, capabilities = CAP_TRANSFORMERS) {
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

describe('Columns Parser — argumentKinds + ARGUMENT_COLUMN (Issue #2)', () => {
    it('classifies unquoted identifier as field ref (col)', () => {
        const text = 'message|tag(abc)'
        const parser = parseText(text)
        const { start, end } = findSubstringPositions(text, 'abc')
        const entries = typedCharsForRange(parser, start, end)
        expect(entries).toHaveLength(3)
        for (const [, type] of entries) {
            expect(type).toBe(CharType.ARGUMENT_COLUMN)
        }
        const transformer = parser.columns[0].transformers[0]
        expect(transformer.argumentKinds).toEqual(['col'])
        expect(transformer.arguments).toEqual(['abc'])
    })

    it('classifies single-quoted literal as str', () => {
        const text = "message|tag('abc')"
        const parser = parseText(text)
        const transformer = parser.columns[0].transformers[0]
        expect(transformer.argumentKinds).toEqual(['str'])
        expect(transformer.arguments).toEqual(['abc'])
        const { start, end } = findSubstringPositions(text, "'abc'")
        const entries = typedCharsForRange(parser, start, end)
        for (const [, type] of entries) {
            expect(type).toBe(CharType.ARGUMENT_STRING)
        }
    })

    it('classifies unquoted integer as int + ARGUMENT_NUMBER', () => {
        const text = 'message|tag(42)'
        const parser = parseText(text)
        const transformer = parser.columns[0].transformers[0]
        expect(transformer.argumentKinds).toEqual(['int'])
        expect(transformer.arguments).toEqual([42])
        const { start, end } = findSubstringPositions(text, '42')
        const entries = typedCharsForRange(parser, start, end)
        for (const [, type] of entries) {
            expect(type).toBe(CharType.ARGUMENT_NUMBER)
        }
    })

    it('classifies unquoted float as float + ARGUMENT_NUMBER', () => {
        const text = 'message|tag(3.14)'
        const parser = parseText(text)
        const transformer = parser.columns[0].transformers[0]
        expect(transformer.argumentKinds).toEqual(['float'])
        expect(transformer.arguments).toEqual([3.14])
        const { start, end } = findSubstringPositions(text, '3.14')
        const entries = typedCharsForRange(parser, start, end)
        for (const [, type] of entries) {
            expect(type).toBe(CharType.ARGUMENT_NUMBER)
        }
    })

    it('handles mixed args with aligned kinds and arguments', () => {
        const text = "message|tag('x', abc, 1)"
        const parser = parseText(text)
        const transformer = parser.columns[0].transformers[0]
        expect(transformer.argumentKinds).toEqual(['str', 'col', 'int'])
        expect(transformer.arguments).toEqual(['x', 'abc', 1])
    })

    it('treats `2abc` (matches neither INT_RE nor FLOAT_RE) as col', () => {
        const text = 'message|tag(2abc)'
        const parser = parseText(text)
        const transformer = parser.columns[0].transformers[0]
        expect(transformer.argumentKinds).toEqual(['col'])
        expect(transformer.arguments).toEqual(['2abc'])
    })

    it('empty quoted string produces empty str kind', () => {
        const text = "message|tag('')"
        const parser = parseText(text)
        const transformer = parser.columns[0].transformers[0]
        expect(transformer.arguments).toEqual([''])
        expect(transformer.argumentKinds).toEqual(['str'])
    })

    it('renderer argument kinds are populated in parallel', () => {
        const text = "message as m|widget('a', foo, 2)"
        const parser = parseText(text, { transformers: false, renderers: true })
        const renderer = parser.columns[0].renderers[0]
        expect(renderer.argumentKinds).toEqual(['str', 'col', 'int'])
        expect(renderer.arguments).toEqual(['a', 'foo', 2])
    })
})
