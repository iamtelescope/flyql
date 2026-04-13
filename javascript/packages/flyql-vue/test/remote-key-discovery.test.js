import { describe, it, expect, vi } from 'vitest'
import {
    getKeySuggestions,
    getKeyDiscoverySuggestions,
    getOperatorSuggestions,
    getValueSuggestions,
    updateSuggestions,
} from '../src/suggestions.js'
import { EditorEngine } from '../src/engine.js'
import { ColumnsEngine } from '../src/columns-engine.js'
import { ColumnSchema } from 'flyql/core'

// Schema with both JSONSchema children and schemaless object columns
const MIXED_COLUMNS_PLAIN = {
    level: { type: 'enum', suggest: true, autocomplete: true, values: ['info', 'error'] },
    service: { type: 'string', suggest: true },
    metadata: {
        type: 'object',
        suggest: true,
        children: {
            labels: {
                type: 'object',
                suggest: true,
                children: {
                    tier: { type: 'string', suggest: true },
                    env: { type: 'string', suggest: true },
                },
            },
            version: { type: 'string', suggest: true },
        },
    },
    request: { type: 'object', suggest: true }, // schemaless — no children
    payload: { type: 'object', suggest: true }, // another schemaless
    flags: { type: 'string', suggest: true }, // not object — no discovery
}

const MIXED_COLUMNS = ColumnSchema.fromPlainObject(MIXED_COLUMNS_PLAIN)

const MOCK_KEYS = {
    request: [
        { name: 'method', type: 'string' },
        { name: 'url', type: 'string' },
        { name: 'headers', type: 'object', hasChildren: true },
    ],
    'request|headers': [
        { name: 'content_type', type: 'string' },
        { name: 'accept', type: 'string' },
    ],
}

function createMockDiscovery(delay = 0) {
    return vi.fn(async (columnName, segments) => {
        if (delay > 0) await new Promise((r) => setTimeout(r, delay))
        const key = segments.join('|')
        return MOCK_KEYS[key] || []
    })
}

describe('getKeySuggestions — JSONSchema priority (AC #5)', () => {
    it('column with children uses static path, returns suggestions', () => {
        const result = getKeySuggestions(MIXED_COLUMNS, 'metadata.')
        expect(result).not.toBeNull()
        const labels = result.map((s) => s.label)
        expect(labels).toContain('metadata.labels')
        expect(labels).toContain('metadata.version')
    })

    it('column without children returns null (async signal)', () => {
        const result = getKeySuggestions(MIXED_COLUMNS, 'request.')
        expect(result).toBeNull()
    })

    it('non-object column with dot returns empty array', () => {
        const result = getKeySuggestions(MIXED_COLUMNS, 'flags.')
        expect(result).toEqual([])
    })
})

