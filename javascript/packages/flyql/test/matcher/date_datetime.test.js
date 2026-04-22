import { describe, it, expect, vi } from 'vitest'
import { Evaluator } from '../../src/matcher/evaluator.js'
import { ColumnSchema } from '../../src/core/column.js'
import { parse } from '../../src/core/parser.js'
import { Record } from '../../src/matcher/record.js'

function schemaOf(raw) {
    return ColumnSchema.fromPlainObject(raw)
}

function evalQuery(query, data, schema) {
    const evaluator = new Evaluator({ columns: schema })
    const ast = parse(query).root
    return evaluator.evaluate(ast, new Record(data))
}

describe('Native Date values through DateTime schema', () => {
    it('Date instance compares correctly against ISO literal', () => {
        const schema = schemaOf({ ts: { type: 'datetime' } })
        const rec = { ts: new Date('2026-04-06T21:00:00Z') }
        expect(evalQuery("ts > '2026-04-06T20:00:00Z'", rec, schema)).toBe(true)
        expect(evalQuery("ts < '2026-04-06T20:00:00Z'", rec, schema)).toBe(false)
    })

    it('numeric ms with no unit (default) is treated as ms', () => {
        const schema = schemaOf({ ts: { type: 'datetime' } })
        const rec = { ts: Date.parse('2026-04-06T21:00:00Z') }
        expect(evalQuery("ts > '2026-04-06T20:00:00Z'", rec, schema)).toBe(true)
    })

    it('numeric epoch seconds with unit="s" coerces correctly', () => {
        const schema = schemaOf({ ts: { type: 'datetime', unit: 's' } })
        const rec = { ts: 1712434800 }
        expect(evalQuery("ts > '2020-01-01T00:00:00Z'", rec, schema)).toBe(true)
        expect(evalQuery("ts > '2030-01-01T00:00:00Z'", rec, schema)).toBe(false)
    })

    it('space-separator ISO string works via pre-replacement', () => {
        const schema = schemaOf({ ts: { type: 'datetime' } })
        const rec = { ts: '2026-04-06 21:00:00Z' }
        expect(evalQuery("ts > '2026-04-06T20:00:00Z'", rec, schema)).toBe(true)
    })

    it('unparseable string returns false (record skipped)', () => {
        const schema = schemaOf({ ts: { type: 'datetime' } })
        const rec = { ts: 'garbage' }
        expect(evalQuery("ts > '2026-01-01T00:00:00Z'", rec, schema)).toBe(false)
    })

    it('DST fall-back picks earlier occurrence', () => {
        const schema = schemaOf({ ts: { type: 'datetime', tz: 'America/New_York' } })
        const rec = { ts: '2026-11-01 01:30:00' }
        // Earlier (EDT) = 05:30 UTC; Later (EST) = 06:30 UTC.
        expect(evalQuery("ts < '2026-11-01T06:00:00Z'", rec, schema)).toBe(true)
        expect(evalQuery("ts > '2026-11-01T06:00:00Z'", rec, schema)).toBe(false)

        // AC 26: exact-ms parity pin with Python/Go (earlier = 1793511000000ms).
        const evaluator = new Evaluator({ columns: schema })
        const ms = evaluator._coerceToMs('2026-11-01 01:30:00', schema.get('ts'))
        expect(ms).toBe(1793511000000)
    })

    it('DST spring-forward (nonexistent) returns false', () => {
        const schema = schemaOf({ ts: { type: 'datetime', tz: 'America/New_York' } })
        const rec = { ts: '2026-03-08 02:30:00' }
        expect(evalQuery("ts > '2026-01-01T00:00:00Z'", rec, schema)).toBe(false)
    })

    it('Date column truncates Date instance to day', () => {
        const schema = schemaOf({ event_day: { type: 'date' } })
        const rec = { event_day: new Date('2026-04-06T15:30:00Z') }
        // Suppress the expected Date-column migration warning.
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        try {
            expect(evalQuery("event_day > '2026-04-05'", rec, schema)).toBe(true)
            expect(evalQuery("event_day > '2026-04-06'", rec, schema)).toBe(false)
        } finally {
            warnSpy.mockRestore()
        }
    })

    it('Migration warning fires once per column for Date columns receiving datetime values', () => {
        const schema = schemaOf({ event_day: { type: 'date' } })
        const evaluator = new Evaluator({ columns: schema })
        const ast = parse("event_day > '2026-01-01'").root
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        try {
            for (let i = 0; i < 100; i++) {
                evaluator.evaluate(ast, new Record({ event_day: new Date('2026-04-06T15:00:00Z') }))
            }
            const migrationCalls = warnSpy.mock.calls.filter((call) => String(call[0]).includes('Type.DateTime'))
            expect(migrationCalls.length).toBe(1)
        } finally {
            warnSpy.mockRestore()
        }
    })

    it('Invalid tz degrades to UTC with one-time warning', () => {
        const schema = schemaOf({ ts: { type: 'datetime', tz: 'Not/A/Zone' } })
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        try {
            const rec = { ts: '2026-04-06 12:00:00' }
            expect(evalQuery("ts > '2020-01-01T00:00:00'", rec, schema)).toBe(true)
            const badTzWarns = warnSpy.mock.calls.filter((call) => String(call[0]).includes('invalid timezone'))
            expect(badTzWarns.length).toBeGreaterThanOrEqual(1)
        } finally {
            warnSpy.mockRestore()
        }
    })

    it('tz cache only accumulates distinct tz names', () => {
        const schema = schemaOf({ ts: { type: 'datetime', tz: 'Europe/Moscow' } })
        const evaluator = new Evaluator({ columns: schema })
        const ast = parse("ts > '2026-01-01T00:00:00'").root
        for (let i = 0; i < 500; i++) {
            evaluator.evaluate(ast, new Record({ ts: '2026-04-06 12:00:00' }))
        }
        // Only Europe/Moscow visited (UTC not touched for this schema).
        expect(evaluator._tzNamesSeen.size).toBe(1)
        expect(evaluator._tzNamesSeen.has('Europe/Moscow')).toBe(true)
    })
})
