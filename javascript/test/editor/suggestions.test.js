import { describe, it, expect } from 'vitest'
import {
    getKeySuggestions,
    getOperatorSuggestions,
    getBoolSuggestions,
    prepareSuggestionValues,
    getInsertRange,
} from '../../src/editor/suggestions.js'

const TEST_COLUMNS = {
    status: { type: 'enum', suggest: true, autocomplete: true, values: ['debug', 'info'] },
    host: { type: 'string', suggest: true, autocomplete: true },
    count: { type: 'number', suggest: true, autocomplete: false },
    hidden: { type: 'string', suggest: false, autocomplete: false },
}

describe('suggestions', () => {
    describe('getKeySuggestions', () => {
        it('returns all suggestable columns with no prefix', () => {
            const result = getKeySuggestions(TEST_COLUMNS, '')
            expect(result.length).toBe(3)
            expect(result.map((s) => s.label)).toContain('status')
            expect(result.map((s) => s.label)).toContain('host')
            expect(result.map((s) => s.label)).toContain('count')
        })

        it('excludes non-suggest columns', () => {
            const result = getKeySuggestions(TEST_COLUMNS, '')
            expect(result.map((s) => s.label)).not.toContain('hidden')
        })

        it('filters by prefix', () => {
            const result = getKeySuggestions(TEST_COLUMNS, 'sta')
            expect(result.length).toBe(1)
            expect(result[0].label).toBe('status')
        })

        it('case-insensitive filter', () => {
            const result = getKeySuggestions(TEST_COLUMNS, 'STA')
            expect(result.length).toBe(1)
        })

        it('returns empty for no match', () => {
            const result = getKeySuggestions(TEST_COLUMNS, 'zzz')
            expect(result.length).toBe(0)
        })

        it('includes type detail', () => {
            const result = getKeySuggestions(TEST_COLUMNS, 'status')
            expect(result[0].detail).toBe('enum')
            expect(result[0].type).toBe('column')
        })
    })

    describe('getOperatorSuggestions', () => {
        it('excludes regex for enum columns', () => {
            const result = getOperatorSuggestions(TEST_COLUMNS, 'status')
            const labels = result.map((s) => s.label)
            expect(labels).not.toContain('~')
            expect(labels).not.toContain('!~')
        })

        it('excludes regex for number columns', () => {
            const result = getOperatorSuggestions(TEST_COLUMNS, 'count')
            const labels = result.map((s) => s.label)
            expect(labels).not.toContain('~')
            expect(labels).not.toContain('!~')
            expect(labels).toContain('=')
            expect(labels).toContain('>')
            expect(labels).toContain('<')
        })

        it('includes regex for string columns', () => {
            const result = getOperatorSuggestions(TEST_COLUMNS, 'host')
            const labels = result.map((s) => s.label)
            expect(labels).toContain('~')
            expect(labels).toContain('!~')
        })

        it('all items have operator type', () => {
            const result = getOperatorSuggestions(TEST_COLUMNS, 'host')
            for (const item of result) {
                expect(item.type).toBe('operator')
            }
        })

        it('includes IN operator with spaces', () => {
            const result = getOperatorSuggestions(TEST_COLUMNS, 'status')
            const inOp = result.find((s) => s.label === 'in')
            expect(inOp).toBeTruthy()
            expect(inOp.insertText).toBe(' in ')
        })
    })

    describe('getBoolSuggestions', () => {
        it('returns 4 boolean suggestions', () => {
            const result = getBoolSuggestions()
            expect(result.length).toBe(4)
        })

        it('includes and, or, and not, or not', () => {
            const result = getBoolSuggestions()
            const labels = result.map((s) => s.label)
            expect(labels).toContain('and')
            expect(labels).toContain('or')
            expect(labels).toContain('and not')
            expect(labels).toContain('or not')
        })

        it('all items have boolOp type', () => {
            for (const item of getBoolSuggestions()) {
                expect(item.type).toBe('boolOp')
            }
        })
    })

    describe('prepareSuggestionValues', () => {
        it('wraps string values in quotes', () => {
            const result = prepareSuggestionValues(['hello'], '', '')
            expect(result[0].insertText).toBe('"hello"')
        })

        it('does not wrap numeric string values', () => {
            const result = prepareSuggestionValues(['42'], '', '')
            expect(result[0].insertText).toBe('42')
        })

        it('respects existing quote char', () => {
            const result = prepareSuggestionValues(['hello'], "'", '')
            expect(result[0].insertText).toBe("hello'")
        })

        it('filters by prefix', () => {
            const result = prepareSuggestionValues(['info', 'debug'], '', 'in')
            expect(result.length).toBe(1)
            expect(result[0].label).toBe('info')
        })

        it('escapes quotes in values', () => {
            const result = prepareSuggestionValues(['he"llo'], '', '')
            expect(result[0].insertText).toBe('"he\\"llo"')
        })
    })

    describe('getInsertRange', () => {
        it('returns zero range for null context', () => {
            const range = getInsertRange(null, '', '')
            expect(range).toEqual({ start: 0, end: 0 })
        })

        it('returns key range for column expecting', () => {
            const ctx = { expecting: 'column', key: 'sta', textBeforeCursor: 'sta' }
            const range = getInsertRange(ctx, 'sta', 'column')
            expect(range.start).toBe(0)
            expect(range.end).toBe(3)
        })

        it('returns cursor range for operator insert on column', () => {
            const ctx = { expecting: 'column', key: 'status', textBeforeCursor: 'status' }
            const range = getInsertRange(ctx, 'status', 'operator')
            expect(range.start).toBe(6)
        })

        it('returns value range for value expecting', () => {
            const ctx = {
                expecting: 'value',
                value: 'in',
                quoteChar: '',
                textBeforeCursor: 'status=in',
            }
            const range = getInsertRange(ctx, 'status=in', 'value')
            expect(range.start).toBe(7)
        })

        it('returns boolOp range', () => {
            const ctx = { expecting: 'boolOp', textBeforeCursor: 'status=info an' }
            const range = getInsertRange(ctx, 'status=info an', 'boolOp')
            expect(range.start).toBe(12)
        })
    })
})