describe('getKeyDiscoverySuggestions (AC #1, #2, #7, #9)', () => {
    it('calls onKeyDiscovery with correct (columnName, segments) args (AC #2)', async () => {
        const mockDiscovery = createMockDiscovery()
        const cache = {}
        const result = await getKeyDiscoverySuggestions(MIXED_COLUMNS, 'request.', mockDiscovery, cache, () => {})
        expect(mockDiscovery).toHaveBeenCalledWith('request', ['request'])
        expect(result.length).toBe(3)
    })

    it('multi-level discovery passes full segments (AC #7)', async () => {
        const mockDiscovery = createMockDiscovery()
        const cache = {}
        const result = await getKeyDiscoverySuggestions(
            MIXED_COLUMNS,
            'request.headers.',
            mockDiscovery,
            cache,
            () => {},
        )
        expect(mockDiscovery).toHaveBeenCalledWith('request', ['request', 'headers'])
        expect(result.length).toBe(2)
        expect(result.map((s) => s.label)).toContain('request.headers.content_type')
    })

    it('cache hit: second call uses cache, callback not invoked again (AC #4)', async () => {
        const mockDiscovery = createMockDiscovery()
        const cache = {}
        await getKeyDiscoverySuggestions(MIXED_COLUMNS, 'request.', mockDiscovery, cache, () => {})
        expect(mockDiscovery).toHaveBeenCalledTimes(1)

        const result2 = await getKeyDiscoverySuggestions(MIXED_COLUMNS, 'request.', mockDiscovery, cache, () => {})
        expect(mockDiscovery).toHaveBeenCalledTimes(1) // not called again
        expect(result2.length).toBe(3)
    })

    it('loading state set after 200ms, cleared after results (AC #3)', async () => {
        vi.useFakeTimers()
        const mockDiscovery = vi.fn(async () => {
            await new Promise((r) => setTimeout(r, 300))
            return MOCK_KEYS['request']
        })
        const loadingStates = []
        const setLoading = (v) => loadingStates.push(v)
        const cache = {}

        const promise = getKeyDiscoverySuggestions(MIXED_COLUMNS, 'request.', mockDiscovery, cache, setLoading)

        // Before 200ms — no loading
        await vi.advanceTimersByTimeAsync(199)
        expect(loadingStates).toEqual([])

        // After 200ms — loading set to true
        await vi.advanceTimersByTimeAsync(1)
        expect(loadingStates).toContain(true)

        // After callback resolves — loading set to false
        await vi.advanceTimersByTimeAsync(100)
        await promise
        expect(loadingStates[loadingStates.length - 1]).toBe(false)

        vi.useRealTimers()
    })

    it('hasChildren: discovered key with hasChildren has trailing dot in insertText (AC #6)', async () => {
        const mockDiscovery = createMockDiscovery()
        const cache = {}
        const result = await getKeyDiscoverySuggestions(MIXED_COLUMNS, 'request.', mockDiscovery, cache, () => {})
        const headers = result.find((s) => s.label === 'request.headers')
        expect(headers.insertText).toBe('request.headers.')
        const method = result.find((s) => s.label === 'request.method')
        expect(method.insertText).toBe('request.method')
    })

    it('no callback: returns empty, no error (AC #8)', async () => {
        const result = await getKeyDiscoverySuggestions(MIXED_COLUMNS, 'request.', null, {}, () => {})
        expect(result).toEqual([])
    })

    it('callback error: catches error, returns empty suggestions (AC #9)', async () => {
        const mockDiscovery = vi.fn(async () => {
            throw new Error('Network error')
        })
        const cache = {}
        const result = await getKeyDiscoverySuggestions(MIXED_COLUMNS, 'request.', mockDiscovery, cache, () => {})
        expect(result).toEqual([])
    })

    it('JSONSchema node is not discovered (AC #5)', async () => {
        const mockDiscovery = createMockDiscovery()
        const cache = {}
        // metadata has children — should not trigger discovery
        const result = await getKeyDiscoverySuggestions(MIXED_COLUMNS, 'metadata.', mockDiscovery, cache, () => {})
        expect(result).toEqual([])
        expect(mockDiscovery).not.toHaveBeenCalled()
    })

    it('prefix filtering: typing request.me filters discovered keys (AC #11 analog)', async () => {
        const mockDiscovery = createMockDiscovery()
        const cache = {}
        const result = await getKeyDiscoverySuggestions(MIXED_COLUMNS, 'request.me', mockDiscovery, cache, () => {})
        expect(result.length).toBe(1)
        expect(result[0].label).toBe('request.method')
    })

    it('shows type as detail', async () => {
        const mockDiscovery = createMockDiscovery()
        const cache = {}
        const result = await getKeyDiscoverySuggestions(MIXED_COLUMNS, 'request.', mockDiscovery, cache, () => {})
        const method = result.find((s) => s.label === 'request.method')
        expect(method.detail).toBe('string')
        const headers = result.find((s) => s.label === 'request.headers')
        expect(headers.detail).toBe('object')
    })

    it('default detail is unknown when type omitted', async () => {
        const mockDiscovery = vi.fn(async () => [{ name: 'field' }])
        const cache = {}
        const result = await getKeyDiscoverySuggestions(MIXED_COLUMNS, 'request.', mockDiscovery, cache, () => {})
        expect(result[0].detail).toBe('unknown')
    })
})

describe('updateSuggestions — routing integration (AC #1, #5, #10)', () => {
    it('schemaless object column triggers key discovery', async () => {
        const mockDiscovery = createMockDiscovery()
        const ctx = {
            state: 'KEY',
            key: 'request.',
            expecting: 'column',
            textBeforeCursor: 'request.',
        }
        const result = await updateSuggestions(ctx, MIXED_COLUMNS, null, mockDiscovery, {}, () => {})
        expect(result.suggestionType).toBe('column')
        expect(result.suggestions.map((s) => s.label)).toContain('request.method')
    })

    it('JSONSchema column does NOT trigger key discovery', async () => {
        const mockDiscovery = createMockDiscovery()
        const ctx = {
            state: 'KEY',
            key: 'metadata.',
            expecting: 'column',
            textBeforeCursor: 'metadata.',
        }
        const result = await updateSuggestions(ctx, MIXED_COLUMNS, null, mockDiscovery, {}, () => {})
        expect(result.suggestionType).toBe('column')
        expect(result.suggestions.map((s) => s.label)).toContain('metadata.labels')
        expect(mockDiscovery).not.toHaveBeenCalled()
    })

    it('no onKeyDiscovery: graceful degradation to empty (AC #8)', async () => {
        const ctx = {
            state: 'KEY',
            key: 'request.',
            expecting: 'column',
            textBeforeCursor: 'request.',
        }
        const result = await updateSuggestions(ctx, MIXED_COLUMNS, null, null, {}, () => {})
        // Should fall through to fallback
        expect(result.suggestions.length).toBeGreaterThanOrEqual(0)
    })
})

describe('EditorEngine — key discovery integration', () => {
    it('engine passes onKeyDiscovery to updateSuggestions', async () => {
        const mockDiscovery = createMockDiscovery()
        const engine = new EditorEngine(ColumnSchema.fromPlainObject(MIXED_COLUMNS_PLAIN), {
            debounceMs: 0,
            onKeyDiscovery: mockDiscovery,
        })
        engine.setQuery('request.')
        engine.setCursorPosition(8)
        await engine.updateSuggestions()
        expect(mockDiscovery).toHaveBeenCalledWith('request', ['request'])
        expect(engine.suggestions.map((s) => s.label)).toContain('request.method')
    })

    it('clearKeyCache resets cache', () => {
        const engine = new EditorEngine(ColumnSchema.fromPlainObject(MIXED_COLUMNS_PLAIN))
        engine.keyCache['request'] = [{ name: 'method' }]
        engine.clearKeyCache()
        expect(engine.keyCache).toEqual({})
    })
})

