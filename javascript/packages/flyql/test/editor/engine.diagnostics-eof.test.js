import { describe, it, expect } from 'vitest'
import { EditorEngine } from '../../src/editor/engine.js'
import { Column, ColumnSchema } from '../../src/core/index.js'
import { Type } from '../../src/index.js'

function makeEngine() {
    const schema = ColumnSchema.fromColumns([new Column('service', Type.String, { matchName: 'service' })])
    return new EditorEngine(schema)
}

function runQuery(engine, query) {
    engine.setQuery(query)
    return engine.getDiagnostics()
}

describe('EditorEngine — EOF suppression (Issue #3)', () => {
    it('AC 9: trailing garbage after complete comparison is reported', () => {
        const engine = makeEngine()
        const query = 'service = "api-gateway" 2'
        const diags = runQuery(engine, query)
        expect(diags).toHaveLength(1)
        const trailingPos = query.length - 1 // position of `2`
        expect(diags[0].range.start).toBe(trailingPos)
        expect(diags[0].range.end).toBe(query.length)
        expect(diags[0].code).toBe('syntax')
        expect(diags[0].severity).toBe('error')
        expect(diags[0].message.length).toBeGreaterThan(0)
    })

    it('AC 10: trailing non-bool-op char (`x`) at EOF is reported', () => {
        const engine = makeEngine()
        const query = 'service = "a" x'
        const diags = runQuery(engine, query)
        expect(diags).toHaveLength(1)
        const pos = query.length - 1
        expect(diags[0].range.start).toBe(pos)
        expect(diags[0].range.end).toBe(query.length)
    })

    it('AC 11: in-progress bool-op chars stay quiet (a/an/o/`an `)', () => {
        const engine = makeEngine()
        for (const q of ['service = "a" a', 'service = "a" an', 'service = "a" o', 'service = "a" an ']) {
            expect(runQuery(engine, q)).toEqual([])
        }
    })

    it('AC 12: other EOF errnos remain suppressed (`service @` hits a different errno)', () => {
        const engine = makeEngine()
        expect(runQuery(engine, 'service @')).toEqual([])
    })

    it('AC 13: incomplete non-error input stays quiet', () => {
        const engine = makeEngine()
        expect(runQuery(engine, 'service ')).toEqual([])
        expect(runQuery(engine, 'service = ')).toEqual([])
        expect(runQuery(engine, '')).toEqual([])
    })
})
