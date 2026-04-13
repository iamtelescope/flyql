import { describe, it, expect } from 'vitest'
import { tokenize } from '../src/tokenize.js'
import { loadTokenizeTestData } from './helpers.js'

const queryFixture = loadTokenizeTestData('query_tokens.json')
const columnsFixture = loadTokenizeTestData('columns_tokens.json')

const REQUIRED_QUERY_TYPES = [
    'flyqlKey',
    'flyqlOperator',
    'number',
    'string',
    'flyqlBoolean',
    'flyqlNull',
    'flyqlColumn',
    'flyqlError',
]

const ROUND_TRIP_INPUTS = ['a=1', "x='y'", "status=200 and region='us-east'", 'count>=10 or count<0', 'key=*wild']

describe('tokenize (query mode)', () => {
    it.each(queryFixture.tests)('$name', ({ input, expected_tokens }) => {
        expect(tokenize(input)).toEqual(expected_tokens)
    })

    it('returns empty array for empty input', () => {
        expect(tokenize('')).toEqual([])
    })

    it('round-trips hand-crafted query inputs', () => {
        for (const input of ROUND_TRIP_INPUTS) {
            const tokens = tokenize(input)
            const joined = tokens.map((t) => t.text).join('')
            expect(joined).toBe(input)
        }
    })

    it('offsets are monotonic across fixture and round-trip inputs', () => {
        const allInputs = [...queryFixture.tests.map((tc) => tc.input), ...ROUND_TRIP_INPUTS]
        for (const input of allInputs) {
            const tokens = tokenize(input)
            if (input === '') {
                expect(tokens).toEqual([])
                continue
            }
            expect(tokens[0].start).toBe(0)
            for (let i = 0; i < tokens.length; i++) {
                expect(tokens[i].end).toBeGreaterThan(tokens[i].start)
                if (i > 0) {
                    expect(tokens[i].start).toBe(tokens[i - 1].end)
                }
            }
            expect(tokens[tokens.length - 1].end).toBe(input.length)
        }
    })

    it('fixture covers required CharType values', () => {
        const seen = new Set()
        for (const tc of queryFixture.tests) {
            for (const tok of tc.expected_tokens) {
                seen.add(tok.type)
            }
        }
        for (const required of REQUIRED_QUERY_TYPES) {
            expect(seen.has(required)).toBe(true)
        }
    })

    it('fixture never contains unupgraded flyqlValue', () => {
        for (const tc of queryFixture.tests) {
            for (const tok of tc.expected_tokens) {
                expect(tok.type).not.toBe('flyqlValue')
            }
        }
    })

    it('rejects Infinity, NaN, and 0x1F as NUMBER', () => {
        for (const input of ['val=Infinity', 'val=NaN', 'val=0x1F']) {
            const tokens = tokenize(input)
            const valueToken = tokens[tokens.length - 1]
            expect(valueToken.type).toBe('flyqlColumn')
        }
    })
})

describe('tokenize (columns mode)', () => {
    it.each(columnsFixture.tests)('$name', ({ input, expected_tokens }) => {
        expect(tokenize(input, { mode: 'columns' })).toEqual(expected_tokens)
    })

    it('columns fixture offsets are monotonic', () => {
        for (const tc of columnsFixture.tests) {
            const tokens = tokenize(tc.input, { mode: 'columns' })
            if (tc.input === '') {
                expect(tokens).toEqual([])
                continue
            }
            expect(tokens[0].start).toBe(0)
            for (let i = 0; i < tokens.length; i++) {
                expect(tokens[i].end).toBeGreaterThan(tokens[i].start)
                if (i > 0) {
                    expect(tokens[i].start).toBe(tokens[i - 1].end)
                }
            }
            expect(tokens[tokens.length - 1].end).toBe(tc.input.length)
        }
    })
})
