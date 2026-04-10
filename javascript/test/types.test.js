import { describe, it, expect } from 'vitest'
import {} from '../src/literal/literal_kind.js'
import { LiteralKind } from '../src/literal/literal_kind.js'

describe('LiteralKind', () => {
    const expectedValues = {
        INTEGER: 'integer',
        BIGINT: 'bigint',
        FLOAT: 'float',
        STRING: 'string',
        BOOLEAN: 'boolean',
        NULL: 'null',
        ARRAY: 'array',
        COLUMN: 'column',
        FUNCTION: 'function',
        PARAMETER: 'parameter',
    }

    it('should have all 10 type constants', () => {
        expect(Object.keys(LiteralKind)).toHaveLength(10)
    })

    it.each(Object.entries(expectedValues))('should have %s = "%s"', (key, value) => {
        expect(LiteralKind[key]).toBe(value)
    })

    it('should be frozen', () => {
        expect(Object.isFrozen(LiteralKind)).toBe(true)
    })

    it('should be importable from main index', async () => {
        const { LiteralKind: VT } = await import('../src/index.js')
        expect(VT).toBe(LiteralKind)
    })
})
