import { describe, it, expect } from 'vitest'
import { Parser, ParserError, parse } from '../../src/core/parser.js'
import { State } from '../../src/core/constants.js'

describe('raiseError parameter', () => {
    it('should throw exception when raiseError=true', () => {
        const parser = new Parser()
        expect(() => parser.parse('invalid@input', true)).toThrow(ParserError)
    })

    it('should not throw exception when raiseError=false', () => {
        const parser = new Parser()
        parser.parse('invalid@input', false)
        expect(parser.state).toBe(State.ERROR)
        expect(parser.errno).toBeGreaterThan(0)
    })

    it('should not throw exception on empty input when raiseError=false', () => {
        const parser = new Parser()
        parser.parse('', false)
        expect(parser.state).toBe(State.ERROR)
        expect(parser.errno).toBe(24)
    })
})

describe('ignoreLastChar parameter', () => {
    it('should validate final state when ignoreLastChar=false', () => {
        const parser = new Parser()
        expect(() => parser.parse('key', true, false)).toThrow(ParserError)
    })

    it('should skip validation when ignoreLastChar=true', () => {
        const parser = new Parser()
        parser.parse('key', true, true)
        expect(parser.state).toBe(State.KEY)
        expect(parser.key).toBe('key')
    })

    it('should handle empty input when ignoreLastChar=true', () => {
        const parser = new Parser()
        parser.parse('', true, true)
        expect(parser.state).toBe(State.INITIAL)
    })

    it('should handle incomplete operator when ignoreLastChar=true', () => {
        const parser = new Parser()
        parser.parse('key=', true, true)
        expect(parser.state).toBe(State.KEY_VALUE_OPERATOR)
        expect(parser.keyValueOperator).toBe('=')
    })
})

describe('parameter combinations', () => {
    it('should handle raiseError=false and ignoreLastChar=false', () => {
        const parser = new Parser()
        parser.parse('key', false, false)
        expect(parser.state).toBe(State.ERROR)
        expect(parser.errno).toBe(25)
    })

    it('should handle raiseError=true and ignoreLastChar=true', () => {
        const parser = new Parser()
        expect(() => parser.parse('invalid@', true, true)).toThrow(ParserError)
    })
})

describe('parse function parameters', () => {
    it('should pass parameters to Parser.parse', () => {
        const parser = parse('invalid@', false, true)
        expect(parser.state).toBe(State.ERROR)
    })

    it('should use default parameters', () => {
        expect(() => parse('invalid@')).toThrow(ParserError)
    })
})

describe('incremental parsing', () => {
    it('should handle incomplete states', () => {
        const testCases = [
            ['k', State.KEY],
            ['key ', State.EXPECT_OPERATOR],
            ['key =', State.KEY_VALUE_OPERATOR],
            ['key=v', State.VALUE],
        ]

        testCases.forEach(([input, expectedState]) => {
            const parser = new Parser()
            parser.parse(input, true, true)
            expect(parser.state).toBe(expectedState)
        })
    })
})
