import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { match } from 'flyql/matcher'
import { parse } from 'flyql/core'
import { generateWhere as chGenerateWhere, newColumn as chNewColumn } from 'flyql/generators/clickhouse'
import { generateWhere as srGenerateWhere, newColumn as srNewColumn } from 'flyql/generators/starrocks'
import { generateWhere as pgGenerateWhere, newColumn as pgNewColumn } from 'flyql/generators/postgresql'

// Cross-language Cyrillic (non-ASCII) e2e. Driven by tests-data/e2e/cyrillic.json:
// every case is evaluated in-memory (matcher) and, when listed, against the
// dedicated flyql_cyrillic_test table in each database. Identical expected_ids
// across Python/Go/JS prove cross-language parity. Regression coverage for the
// byte-vs-codepoint offset bug in the Go parser.

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const testDataDir = path.join(__dirname, '..', '..', 'tests-data', 'e2e')

const CYRILLIC_TABLE = 'flyql_cyrillic_test'

const CH_HOST = process.env.CLICKHOUSE_HOST || 'localhost'
const CH_PORT = process.env.CLICKHOUSE_HTTP_PORT || '18123'
const CH_USER = process.env.CLICKHOUSE_USER || 'flyql'
const CH_PASS = process.env.CLICKHOUSE_PASSWORD || 'flyql'

const SR_HOST = process.env.STARROCKS_HOST || 'localhost'
const SR_HTTP_PORT = process.env.STARROCKS_HTTP_PORT || '18030'
const SR_USER = process.env.STARROCKS_USER || 'root'
const SR_PASS = process.env.STARROCKS_PASSWORD || ''

const PG_HOST = process.env.POSTGRESQL_HOST || 'localhost'
const PG_PORT = process.env.POSTGRESQL_PORT || '15432'
const PG_USER = process.env.POSTGRESQL_USER || 'flyql'
const PG_PASS = process.env.POSTGRESQL_PASSWORD || 'flyql'
const PG_DB = process.env.POSTGRESQL_DB || 'flyql_test'

const REPORT_PATH = process.env.E2E_REPORT_JSON || ''
const reportResults = []

function loadJSON(filepath) {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'))
}

const fixture = loadJSON(path.join(testDataDir, 'cyrillic.json'))
const rows = fixture.rows
const cases = fixture.tests

function buildColumns(dialect, factory) {
    const colData = loadJSON(path.join(testDataDir, dialect, 'columns.json'))
    const columns = {}
    for (const [key, col] of Object.entries(colData.columns)) {
        columns[key] = factory({ name: col.name, type: col.type, values: col.values })
    }
    return columns
}

async function chQuery(sql) {
    const params = new URLSearchParams({ user: CH_USER, password: CH_PASS, default_format: 'JSONEachRow' })
    const response = await fetch(`http://${CH_HOST}:${CH_PORT}/?${params}`, { method: 'POST', body: sql })
    const text = await response.text()
    if (!response.ok) throw new Error(`ClickHouse error: ${text.trim()}`)
    if (!text.trim()) return []
    return text.trim().split('\n').map((line) => JSON.parse(line))
}

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
    const out = []
    for (const obj of lines) {
        if (obj.meta) colNames = obj.meta.map((m, i) => m.name || `col${i}`)
        else if (obj.data) {
            const row = {}
            colNames.forEach((n, i) => {
                row[n] = obj.data[i]
            })
            out.push(row)
        }
    }
    return out
}

async function pgQuery(sql) {
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
    return result.trim().split('\n').filter((l) => l.trim() !== '')
}

async function runClickHouse(flyqlExpr, columns) {
    const sqlWhere = chGenerateWhere(parse(flyqlExpr).root, columns)
    const result = await chQuery(`SELECT id FROM ${CYRILLIC_TABLE} WHERE ${sqlWhere} ORDER BY id`)
    return { sql: sqlWhere, ids: result.map((r) => Number(r.id)) }
}

async function runStarRocks(flyqlExpr, columns) {
    const sqlWhere = srGenerateWhere(parse(flyqlExpr).root, columns)
    const result = await srQuery(`SELECT id FROM ${CYRILLIC_TABLE} WHERE ${sqlWhere} ORDER BY id`)
    return { sql: sqlWhere, ids: result.map((r) => Number(r.id)) }
}

