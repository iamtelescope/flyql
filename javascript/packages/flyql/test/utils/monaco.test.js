import { describe, it, expect } from 'vitest'
import { parse } from '../../src/index.js'
import { generateMonacoTokens } from '../../src/utils/monaco.js'

describe('generateMonacoTokens', () => {
    it('should generate tokens for simple expression', () => {
        const parser = parse('key=value')
        const tokens = generateMonacoTokens(parser)

        expect(tokens).toBeInstanceOf(Array)
        expect(tokens.length).toBeGreaterThan(0)

        expect(tokens.length % 5).toBe(0)
    })

    it('should return empty array for parser without typedChars', () => {
        const parser = { typedChars: [] }
        const tokens = generateMonacoTokens(parser)

        expect(tokens).toEqual([])
    })

    it('should return empty array for parser with null typedChars', () => {
        const parser = { typedChars: null }
        const tokens = generateMonacoTokens(parser)

        expect(tokens).toEqual([])
    })

    it('should group consecutive chars of same type', () => {
        const parser = parse('hello=world')
        const tokens = generateMonacoTokens(parser)

        expect(tokens.length).toBe(15)
    })

    it('should handle numeric values', () => {
        const parser = parse('count=123')
        const tokens = generateMonacoTokens(parser)

        expect(tokens.length).toBeGreaterThan(0)
    })

    it('should handle quoted strings', () => {
        const parser = parse('name="john doe"')
        const tokens = generateMonacoTokens(parser)

        expect(tokens.length).toBeGreaterThan(0)
    })

    it('should handle boolean operators', () => {
        const parser = parse('a=1 and b=2')
        const tokens = generateMonacoTokens(parser)

        expect(tokens.length).toBeGreaterThan(0)
    })

    it('should handle complex expressions', () => {
        const parser = parse('status=200 and (service=api or service=web)')
        const tokens = generateMonacoTokens(parser)

        expect(tokens.length).toBeGreaterThan(0)
    })
})
