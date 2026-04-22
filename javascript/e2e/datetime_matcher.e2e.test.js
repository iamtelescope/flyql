import { describe, it, expect, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Evaluator } from 'flyql/matcher'
import { parse } from 'flyql/core'
import { ColumnSchema } from 'flyql/core'
import { Record } from 'flyql/matcher'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const testDataDir = path.join(__dirname, '..', '..', 'tests-data', 'e2e')
const REPORT_PATH = process.env.E2E_REPORT_JSON || ''

const reportResults = []

function loadJSON(filepath) {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'))
}

const fixture = loadJSON(path.join(testDataDir, 'datetime_matcher_cases.json'))
const schema = ColumnSchema.fromPlainObject(fixture.columns)
const rows = fixture.rows

// Silence the expected Date-column migration warning + invalid-tz noise
// for rows that carry datetime-shaped data on `event_day`. The matcher
// warns correctly; surfacing it per-test clutters the e2e output.
const origWarn = console.warn
console.warn = () => {}

describe('Datetime Matcher E2E', () => {
    afterAll(() => {
        console.warn = origWarn
        if (REPORT_PATH && reportResults.length > 0) {
            try {
                let existing = { language: 'javascript', results: [] }
                if (fs.existsSync(REPORT_PATH)) {
                    try {
                        existing = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf-8'))
                    } catch {}
                }
                existing.results = [...(existing.results || []), ...reportResults]
                fs.writeFileSync(REPORT_PATH, JSON.stringify(existing, null, 2))
            } catch (e) {
                console.error(`warn: could not write e2e report: ${e.message}`)
            }
        }
    })

    describe('cross-language parity', () => {
        it.each(fixture.tests.map((tc) => [tc.name, tc.query, tc.expected_ids]))(
            '%s',
            (name, query, expectedIds) => {
                const result = {
                    kind: 'where',
                    database: 'matcher',
                    name: `datetime/${name}`,
                    flyql: query,
                    sql: '(in-memory)',
                    expected_ids: expectedIds,
                    returned_ids: [],
                    passed: false,
                    error: '',
                }
                try {
                    const ast = parse(query).root
                    const evaluator = new Evaluator({ columns: schema })
                    const matchedIds = rows
                        .filter((row) => evaluator.evaluate(ast, new Record(row)))
                        .map((row) => row.id)
                    result.returned_ids = matchedIds
                    result.passed =
                        JSON.stringify([...matchedIds].sort()) === JSON.stringify([...expectedIds].sort())
                    reportResults.push(result)
                    expect([...matchedIds].sort()).toEqual([...expectedIds].sort())
                } catch (e) {
                    result.error = e.message
                    reportResults.push(result)
                    throw e
                }
            },
        )
    })

    // Native-type parity: rows built with JS `Date` objects rather than ISO
    // strings. The Python and Go e2e counterparts build rows with the same
    // instants using their native types (datetime/date and time.Time); the
    // orchestrator's cross-language dedup pins parity. DST fold semantics
    // are exercised via ISO strings in the shared fixture above — here we
    // stick to tz-unambiguous UTC instants.
    describe('native-type parity', () => {
        const nativeSchema = ColumnSchema.fromPlainObject({
            id: { type: 'int' },
            ts_utc: { type: 'datetime' },
            event_day: { type: 'date' },
        })
        const nativeRows = [
            {
                id: 1,
                ts_utc: new Date(Date.UTC(2026, 3, 6, 10, 0, 0, 0)),
                event_day: new Date(Date.UTC(2026, 3, 6, 0, 0, 0, 0)),
            },
            {
                id: 2,
                ts_utc: new Date(Date.UTC(2026, 3, 6, 12, 0, 0, 0)),
                event_day: new Date(Date.UTC(2026, 3, 7, 0, 0, 0, 0)),
            },
            {
                id: 3,
                // 500µs sub-ms precision ignored by Date (ms-only); still
                // covers the sub-ms-truncation semantic in the query.
                ts_utc: new Date(Date.UTC(2026, 3, 6, 21, 0, 0, 0)),
                event_day: new Date(Date.UTC(2026, 3, 5, 0, 0, 0, 0)),
            },
        ]
        const nativeCases = [
            ['native_datetime_gt', "ts_utc > '2026-04-06T11:00:00Z'", [2, 3]],
            ['native_datetime_lt', "ts_utc < '2026-04-06T11:00:00Z'", [1]],
            ['native_datetime_ms_truncation', "ts_utc = '2026-04-06T21:00:00Z'", [3]],
            ['native_datetime_ne', "ts_utc != '2026-04-06T10:00:00Z'", [2, 3]],
            ['native_date_equals', "event_day = '2026-04-06'", [1]],
            ['native_date_range', "event_day > '2026-04-05' and event_day <= '2026-04-07'", [1, 2]],
            ['native_date_in_list', "event_day in ['2026-04-05', '2026-04-07']", [2, 3]],
        ]
        it.each(nativeCases)('%s', (name, query, expectedIds) => {
            const result = {
                kind: 'where',
                database: 'matcher',
                name: `datetime/${name}`,
                flyql: query,
                sql: '(in-memory, native types)',
                expected_ids: expectedIds,
                returned_ids: [],
                passed: false,
                error: '',
            }
            try {
                const ast = parse(query).root
                const evaluator = new Evaluator({ columns: nativeSchema })
                const matchedIds = nativeRows
                    .filter((row) => evaluator.evaluate(ast, new Record(row)))
                    .map((row) => row.id)
                result.returned_ids = matchedIds
                result.passed =
                    JSON.stringify([...matchedIds].sort()) === JSON.stringify([...expectedIds].sort())
                reportResults.push(result)
                expect([...matchedIds].sort()).toEqual([...expectedIds].sort())
            } catch (e) {
                result.error = e.message
                reportResults.push(result)
                throw e
            }
        })
    })
})
