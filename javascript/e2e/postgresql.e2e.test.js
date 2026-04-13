import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parse } from 'flyql/core'
import { generateWhere, generateSelect, newColumn } from 'flyql/generators/postgresql'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const testDataDir = path.join(__dirname, '..', '..', 'tests-data', 'e2e')

const PG_HOST = process.env.POSTGRESQL_HOST || 'localhost'
const PG_PORT = process.env.POSTGRESQL_PORT || '15432'
const PG_USER = process.env.POSTGRESQL_USER || 'flyql'
const PG_PASS = process.env.POSTGRESQL_PASSWORD || 'flyql'
const PG_DB = process.env.POSTGRESQL_DB || 'flyql_test'
const REPORT_PATH = process.env.E2E_REPORT_JSON || ''

const reportResults = []

async function pgQuery(sql) {
    const url = `postgres://${PG_USER}:${PG_PASS}@${PG_HOST}:${PG_PORT}/${PG_DB}`

    // Use pg-native or simple HTTP isn't available for PG, so we use a raw TCP approach.
    // Since we want zero deps, use the simple query protocol via node's net module.
    // However, for pragmatic e2e tests, we'll shell out to psql.
    const { execSync } = await import('child_process')
    const env = {
        ...process.env,
        PGHOST: PG_HOST,
        PGPORT: PG_PORT,
        PGUSER: PG_USER,
        PGPASSWORD: PG_PASS,
        PGDATABASE: PG_DB,
    }
    const result = execSync(`psql -t -A -F '\t' -c ${JSON.stringify(sql)}`, {
        env,
        encoding: 'utf-8',
        timeout: 10000,
    })
    const lines = result.trim().split('\n').filter((l) => l.trim() !== '')
    return lines
}

async function pgQueryRows(sql) {
    const lines = await pgQuery(sql)
    return lines.map((line) => line.split('\t'))
}

function loadJSON(filepath) {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'))
}

