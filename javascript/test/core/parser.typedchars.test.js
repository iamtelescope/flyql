import { describe, it, expect } from 'vitest'
import { parse, CharType } from '../../src/index.js'

describe('Parser typedChars functionality', () => {
    it('should collect typed chars for simple expression', () => {
        const parser = parse('key=value')

        expect(parser.typedChars).toHaveLength(9) // k,e,y,=,v,a,l,u,e

        // Check types for each character
        expect(parser.typedChars[0][1]).toBe(CharType.KEY) // k
        expect(parser.typedChars[1][1]).toBe(CharType.KEY) // e
        expect(parser.typedChars[2][1]).toBe(CharType.KEY) // y
        expect(parser.typedChars[3][1]).toBe(CharType.OPERATOR) // =
        expect(parser.typedChars[4][1]).toBe(CharType.VALUE) // v
        expect(parser.typedChars[5][1]).toBe(CharType.VALUE) // a
        expect(parser.typedChars[6][1]).toBe(CharType.VALUE) // l
        expect(parser.typedChars[7][1]).toBe(CharType.VALUE) // u
        expect(parser.typedChars[8][1]).toBe(CharType.VALUE) // e

        // Check values
        expect(parser.typedChars[0][0].value).toBe('k')
        expect(parser.typedChars[3][0].value).toBe('=')
        expect(parser.typedChars[4][0].value).toBe('v')
    })

    it('should handle spaces correctly', () => {
        const parser = parse('key = value')

        expect(parser.typedChars).toHaveLength(11)

        // key
        expect(parser.typedChars[0][1]).toBe(CharType.KEY)
        expect(parser.typedChars[1][1]).toBe(CharType.KEY)
        expect(parser.typedChars[2][1]).toBe(CharType.KEY)

        // space
        expect(parser.typedChars[3][1]).toBe(CharType.SPACE)

        // operator
        expect(parser.typedChars[4][1]).toBe(CharType.OPERATOR)

        // space
        expect(parser.typedChars[5][1]).toBe(CharType.SPACE)

        // value
        expect(parser.typedChars[6][1]).toBe(CharType.VALUE)
    })

    it('should handle quoted strings', () => {
        const parser = parse('name="john doe"')

        const quotedChars = parser.typedChars.filter(([_, type]) => type === CharType.VALUE)

        // Check total chars: n,a,m,e,=,",j,o,h,n, ,d,o,e,"
        expect(parser.typedChars).toHaveLength(15)

        // VALUE chars: Opening quote + john doe + closing quote
        expect(quotedChars).toHaveLength(10) // "john doe"

        // First quote
        expect(quotedChars[0][0].value).toBe('"')
        // Space in the middle (should be at position 5: ",j,o,h,n, )
        expect(quotedChars[5][0].value).toBe(' ')
        // Last VALUE char is the closing quote
        expect(quotedChars[quotedChars.length - 1][0].value).toBe('"')
    })

    it('should handle single quoted strings', () => {
        const parser = parse("name='john'")

        const quotedChars = parser.typedChars.filter(([_, type]) => type === CharType.VALUE)
        expect(quotedChars).toHaveLength(6) // 'john' including quotes
    })

    it('should handle boolean operators', () => {
        const parser = parse('a=1 and b=2')

        // Find 'and' operator chars
        const andChars = []
        for (let i = 0; i < parser.typedChars.length - 2; i++) {
            if (
                parser.typedChars[i][0].value === 'a' &&
                parser.typedChars[i + 1][0].value === 'n' &&
                parser.typedChars[i + 2][0].value === 'd' &&
                parser.typedChars[i][1] === CharType.OPERATOR
            ) {
                andChars.push(i)
            }
        }

        expect(andChars.length).toBeGreaterThan(0)
    })

    it('should handle parentheses', () => {
        const parser = parse('(key=value)')

        // First char should be operator (open paren)
        expect(parser.typedChars[0][1]).toBe(CharType.OPERATOR)
        expect(parser.typedChars[0][0].value).toBe('(')

        // Last char should be operator (close paren)
        const lastChar = parser.typedChars[parser.typedChars.length - 1]
        expect(lastChar[1]).toBe(CharType.OPERATOR)
        expect(lastChar[0].value).toBe(')')
    })

    it('should handle complex operators', () => {
        const parser = parse('count>=10')

        // Find operator chars
        const operatorChars = parser.typedChars.filter(([_, type]) => type === CharType.OPERATOR)
        expect(operatorChars).toHaveLength(2) // >=
        expect(operatorChars[0][0].value).toBe('>')
        expect(operatorChars[1][0].value).toBe('=')
    })

    it('should handle regex operators', () => {
        const parser = parse('msg~pattern')

        const operatorChars = parser.typedChars.filter(([_, type]) => type === CharType.OPERATOR)
        expect(operatorChars).toHaveLength(1)
        expect(operatorChars[0][0].value).toBe('~')
    })

    it('should handle complex query', () => {
        const parser = parse('status=200 and (service=api or service=web)')

        // Should have all types
        const types = new Set(parser.typedChars.map(([_, type]) => type))
        expect(types.has(CharType.KEY)).toBe(true)
        expect(types.has(CharType.VALUE)).toBe(true)
        expect(types.has(CharType.OPERATOR)).toBe(true)
        expect(types.has(CharType.SPACE)).toBe(true)
    })

    it('should preserve position information', () => {
        const parser = parse('a=b')

        expect(parser.typedChars[0][0].pos).toBe(0) // 'a'
        expect(parser.typedChars[1][0].pos).toBe(1) // '='
        expect(parser.typedChars[2][0].pos).toBe(2) // 'b'
    })

    it('should assign PIPE type to pipe character in key', () => {
        const parser = parse('host|upper=value')

        // h,o,s,t = KEY; | = PIPE; u,p,p,e,r = TRANSFORMER; = = OPERATOR; v,a,l,u,e = VALUE
        expect(parser.typedChars[0][1]).toBe(CharType.KEY) // h
        expect(parser.typedChars[3][1]).toBe(CharType.KEY) // t
        expect(parser.typedChars[4][1]).toBe(CharType.PIPE) // |
        expect(parser.typedChars[4][0].value).toBe('|')
        expect(parser.typedChars[5][1]).toBe(CharType.TRANSFORMER) // u
        expect(parser.typedChars[9][1]).toBe(CharType.TRANSFORMER) // r
        expect(parser.typedChars[10][1]).toBe(CharType.OPERATOR) // =
        expect(parser.typedChars[11][1]).toBe(CharType.VALUE) // v
    })

    it('should handle chained transformers', () => {
        const parser = parse('field|lower|len>10')

        // f,i,e,l,d = KEY; | = PIPE; l,o,w,e,r = TRANSFORMER; | = PIPE; l,e,n = TRANSFORMER; > = OPERATOR; 1,0 = VALUE
        expect(parser.typedChars[4][1]).toBe(CharType.KEY) // d
        expect(parser.typedChars[5][1]).toBe(CharType.PIPE) // first |
        expect(parser.typedChars[6][1]).toBe(CharType.TRANSFORMER) // l (lower)
        expect(parser.typedChars[10][1]).toBe(CharType.TRANSFORMER) // r (lower)
        expect(parser.typedChars[11][1]).toBe(CharType.PIPE) // second |
        expect(parser.typedChars[12][1]).toBe(CharType.TRANSFORMER) // l (len)
        expect(parser.typedChars[14][1]).toBe(CharType.TRANSFORMER) // n (len)
        expect(parser.typedChars[15][1]).toBe(CharType.OPERATOR) // >
    })

    it('should handle transformer with spaces around operator', () => {
        const parser = parse('message|upper = "ERROR"')

        // message = KEY (7); | = PIPE; upper = TRANSFORMER (5); space; = = OPERATOR; space; "ERROR" = VALUE
        const types = parser.typedChars.map(([_, type]) => type)
        // message chars
        for (let i = 0; i < 7; i++) expect(types[i]).toBe(CharType.KEY)
        // pipe
        expect(types[7]).toBe(CharType.PIPE)
        // upper
        for (let i = 8; i < 13; i++) expect(types[i]).toBe(CharType.TRANSFORMER)
        // space
        expect(types[13]).toBe(CharType.SPACE)
        // =
        expect(types[14]).toBe(CharType.OPERATOR)
    })

    it('should not use PIPE/TRANSFORMER types for keys without pipe', () => {
        const parser = parse('status=info')

        const types = new Set(parser.typedChars.map(([_, type]) => type))
        expect(types.has(CharType.PIPE)).toBe(false)
        expect(types.has(CharType.TRANSFORMER)).toBe(false)
    })
})