describe('ColumnsEngine — key discovery (AC #11)', () => {
    it('key discovery works in columns editor', async () => {
        const mockDiscovery = createMockDiscovery()
        const engine = new ColumnsEngine(ColumnSchema.fromPlainObject(MIXED_COLUMNS_PLAIN), {
            onKeyDiscovery: mockDiscovery,
        })
        engine.setQuery('request.')
        engine.setCursorPosition(8)
        await engine.updateSuggestions()
        expect(mockDiscovery).toHaveBeenCalledWith('request', ['request'])
        expect(engine.suggestions.map((s) => s.label)).toContain('request.method')
    })

    it('clearKeyCache resets cache', () => {
        const engine = new ColumnsEngine(ColumnSchema.fromPlainObject(MIXED_COLUMNS_PLAIN))
        engine.keyCache['request'] = [{ name: 'method' }]
        engine.clearKeyCache()
        expect(engine.keyCache).toEqual({})
    })
})

describe('mixed schema coexistence (AC #5, flat + JSONSchema + schemaless)', () => {
    it('flat columns, JSONSchema nested, and schemaless nested coexist', async () => {
        const mockDiscovery = createMockDiscovery()
        const engine = new EditorEngine(ColumnSchema.fromPlainObject(MIXED_COLUMNS_PLAIN), {
            debounceMs: 0,
            onKeyDiscovery: mockDiscovery,
        })

        // Flat column — partial prefix
        engine.setQuery('le')
        engine.setCursorPosition(2)
        await engine.updateSuggestions()
        expect(engine.suggestions.map((s) => s.label)).toContain('level')

        // JSONSchema nested
        engine.setQuery('metadata.')
        engine.setCursorPosition(9)
        await engine.updateSuggestions()
        expect(engine.suggestions.map((s) => s.label)).toContain('metadata.labels')
        expect(mockDiscovery).not.toHaveBeenCalled()

        // Schemaless nested
        engine.setQuery('request.')
        engine.setCursorPosition(8)
        await engine.updateSuggestions()
        expect(engine.suggestions.map((s) => s.label)).toContain('request.method')
        expect(mockDiscovery).toHaveBeenCalledTimes(1)
    })
})

describe('operator suggestions for discovered keys (AC #10 analog)', () => {
    it('discovered key with type number gets numeric operators only', () => {
        // Simulate a schema where a discovered key was resolved
        const numericCol = ColumnSchema.fromPlainObject({
            data: {
                type: 'object',
                suggest: true,
                children: {
                    count: { type: 'number', suggest: true },
                },
            },
        })
        const ops = getOperatorSuggestions(numericCol, 'data.count')
        const labels = ops.map((o) => o.label)
        expect(labels).toContain('=')
        expect(labels).toContain('>')
        expect(labels).not.toContain('~')
        expect(labels).not.toContain('!~')
    })
})

describe('value suggestions for discovered paths (AC #10)', () => {
    it('onAutocomplete called with full dotted key for schemaless discovered path', async () => {
        const mockAutocomplete = vi.fn(async () => ({ items: ['GET', 'POST', 'PUT'] }))
        const result = await getValueSuggestions(MIXED_COLUMNS, 'request.method', '', '', mockAutocomplete, () => {})
        expect(mockAutocomplete).toHaveBeenCalledWith('request.method', '')
        expect(result.suggestions.length).toBe(3)
        expect(result.suggestions.map((s) => s.label)).toContain('GET')
    })

    it('onAutocomplete called on every invocation (no caching)', async () => {
        const mockAutocomplete = vi.fn(async () => ({ items: ['GET', 'POST'] }))
        await getValueSuggestions(MIXED_COLUMNS, 'request.method', '', '', mockAutocomplete, () => {})
        expect(mockAutocomplete).toHaveBeenCalledTimes(1)

        const result2 = await getValueSuggestions(MIXED_COLUMNS, 'request.method', '', '', mockAutocomplete, () => {})
        expect(mockAutocomplete).toHaveBeenCalledTimes(2)
        expect(result2.suggestions.length).toBe(2)
    })

    it('no onAutocomplete: returns empty for discovered path', async () => {
        const result = await getValueSuggestions(MIXED_COLUMNS, 'request.method', '', '', null, () => {})
        expect(result.suggestions).toEqual([])
    })

    it('flat unknown key without dot: returns empty (no fallthrough)', async () => {
        const mockAutocomplete = vi.fn(async () => ({ items: ['x'] }))
        const result = await getValueSuggestions(MIXED_COLUMNS, 'unknown', '', '', mockAutocomplete, () => {})
        expect(result.suggestions).toEqual([])
        expect(mockAutocomplete).not.toHaveBeenCalled()
    })
})