async function runPostgreSQL(flyqlExpr, columns) {
    const sqlWhere = pgGenerateWhere(parse(flyqlExpr).root, columns)
    const lines = await pgQuery(`SELECT id FROM ${CYRILLIC_TABLE} WHERE ${sqlWhere} ORDER BY id`)
    return { sql: sqlWhere, ids: lines.map((line) => Number(line.trim())) }
}

function writeReport() {
    if (!REPORT_PATH || reportResults.length === 0) return
    try {
        let existing = { language: 'javascript', results: [] }
        if (fs.existsSync(REPORT_PATH)) {
            try {
                existing = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf-8'))
            } catch {
                /* ignore */
            }
        }
        existing.results = [...(existing.results || []), ...reportResults]
        fs.writeFileSync(REPORT_PATH, JSON.stringify(existing, null, 2))
    } catch (e) {
        console.error(`warn: could not write e2e report: ${e.message}`)
    }
}

describe('Cyrillic Matcher E2E', () => {
    afterAll(writeReport)

    it.each(cases.map((tc) => [tc.name, tc.flyql, tc.expected_ids]))(
        '%s: %s',
        (name, flyql, expectedIds) => {
            const result = {
                kind: 'where',
                database: 'matcher',
                name,
                flyql,
                sql: '(in-memory)',
                expected_ids: expectedIds,
                returned_ids: [],
                passed: false,
                error: '',
            }
            try {
                const matchedIds = rows.filter((row) => match(flyql, row)).map((row) => row.id)
                result.returned_ids = matchedIds
                const sortedMatched = [...matchedIds].sort()
                const sortedExpected = [...expectedIds].sort()
                result.passed = JSON.stringify(sortedMatched) === JSON.stringify(sortedExpected)
                reportResults.push(result)
                expect(sortedMatched).toEqual(sortedExpected)
            } catch (e) {
                result.error = e.message
                reportResults.push(result)
                throw e
            }
        },
    )
})

describe('Cyrillic Database E2E', () => {
    let chCols
    let srCols
    let pgCols
    let chAvailable = false
    let srAvailable = false
    let pgAvailable = false

    beforeAll(async () => {
        chCols = buildColumns('clickhouse', chNewColumn)
        srCols = buildColumns('starrocks', srNewColumn)
        pgCols = buildColumns('postgresql', pgNewColumn)
        try {
            const r = await chQuery('SELECT 1 AS ok')
            chAvailable = r.length > 0 && Number(r[0].ok) === 1
        } catch {
            chAvailable = false
        }
        try {
            const r = await srQuery('SELECT 1 AS ok')
            srAvailable = r.length > 0 && Number(r[0].ok) === 1
        } catch {
            srAvailable = false
        }
        try {
            const lines = await pgQuery('SELECT 1 AS ok')
            pgAvailable = lines.length > 0 && lines[0].trim() === '1'
        } catch {
            pgAvailable = false
        }
    })

    afterAll(writeReport)

    const dbCases = cases.filter((tc) => (tc.databases || []).length > 0)

    it.each(dbCases.map((tc) => [tc.name, tc]))('%s', async (_name, tc) => {
        const expected = [...tc.expected_ids].sort((a, b) => a - b)

        const byDb = {
            clickhouse: { available: () => chAvailable, run: () => runClickHouse(tc.flyql, chCols) },
            starrocks: { available: () => srAvailable, run: () => runStarRocks(tc.flyql, srCols) },
            postgresql: { available: () => pgAvailable, run: () => runPostgreSQL(tc.flyql, pgCols) },
        }

        for (const db of tc.databases) {
            const runner = byDb[db]
            const result = {
                kind: 'where',
                database: db,
                name: tc.name,
                flyql: tc.flyql,
                sql: '',
                expected_ids: expected,
                returned_ids: [],
                passed: false,
                error: '',
            }
            if (!runner.available()) {
                // Skip silently (emit no row) so an unavailable DB matches the
                // Go (continue) and Python (pytest.skip) behavior. Pushing a
                // failing row here would make the runner's cross-language
                // collapse see a lone JS failure for a (case, db) group that
                // Go/Python omit entirely — a spurious parity mismatch.
                continue
            }
            try {
                const { sql, ids } = await runner.run()
                const sortedIds = [...ids].sort((a, b) => a - b)
                result.sql = sql
                result.returned_ids = sortedIds
                result.passed = JSON.stringify(sortedIds) === JSON.stringify(expected)
            } catch (e) {
                result.error = e.message
            }
            reportResults.push(result)
            expect(result.error, `${db}: ${result.error}`).toBe('')
            expect(result.returned_ids, `${db}`).toEqual(expected)
        }
    })
})
