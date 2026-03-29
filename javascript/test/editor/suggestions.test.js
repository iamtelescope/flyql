import { describe, it, expect } from 'vitest'
import {
    getKeySuggestions,
    getOperatorSuggestions,
    getBoolSuggestions,
    prepareSuggestionValues,
    getInsertRange,
    getTransformerSuggestions,
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

        it('all non-pipe items have operator type', () => {
            const result = getOperatorSuggestions(TEST_COLUMNS, 'host')
            for (const item of result) {
                if (item.label !== '|') {
                    expect(item.type).toBe('operator')
                }
            }
        })

        it('includes pipe suggestion for string column', () => {
            const result = getOperatorSuggestions(TEST_COLUMNS, 'host')
            const pipe = result.find((s) => s.label === '|')
            expect(pipe).toBeTruthy()
            expect(pipe.type).toBe('transformer')
            expect(pipe.detail).toBe('transformer (pipe)')
        })

        it('omits pipe suggestion for number column with no int-input transformers', () => {
            const result = getOperatorSuggestions(TEST_COLUMNS, 'count')
            const pipe = result.find((s) => s.label === '|')
            expect(pipe).toBeUndefined()
        })

        it('includes IN operator with spaces', () => {
            const result = getOperatorSuggestions(TEST_COLUMNS, 'status')
            const inOp = result.find((s) => s.label === 'in')
            expect(inOp).toBeTruthy()
            expect(inOp.insertText).toBe(' in ')
        })

        it('includes HAS operator with spaces', () => {
            const result = getOperatorSuggestions(TEST_COLUMNS, 'status')
            const hasOp = result.find((s) => s.label === 'has')
            expect(hasOp).toBeTruthy()
            expect(hasOp.insertText).toBe(' has ')
            expect(hasOp.detail).toBe('has value')
        })

        it('sorts HAS after IN', () => {
            const result = getOperatorSuggestions(TEST_COLUMNS, 'status')
            const labels = result.map((s) => s.label)
            const inIndex = labels.indexOf('in')
            const hasIndex = labels.indexOf('has')
            expect(inIndex).toBeGreaterThanOrEqual(0)
            expect(hasIndex).toBeGreaterThan(inIndex)
        })

        it('excludes HAS for number columns', () => {
            const result = getOperatorSuggestions(TEST_COLUMNS, 'count')
            const labels = result.map((s) => s.label)
            expect(labels).not.toContain('has')
        })

        it('includes HAS for string columns', () => {
            const result = getOperatorSuggestions(TEST_COLUMNS, 'host')
            const labels = result.map((s) => s.label)
            expect(labels).toContain('has')
        })

        it('does not suggest NOT_HAS directly', () => {
            const result = getOperatorSuggestions(TEST_COLUMNS, 'host')
            const labels = result.map((s) => s.label)
            expect(labels).not.toContain('not has')
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

        it('returns transformer range covering only prefix after pipe', () => {
            const ctx = { expecting: 'transformer', transformerPrefix: 'up', textBeforeCursor: 'host|up' }
            const range = getInsertRange(ctx, 'host|up', 'transformer')
            expect(range.start).toBe(5)
            expect(range.end).toBe(7)
        })

        it('returns transformer range at pipe with no prefix', () => {
            const ctx = { expecting: 'transformer', transformerPrefix: '', textBeforeCursor: 'host|' }
            const range = getInsertRange(ctx, 'host|', 'transformer')
            expect(range.start).toBe(5)
            expect(range.end).toBe(5)
        })
    })

    describe('getTransformerSuggestions', () => {
        it('returns all string-input transformers for string column', () => {
            const ctx = { transformerBaseKey: 'host', transformerPrefix: '', transformerChain: '' }
            const result = getTransformerSuggestions(TEST_COLUMNS, ctx)
            expect(result.length).toBe(4)
            expect(result.map((s) => s.label)).toContain('upper')
            expect(result.map((s) => s.label)).toContain('lower')
            expect(result.map((s) => s.label)).toContain('len')
            expect(result.map((s) => s.label)).toContain('split')
        })

        it('sets type to transformer on all suggestions', () => {
            const ctx = { transformerBaseKey: 'host', transformerPrefix: '', transformerChain: '' }
            const result = getTransformerSuggestions(TEST_COLUMNS, ctx)
            for (const s of result) {
                expect(s.type).toBe('transformer')
            }
        })

        it('includes type detail string', () => {
            const ctx = { transformerBaseKey: 'host', transformerPrefix: '', transformerChain: '' }
            const result = getTransformerSuggestions(TEST_COLUMNS, ctx)
            const upper = result.find((s) => s.label === 'upper')
            expect(upper.detail).toBe('string → string')
            const len = result.find((s) => s.label === 'len')
            expect(len.detail).toBe('string → int')
        })

        it('filters by prefix', () => {
            const ctx = { transformerBaseKey: 'host', transformerPrefix: 'up', transformerChain: '' }
            const result = getTransformerSuggestions(TEST_COLUMNS, ctx)
            expect(result.length).toBe(1)
            expect(result[0].label).toBe('upper')
        })

        it('filters by chained output type', () => {
            const ctx = { transformerBaseKey: 'host', transformerPrefix: '', transformerChain: 'upper' }
            const result = getTransformerSuggestions(TEST_COLUMNS, ctx)
            // upper outputs string, so string-input transformers shown
            expect(result.length).toBe(4)
        })

        it('returns empty for int-input after len (no int-input builtins)', () => {
            const ctx = { transformerBaseKey: 'host', transformerPrefix: '', transformerChain: 'len' }
            const result = getTransformerSuggestions(TEST_COLUMNS, ctx)
            // len outputs int, no built-in transformers accept int input
            expect(result.length).toBe(0)
        })

        it('returns no transformers for number column (no int-input builtins)', () => {
            const ctx = { transformerBaseKey: 'count', transformerPrefix: '', transformerChain: '' }
            const result = getTransformerSuggestions(TEST_COLUMNS, ctx)
            expect(result.length).toBe(0)
        })

        it('returns all transformers for unknown column', () => {
            const ctx = { transformerBaseKey: 'unknown', transformerPrefix: '', transformerChain: '' }
            const result = getTransformerSuggestions(TEST_COLUMNS, ctx)
            expect(result.length).toBe(4)
        })

        it('filters by prefix case-insensitively', () => {
            const ctx = { transformerBaseKey: 'host', transformerPrefix: 'UP', transformerChain: '' }
            const result = getTransformerSuggestions(TEST_COLUMNS, ctx)
            expect(result.length).toBe(1)
            expect(result[0].label).toBe('upper')
        })
    })
})