function buildColumns() {
    const colData = loadJSON(path.join(testDataDir, 'postgresql', 'columns.json'))
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

function buildJoinColumns() {
    const colData = loadJSON(path.join(testDataDir, 'postgresql', 'join_columns.json'))
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

describe('PostgreSQL E2E', () => {
    let columns
    let joinColumns
    let pgAvailable = false

    beforeAll(async () => {
        columns = buildColumns()
        joinColumns = buildJoinColumns()
        try {
            const lines = await pgQuery('SELECT 1 AS ok')
            pgAvailable = lines.length > 0 && lines[0].trim() === '1'
        } catch {
            pgAvailable = false
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
                .tests.filter((tc) => tc.databases.includes('postgresql'))
                .map((tc) => [tc.name, tc.flyql, tc.expected_ids]),
        )('%s: %s', async (name, flyql, expectedIds) => {
            const result = {
                kind: 'where',
                database: 'postgresql',
                name,
                flyql,
                sql: '',
                expected_ids: expectedIds,
                returned_ids: [],
                passed: false,
                error: '',
            }

            if (!pgAvailable) {
                result.error = 'PostgreSQL not available'
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
                const lines = await pgQuery(query)
                const returnedIds = lines.map((l) => parseInt(l.trim(), 10)).filter((n) => !isNaN(n))
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

    describe('JOIN WHERE clause parity', () => {
        it.each(
            loadJSON(path.join(testDataDir, 'join_test_cases.json'))
                .tests.filter((tc) => tc.databases.includes('postgresql'))
                .map((tc) => [tc.name, tc.flyql, tc.expected_ids]),
        )('%s: %s', async (name, flyql, expectedIds) => {
            const result = {
                kind: 'where',
                database: 'postgresql',
                name,
                flyql,
                sql: '',
                expected_ids: expectedIds,
                returned_ids: [],
                passed: false,
                error: '',
            }

            if (!pgAvailable) {
                result.error = 'PostgreSQL not available'
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

                const sqlWhere = generateWhere(parsed.root, joinColumns)
                result.sql = sqlWhere

                const query = `SELECT t.id FROM flyql_e2e_test t INNER JOIN flyql_e2e_related r ON t.id = r.test_id WHERE ${sqlWhere} ORDER BY t.id`
                const lines = await pgQuery(query)
                const returnedIds = lines.map((l) => parseInt(l.trim(), 10)).filter((n) => !isNaN(n))
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
        const selectTests = loadJSON(path.join(testDataDir, 'postgresql', 'select_test_cases.json')).tests

        it.each(selectTests.map((tc) => [tc.name, tc.select_columns, tc.expected_rows, tc.expected_column_names]))(
            '%s',
            async (name, selectColumns, expectedRows, expectedColumnNames) => {
                const result = {
                    kind: 'select',
                    database: 'postgresql',
                    name,
                    select_columns: selectColumns,
                    sql: '',
                    expected_rows: expectedRows,
                    returned_rows: [],
                    passed: false,
                    error: '',
                }

                if (!pgAvailable) {
                    result.error = 'PostgreSQL not available'
                    reportResults.push(result)
                    return
                }

                try {
                    const selectResult = generateSelect(selectColumns, columns)
                    result.sql = selectResult.sql

                    const query = `SELECT ${selectResult.sql} FROM flyql_e2e_test ORDER BY id`
                    const rawRows = await pgQueryRows(query)
                    // psql returns raw jsonb with JSON quotes (e.g., '"us-east"').
                    // Go's pgx driver auto-converts jsonb to string, stripping quotes.
                    // Strip surrounding JSON quotes to match expected text values.
                    const expectedColCount = expectedRows.length > 0 ? expectedRows[0].length : 0
                    const rows = rawRows.map((row) => {
                        const cleaned = row.map((cell) =>
                            cell.length >= 2 && cell.startsWith('"') && cell.endsWith('"')
                                ? cell.slice(1, -1)
                                : cell,
                        )
                        // psql omits trailing tab-separated NULLs; pad to expected column count
                        while (cleaned.length < expectedColCount) {
                            cleaned.push('')
                        }
                        return cleaned
                    })
                    result.returned_rows = rows
                    result.passed = JSON.stringify(rows) === JSON.stringify(expectedRows)

                    reportResults.push(result)
                    expect(rows).toEqual(expectedRows)
                } catch (e) {
                    result.error = e.message
                    reportResults.push(result)
                    throw e
                }
            },
        )
    })

    describe('JOIN SELECT clause', () => {
        const joinSelectTests = loadJSON(path.join(testDataDir, 'postgresql', 'join_select_test_cases.json')).tests

        it.each(joinSelectTests.map((tc) => [tc.name, tc.select_columns, tc.expected_rows, tc.expected_column_names]))(
            '%s',
            async (name, selectColumns, expectedRows, expectedColumnNames) => {
                const result = {
                    kind: 'select',
                    database: 'postgresql',
                    name,
                    select_columns: selectColumns,
                    sql: '',
                    expected_rows: expectedRows,
                    returned_rows: [],
                    passed: false,
                    error: '',
                }

                if (!pgAvailable) {
                    result.error = 'PostgreSQL not available'
                    reportResults.push(result)
                    return
                }

                try {
                    const selectResult = generateSelect(selectColumns, joinColumns)
                    result.sql = selectResult.sql

                    const query = `SELECT ${selectResult.sql} FROM flyql_e2e_test t INNER JOIN flyql_e2e_related r ON t.id = r.test_id ORDER BY t.id`
                    const rawRows = await pgQueryRows(query)
                    const expectedColCount = expectedRows.length > 0 ? expectedRows[0].length : 0
                    const rows = rawRows.map((row) => {
                        const cleaned = row.map((cell) =>
                            cell.length >= 2 && cell.startsWith('"') && cell.endsWith('"')
                                ? cell.slice(1, -1)
                                : cell,
                        )
                        while (cleaned.length < expectedColCount) {
                            cleaned.push('')
                        }
                        return cleaned
                    })
                    result.returned_rows = rows
                    result.passed = JSON.stringify(rows) === JSON.stringify(expectedRows)

                    reportResults.push(result)
                    expect(rows).toEqual(expectedRows)
                } catch (e) {
                    result.error = e.message
                    reportResults.push(result)
                    throw e
                }
            },
        )
    })
})
