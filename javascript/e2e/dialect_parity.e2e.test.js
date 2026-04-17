import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parse } from 'flyql/core'
import { generateWhere as chGenerateWhere, newColumn as chNewColumn } from 'flyql/generators/clickhouse'
import { generateWhere as srGenerateWhere, newColumn as srNewColumn } from 'flyql/generators/starrocks'
import { generateWhere as pgGenerateWhere, newColumn as pgNewColumn } from 'flyql/generators/postgresql'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const testDataDir = path.join(__dirname, '..', '..', 'tests-data', 'e2e')

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
    const rows = []
    for (const obj of lines) {
        if (obj.meta) colNames = obj.meta.map((m, i) => m.name || `col${i}`)
        else if (obj.data) {
            const row = {}
            colNames.forEach((n, i) => {
                row[n] = obj.data[i]
            })
            rows.push(row)
        }
    }
    return rows
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
    const parsed = parse(flyqlExpr)
    const sqlWhere = chGenerateWhere(parsed.root, columns)
    const rows = await chQuery(`SELECT id FROM flyql_e2e_test WHERE ${sqlWhere} ORDER BY id`)
    return { sql: sqlWhere, ids: rows.map((r) => Number(r.id)) }
}

async function runStarRocks(flyqlExpr, columns) {
    const parsed = parse(flyqlExpr)
    const sqlWhere = srGenerateWhere(parsed.root, columns)
    const rows = await srQuery(`SELECT id FROM flyql_e2e_test WHERE ${sqlWhere} ORDER BY id`)
    return { sql: sqlWhere, ids: rows.map((r) => Number(r.id)) }
}

async function runPostgreSQL(flyqlExpr, columns) {
    const parsed = parse(flyqlExpr)
    const sqlWhere = pgGenerateWhere(parsed.root, columns)
    const lines = await pgQuery(`SELECT id FROM flyql_e2e_test WHERE ${sqlWhere} ORDER BY id`)
    return { sql: sqlWhere, ids: lines.map((line) => Number(line.trim())) }
}

describe('Dialect Parity E2E', () => {
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
            const rows = await chQuery('SELECT 1 AS ok')
            chAvailable = rows.length > 0 && Number(rows[0].ok) === 1
        } catch {
            chAvailable = false
        }
        try {
            const rows = await srQuery('SELECT 1 AS ok')
            srAvailable = rows.length > 0 && Number(rows[0].ok) === 1
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

    afterAll(() => {
        if (REPORT_PATH && reportResults.length > 0) {
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
    })

    const fixturePath = path.join(testDataDir, 'dialect_parity_tests.json')
    const cases = loadJSON(fixturePath).tests

    it.each(cases.map((tc) => [tc.name, tc]))('parity: %s', async (_name, tc) => {
        const flyqlExpr = tc.flyql
        const expected = [...tc.expected_row_ids].sort((a, b) => a - b)

        const runners = [
            { database: 'clickhouse', available: chAvailable, run: () => runClickHouse(flyqlExpr, chCols) },
            { database: 'starrocks', available: srAvailable, run: () => runStarRocks(flyqlExpr, srCols) },
            { database: 'postgresql', available: pgAvailable, run: () => runPostgreSQL(flyqlExpr, pgCols) },
        ]

        for (const r of runners) {
            const result = {
                kind: 'dialect_parity',
                database: r.database,
                name: tc.name,
                flyql: flyqlExpr,
                sql: '',
                expected_ids: expected,
                returned_ids: [],
                passed: false,
                error: '',
            }
            if (!r.available) {
                result.error = `${r.database} not available`
                reportResults.push(result)
                continue
            }
            try {
                const { sql, ids } = await r.run()
                const sortedIds = [...ids].sort((a, b) => a - b)
                result.sql = sql
                result.returned_ids = sortedIds
                result.passed = JSON.stringify(sortedIds) === JSON.stringify(expected)
            } catch (e) {
                result.error = e.message
            }
            reportResults.push(result)
            expect(result.error, `${r.database}: ${result.error}`).toBe('')
            expect(result.returned_ids, `${r.database}`).toEqual(expected)
        }
    })
})
