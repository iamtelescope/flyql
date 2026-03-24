import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parse } from '../src/core/parser.js'
import { generateWhere, generateSelect, newColumn } from '../src/generators/clickhouse/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const testDataDir = path.join(__dirname, '..', '..', 'tests-data', 'e2e')

const CH_HOST = process.env.CLICKHOUSE_HOST || 'localhost'
const CH_PORT = process.env.CLICKHOUSE_HTTP_PORT || '18123'
const CH_USER = process.env.CLICKHOUSE_USER || 'flyql'
const CH_PASS = process.env.CLICKHOUSE_PASSWORD || 'flyql'
const REPORT_PATH = process.env.E2E_REPORT_JSON || ''

const reportResults = []

async function chQuery(sql) {
    const params = new URLSearchParams({ user: CH_USER, password: CH_PASS, default_format: 'JSONEachRow' })
    const url = `http://${CH_HOST}:${CH_PORT}/?${params}`
    const response = await fetch(url, {
        method: 'POST',
        body: sql,
    })
    const text = await response.text()
    if (!response.ok) {
        throw new Error(`ClickHouse error: ${text.trim()}`)
    }
    if (!text.trim()) return []
    return text
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
}

function loadJSON(filepath) {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'))
}

function buildColumns() {
    const colData = loadJSON(path.join(testDataDir, 'clickhouse', 'columns.json'))
    const columns = {}
    for (const [key, col] of Object.entries(colData.columns)) {
        columns[key] = newColumn(col.name, col.jsonstring, col.type, col.values)
    }
    return columns
}

describe('ClickHouse E2E', () => {
    let columns
    let chAvailable = false

    beforeAll(async () => {
        columns = buildColumns()
        try {
            const rows = await chQuery('SELECT 1 AS ok')
            chAvailable = rows.length > 0 && rows[0].ok === 1
        } catch {
            chAvailable = false
        }
    })

    afterAll(() => {
        if (REPORT_PATH && reportResults.length > 0) {
            try {
                let existing = { language: 'javascript', results: [] }
                if (fs.existsSync(REPORT_PATH)) {
                    try {
                        existing = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf-8'))
                    } catch { /* ignore parse errors */ }
                }
                existing.results = [...(existing.results || []), ...reportResults]
                fs.writeFileSync(REPORT_PATH, JSON.stringify(existing, null, 2))
            } catch (e) {
                console.error(`warn: could not write e2e report ${REPORT_PATH}: ${e.message}`)
            }
        }
    })

    describe('WHERE clause parity', () => {
        it.each(
            loadJSON(path.join(testDataDir, 'test_cases.json'))
                .tests.filter((tc) => tc.databases.includes('clickhouse'))
                .map((tc) => [tc.name, tc.flyql, tc.expected_ids]),
        )('%s: %s', async (name, flyql, expectedIds) => {
            const result = {
                kind: 'where',
                database: 'clickhouse',
                name,
                flyql,
                sql: '',
                expected_ids: expectedIds,
                returned_ids: [],
                passed: false,
                error: '',
            }

            if (!chAvailable) {
                result.error = 'ClickHouse not available'
                reportResults.push(result)
                return
            }

            try {
                const parsed = parse(flyql)
                if (parsed.error) {
                    result.error = `parse: ${parsed.error}`
                    reportResults.push(result)
                    expect.fail(result.error)
                    return
                }

                const sqlWhere = generateWhere(parsed.root, columns)
                result.sql = sqlWhere

                const query = `SELECT id FROM flyql_e2e_test WHERE ${sqlWhere} ORDER BY id`
                const rows = await chQuery(query)
                const returnedIds = rows.map((r) => r.id)
                result.returned_ids = returnedIds
                result.passed = JSON.stringify([...returnedIds].sort()) === JSON.stringify([...expectedIds].sort())

                reportResults.push(result)
                expect(returnedIds.sort()).toEqual([...expectedIds].sort())
            } catch (e) {
                result.error = e.message
                reportResults.push(result)
                throw e
            }
        })
    })

    describe('SELECT clause parity', () => {
        const selectTests = loadJSON(path.join(testDataDir, 'clickhouse', 'select_test_cases.json')).tests
        it.each(selectTests.map((tc) => [tc.name, tc.select_columns, tc.expected_rows]))(
            '%s',
            async (name, selectColumns, expectedRows) => {
                const result = {
                    kind: 'select',
                    database: 'clickhouse',
                    name,
                    select_columns: selectColumns,
                    sql: '',
                    expected_rows: expectedRows,
                    returned_rows: [],
                    passed: false,
                    error: '',
                }

                if (!chAvailable) {
                    result.error = 'ClickHouse not available'
                    reportResults.push(result)
                    return
                }

                try {
                    const selectResult = generateSelect(selectColumns, columns)
                    result.sql = selectResult.sql

                    const query = `SELECT ${selectResult.sql} FROM flyql_e2e_test ORDER BY id`
                    const rows = await chQuery(query)
                    const returnedRows = rows.map((r) => Object.values(r).map(String))
                    result.returned_rows = returnedRows
                    result.passed = JSON.stringify(returnedRows) === JSON.stringify(expectedRows)

                    reportResults.push(result)
                    expect(returnedRows).toEqual(expectedRows)
                } catch (e) {
                    result.error = e.message
                    reportResults.push(result)
                    throw e
                }
            },
        )
    })
})
