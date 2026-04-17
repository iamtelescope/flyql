import { describe, it, expect } from 'vitest'
import { generateSelect, newColumn } from '../../../src/generators/clickhouse/index.js'

describe('ClickHouse generateSelect — renderer-suffix in alias (regression)', () => {
    const columns = { message: newColumn({ name: 'message', type: 'String' }) }

    it('|tag no-arg: alias is clean and |tag is absent from the column expression', () => {
        const result = generateSelect('message as msg|tag', columns)
        expect(result.columns[0].alias).toBe('msg')
        expect(result.columns[0].sqlExpr).toBe('message AS msg')
        expect(result.columns[0].sqlExpr).not.toContain('|')
        expect(result.columns[0].sqlExpr).not.toContain('tag')
    })

    it("|tag('red') with string arg: alias is clean and 'red' is absent", () => {
        const result = generateSelect("message as msg|tag('red')", columns)
        expect(result.columns[0].alias).toBe('msg')
        expect(result.columns[0].sqlExpr).toBe('message AS msg')
        expect(result.columns[0].sqlExpr).not.toContain('|')
        expect(result.columns[0].sqlExpr).not.toContain('tag')
        expect(result.columns[0].sqlExpr).not.toContain('red')
    })

    it('|upper transformer + |tag renderer: emits lowercase upper(...) and clean alias', () => {
        const result = generateSelect('message|upper as msg|tag', columns)
        expect(result.columns[0].alias).toBe('msg')
        expect(result.columns[0].sqlExpr).toBe('upper(message) AS msg')
        expect(result.columns[0].sqlExpr).not.toContain('|')
        expect(result.columns[0].sqlExpr).not.toContain('tag')
    })

    it("|tag('red', 'blue') with multiple string args: alias clean, args absent", () => {
        const result = generateSelect("message as msg|tag('red', 'blue')", columns)
        expect(result.columns[0].alias).toBe('msg')
        expect(result.columns[0].sqlExpr).toBe('message AS msg')
        expect(result.columns[0].sqlExpr).not.toContain('|')
        expect(result.columns[0].sqlExpr).not.toContain('tag')
        expect(result.columns[0].sqlExpr).not.toContain('red')
        expect(result.columns[0].sqlExpr).not.toContain('blue')
    })

    it('message|tag without AS must raise (renderers require an alias)', () => {
        expect(() => generateSelect('message|tag', columns)).toThrow()
    })
})
