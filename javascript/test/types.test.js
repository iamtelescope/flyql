import { describe, it, expect } from 'vitest'
import { ValueType } from '../src/types.js'

describe('ValueType', () => {
    const expectedValues = {
        INTEGER: 'integer',
        BIGINT: 'bigint',
        FLOAT: 'float',
        STRING: 'string',
        BOOLEAN: 'boolean',
        NULL: 'null',
        ARRAY: 'array',
        COLUMN: 'column',
    }

    it('should have all 8 type constants', () => {
        expect(Object.keys(ValueType)).toHaveLength(8)
    })

    it.each(Object.entries(expectedValues))('should have %s = "%s"', (key, value) => {
        expect(ValueType[key]).toBe(value)
    })

    it('should be frozen', () => {
        expect(Object.isFrozen(ValueType)).toBe(true)
    })

    it('should be importable from main index', async () => {
        const { ValueType: VT } = await import('../src/index.js')
        expect(VT).toBe(ValueType)
    })
})
