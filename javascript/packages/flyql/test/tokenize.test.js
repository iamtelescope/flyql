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

    it("pins reproduction case: created_at > startOf('week')", () => {
        const tokens = tokenize("created_at > startOf('week')")
        const weekTok = tokens.find((t) => t.text === "'week'")
        expect(weekTok).toBeDefined()
        expect(weekTok.type).toBe('string')
        const closeTok = tokens[tokens.length - 1]
        expect(closeTok.text).toBe(')')
        expect(closeTok.type).toBe('flyqlOperator')
        const fnTok = tokens.find((t) => t.text === 'startOf')
        expect(fnTok).toBeDefined()
        expect(fnTok.type).toBe('flyqlFunction')
    })

    it('upgrades duration literals to NUMBER', () => {
        const cases = {
            't > ago(1h)': '1h',
            't > ago(1h30m)': '1h30m',
            't > ago(2w3d)': '2w3d',
        }
        for (const [input, expectedText] of Object.entries(cases)) {
            const tokens = tokenize(input)
            const numTok = tokens.find((t) => t.text === expectedText)
            expect(numTok, `input=${input}`).toBeDefined()
            expect(numTok.type).toBe('number')
        }
    })

    it('tokenizes mid-typing function calls with trailing ERROR', () => {
        // Author types `t > ago(`, cursor pending inside the call.
        const tokens = tokenize('t > ago(')
        const joined = tokens.map((t) => t.text).join('')
        expect(joined).toBe('t > ago(')
        // The function-name retype and `(`→OPERATOR must still fire even on
        // a partial parse.
        const fnTok = tokens.find((t) => t.text === 'ago')
        expect(fnTok?.type).toBe('flyqlFunction')
        const openTok = tokens.find((t) => t.text === '(')
        expect(openTok?.type).toBe('flyqlOperator')
    })

    it('tokenizes mid-typing with partial duration', () => {
        const tokens = tokenize('t > ago(1h')
        const joined = tokens.map((t) => t.text).join('')
        expect(joined).toBe('t > ago(1h')
        const fnTok = tokens.find((t) => t.text === 'ago')
        expect(fnTok?.type).toBe('flyqlFunction')
        const durTok = tokens.find((t) => t.text === '1h')
        expect(durTok?.type).toBe('number')
    })

    it('tokenizes a valid function call followed by a bool operator', () => {
        const tokens = tokenize('t > ago(1h) and status = 200')
        const joined = tokens.map((t) => t.text).join('')
        expect(joined).toBe('t > ago(1h) and status = 200')
        expect(tokens.find((t) => t.text === 'ago')?.type).toBe('flyqlFunction')
        expect(tokens.find((t) => t.text === '1h')?.type).toBe('number')
        expect(tokens.find((t) => t.text === 'and')?.type).toBe('flyqlOperator')
    })

    it('handles whitespace-only input by emitting a single SPACE token', () => {
        const tokens = tokenize('   ')
        expect(tokens).toHaveLength(1)
        expect(tokens[0]).toEqual({ text: '   ', type: 'space', start: 0, end: 3 })
    })

    it('does not upgrade plain identifiers as duration', () => {
        for (const input of ['x=whom', 'x=salt', 'x=dim']) {
            const tokens = tokenize(input)
            const last = tokens[tokens.length - 1]
            expect(last.type).toBe('flyqlColumn')
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
