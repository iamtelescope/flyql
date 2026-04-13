import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parse } from 'flyql/core'
import { generateWhere, generateSelect, newColumn } from 'flyql/generators/starrocks'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const testDataDir = path.join(__dirname, '..', '..', 'tests-data', 'e2e')

const SR_HOST = process.env.STARROCKS_HOST || 'localhost'
const SR_HTTP_PORT = process.env.STARROCKS_HTTP_PORT || '18030'
const SR_USER = process.env.STARROCKS_USER || 'root'
const SR_PASS = process.env.STARROCKS_PASSWORD || ''
const REPORT_PATH = process.env.E2E_REPORT_JSON || ''

const reportResults = []

async function srQuery(sql) {
    const credentials = Buffer.from(`${SR_USER}:${SR_PASS}`).toString('base64')
    const url = `http://${SR_HOST}:${SR_HTTP_PORT}/api/v1/catalogs/default_catalog/databases/flyql_test/sql`
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${credentials}` },
        body: JSON.stringify({ query: `${sql};` }),
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`StarRocks HTTP error ${response.status}: ${text}`)

    const lines = text.trim().split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
    let colNames = []
    const rows = []
    for (const obj of lines) {
        if (obj.meta) colNames = obj.meta.map((m, i) => m.name || `col${i}`)
        else if (obj.data) {
            const row = {}
            colNames.forEach((n, i) => { row[n] = obj.data[i] })
            rows.push(row)
        }
    }
    return rows
}

function loadJSON(filepath) {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'))
}

function buildColumns() {
    const colData = loadJSON(path.join(testDataDir, 'starrocks', 'columns.json'))
    const columns = {}
    for (const [key, col] of Object.entries(colData.columns)) {
        columns[key] = newColumn(col.name, col.type, col.values)
    }
    return columns
}

function buildJoinColumns() {
    const colData = loadJSON(path.join(testDataDir, 'starrocks', 'join_columns.json'))
    const columns = {}
    for (const [key, col] of Object.entries(colData.columns)) {
        const column = newColumn(col.name, col.type, col.values)
        if (col.raw_identifier) {
            column.withRawIdentifier(col.raw_identifier)
        }
        columns[key] = column
    }
    return columns
}

describe('StarRocks E2E', () => {
    let columns
    let joinColumns
    let srAvailable = false

    beforeAll(async () => {
        columns = buildColumns()
        joinColumns = buildJoinColumns()
        try {
            const rows = await srQuery('SELECT 1 AS ok')
            srAvailable = rows.length > 0 && Number(rows[0].ok) === 1
        } catch { srAvailable = false }
    })

    afterAll(() => {
        if (REPORT_PATH && reportResults.length > 0) {
            try {
                let existing = { language: 'javascript', results: [] }
                if (fs.existsSync(REPORT_PATH)) {
                    try { existing = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf-8')) } catch {}
                }
                existing.results = [...(existing.results || []), ...reportResults]
                fs.writeFileSync(REPORT_PATH, JSON.stringify(existing, null, 2))
            } catch (e) {
                console.error(`warn: could not write e2e report: ${e.message}`)
            }
        }
    })

    describe('WHERE clause parity', () => {
        it.each(
            loadJSON(path.join(testDataDir, 'test_cases.json'))
                .tests.filter((tc) => tc.databases.includes('starrocks'))
                .map((tc) => [tc.name, tc.flyql, tc.expected_ids]),
        )('%s: %s', async (name, flyql, expectedIds) => {
            const result = { kind: 'where', database: 'starrocks', name, flyql, sql: '', expected_ids: expectedIds, returned_ids: [], passed: false, error: '' }
            if (!srAvailable) { result.error = 'StarRocks not available'; reportResults.push(result); return }
            try {
                const parsed = parse(flyql)
                if (parsed.error) { result.error = `parse: ${parsed.error}`; reportResults.push(result); expect.fail(result.error); return }
                const sqlWhere = generateWhere(parsed.root, columns)
                result.sql = sqlWhere
                const rows = await srQuery(`SELECT id FROM flyql_e2e_test WHERE ${sqlWhere} ORDER BY id`)
                const returnedIds = rows.map((r) => Number(r.id))
                result.returned_ids = returnedIds
                result.passed = JSON.stringify([...returnedIds].sort()) === JSON.stringify([...expectedIds].sort())
                reportResults.push(result)
                expect(returnedIds.sort()).toEqual([...expectedIds].sort())
            } catch (e) { result.error = e.message; reportResults.push(result); throw e }
        })
    })

    describe('JOIN WHERE clause parity', () => {
        it.each(
            loadJSON(path.join(testDataDir, 'join_test_cases.json'))
                .tests.filter((tc) => tc.databases.includes('starrocks'))
                .map((tc) => [tc.name, tc.flyql, tc.expected_ids]),
        )('%s: %s', async (name, flyql, expectedIds) => {
            const result = { kind: 'where', database: 'starrocks', name, flyql, sql: '', expected_ids: expectedIds, returned_ids: [], passed: false, error: '' }
            if (!srAvailable) { result.error = 'StarRocks not available'; reportResults.push(result); return }
            try {
                const parsed = parse(flyql)
                if (parsed.error) { result.error = `parse: ${parsed.error}`; reportResults.push(result); expect.fail(result.error); return }
                const sqlWhere = generateWhere(parsed.root, joinColumns)
                result.sql = sqlWhere
                const rows = await srQuery(`SELECT t.id FROM flyql_e2e_test t INNER JOIN flyql_e2e_related r ON t.id = r.test_id WHERE ${sqlWhere} ORDER BY t.id`)
                const returnedIds = rows.map((r) => Number(r.id))
                result.returned_ids = returnedIds
                result.passed = JSON.stringify([...returnedIds].sort()) === JSON.stringify([...expectedIds].sort())
                reportResults.push(result)
                expect(returnedIds.sort()).toEqual([...expectedIds].sort())
            } catch (e) { result.error = e.message; reportResults.push(result); throw e }
        })
    })

    describe('SELECT clause parity', () => {
        const selectTests = loadJSON(path.join(testDataDir, 'starrocks', 'select_test_cases.json')).tests
        it.each(selectTests.map((tc) => [tc.name, tc.select_columns, tc.expected_rows]))('%s', async (name, selectColumns, expectedRows) => {
            const result = { kind: 'select', database: 'starrocks', name, select_columns: selectColumns, sql: '', expected_rows: expectedRows, returned_rows: [], passed: false, error: '' }
            if (!srAvailable) { result.error = 'StarRocks not available'; reportResults.push(result); return }
            try {
                const selectResult = generateSelect(selectColumns, columns)
                result.sql = selectResult.sql
                const rows = await srQuery(`SELECT ${selectResult.sql} FROM flyql_e2e_test ORDER BY id`)
                const returnedRows = rows.map((r) => Object.values(r).map((v) => {
                    const s = String(v)
                    if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1)
                    return s
                }))
                result.returned_rows = returnedRows
                result.passed = JSON.stringify(returnedRows) === JSON.stringify(expectedRows)
                reportResults.push(result)
                expect(returnedRows).toEqual(expectedRows)
            } catch (e) { result.error = e.message; reportResults.push(result); throw e }
        })
    })

    describe('JOIN SELECT clause', () => {
        const joinSelectTests = loadJSON(path.join(testDataDir, 'starrocks', 'join_select_test_cases.json')).tests
        it.each(joinSelectTests.map((tc) => [tc.name, tc.select_columns, tc.expected_rows]))('%s', async (name, selectColumns, expectedRows) => {
            const result = { kind: 'select', database: 'starrocks', name, select_columns: selectColumns, sql: '', expected_rows: expectedRows, returned_rows: [], passed: false, error: '' }
            if (!srAvailable) { result.error = 'StarRocks not available'; reportResults.push(result); return }
            try {
                const selectResult = generateSelect(selectColumns, joinColumns)
                result.sql = selectResult.sql
                const rows = await srQuery(`SELECT ${selectResult.sql} FROM flyql_e2e_test t INNER JOIN flyql_e2e_related r ON t.id = r.test_id ORDER BY t.id`)
                const returnedRows = rows.map((r) => Object.values(r).map((v) => {
                    const s = String(v)
                    if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1)
                    return s
                }))
                result.returned_rows = returnedRows
                result.passed = JSON.stringify(returnedRows) === JSON.stringify(expectedRows)
                reportResults.push(result)
                expect(returnedRows).toEqual(expectedRows)
            } catch (e) { result.error = e.message; reportResults.push(result); throw e }
        })
    })
})
