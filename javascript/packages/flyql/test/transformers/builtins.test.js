import { describe, it, expect } from 'vitest'
import { UpperTransformer, LowerTransformer, LenTransformer, SplitTransformer } from '../../src/transformers/index.js'
import { Type } from '../../src/flyql_type.js'

describe('UpperTransformer', () => {
    const t = new UpperTransformer()

    it('has correct name', () => {
        expect(t.name).toBe('upper')
    })

    it('has correct input type', () => {
        expect(t.inputType).toBe(Type.String)
    })

    it('has correct output type', () => {
        expect(t.outputType).toBe(Type.String)
    })

    it.each([
        ['clickhouse', 'col', 'upper(col)'],
        ['postgresql', 'col', 'UPPER(col)'],
        ['starrocks', 'col', 'UPPER(col)'],
    ])('sql(%s, %s) returns %s', (dialect, col, expected) => {
        expect(t.sql(dialect, col)).toBe(expected)
    })

    it('apply converts to uppercase', () => {
        expect(t.apply('hello')).toBe('HELLO')
    })

    it('apply handles mixed case', () => {
        expect(t.apply('Hello World')).toBe('HELLO WORLD')
    })
})

describe('LowerTransformer', () => {
    const t = new LowerTransformer()

    it('has correct name', () => {
        expect(t.name).toBe('lower')
    })

    it('has correct input type', () => {
        expect(t.inputType).toBe(Type.String)
    })

    it('has correct output type', () => {
        expect(t.outputType).toBe(Type.String)
    })

    it.each([
        ['clickhouse', 'col', 'lower(col)'],
        ['postgresql', 'col', 'LOWER(col)'],
        ['starrocks', 'col', 'LOWER(col)'],
    ])('sql(%s, %s) returns %s', (dialect, col, expected) => {
        expect(t.sql(dialect, col)).toBe(expected)
    })

    it('apply converts to lowercase', () => {
        expect(t.apply('HELLO')).toBe('hello')
    })
})

describe('LenTransformer', () => {
    const t = new LenTransformer()

    it('has correct name', () => {
        expect(t.name).toBe('len')
    })

    it('has correct input type', () => {
        expect(t.inputType).toBe(Type.String)
    })

    it('has correct output type', () => {
        expect(t.outputType).toBe(Type.Int)
    })

    it.each([
        ['clickhouse', 'col', 'length(col)'],
        ['postgresql', 'col', 'LENGTH(col)'],
        ['starrocks', 'col', 'LENGTH(col)'],
    ])('sql(%s, %s) returns %s', (dialect, col, expected) => {
        expect(t.sql(dialect, col)).toBe(expected)
    })

    it('apply returns string length', () => {
        expect(t.apply('hello')).toBe(5)
    })

    it('apply returns 0 for empty string', () => {
        expect(t.apply('')).toBe(0)
    })
})

describe('SplitTransformer', () => {
    const t = new SplitTransformer()

    it('has correct name', () => {
        expect(t.name).toBe('split')
    })

    it('has correct input type', () => {
        expect(t.inputType).toBe(Type.String)
    })

    it('has correct output type', () => {
        expect(t.outputType).toBe(Type.Array)
    })

    it('has argument schema', () => {
        expect(t.argSchema).toHaveLength(1)
        expect(t.argSchema[0].type).toBe(Type.String)
        expect(t.argSchema[0].required).toBe(false)
    })

    describe('sql', () => {
        it('clickhouse single-char delimiter uses splitByChar', () => {
            expect(t.sql('clickhouse', 'col', [','])).toBe("splitByChar(',', col)")
        })

        it('clickhouse multi-char delimiter uses splitByString', () => {
            expect(t.sql('clickhouse', 'col', ['::'])).toBe("splitByString('::', col)")
        })

        it('postgresql uses STRING_TO_ARRAY', () => {
            expect(t.sql('postgresql', 'col', [','])).toBe("STRING_TO_ARRAY(col, ',')")
        })

        it('starrocks uses SPLIT', () => {
            expect(t.sql('starrocks', 'col', [','])).toBe("SPLIT(col, ',')")
        })

        it('defaults to comma delimiter', () => {
            expect(t.sql('clickhouse', 'col')).toBe("splitByChar(',', col)")
        })
    })

    describe('apply', () => {
        it('splits by given delimiter', () => {
            expect(t.apply('a,b,c', [','])).toEqual(['a', 'b', 'c'])
        })

        it('defaults to comma delimiter', () => {
            expect(t.apply('a,b,c')).toEqual(['a', 'b', 'c'])
        })
    })

    describe('sql escaping', () => {
        it('escapes single quotes in delimiter', () => {
            const sql = t.sql('clickhouse', 'col', ["'"])
            expect(sql).toContain("\\'")
        })

        it('escapes backslashes in delimiter', () => {
            const sql = t.sql('clickhouse', 'col', ['\\'])
            expect(sql).toContain('\\\\')
        })

        it('escapes backslash-quote sequence correctly', () => {
            const sql = t.sql('clickhouse', 'col', ["\\'"])
            const innerMatch = sql.match(/splitByString\('(.+)',/)
            expect(innerMatch).not.toBeNull()
            expect(innerMatch[1]).toBe("\\\\\\'")
        })
    })
})

describe('SQL nesting', () => {
    it('upper then len in postgresql', () => {
        const upper = new UpperTransformer()
        const len = new LenTransformer()
        let result = 'field'
        result = upper.sql('postgresql', result)
        result = len.sql('postgresql', result)
        expect(result).toBe('LENGTH(UPPER(field))')
    })

    it('lower then len in clickhouse', () => {
        const lower = new LowerTransformer()
        const len = new LenTransformer()
        let result = 'field'
        result = lower.sql('clickhouse', result)
        result = len.sql('clickhouse', result)
        expect(result).toBe('length(lower(field))')
    })
})
