import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parse } from '../../../src/core/parser.js'
import { generateWhere, generateSelect, newColumn, escapeParam } from '../../../src/generators/starrocks/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const testDataDir = path.join(__dirname, '..', '..', '..', '..', 'tests-data', 'generators', 'starrocks')

function loadFixture(filename) {
    return JSON.parse(fs.readFileSync(path.join(testDataDir, filename), 'utf-8'))
}

function buildColumns() {
    const columnsData = loadFixture('columns.json')
    const columns = {}
    for (const [key, col] of Object.entries(columnsData.columns)) {
        columns[key] = newColumn(col.name, col.jsonstring, col.type, col.values)
    }
    return columns
}

const columns = buildColumns()

function runTestSuite(fixtureName) {
    const fixture = loadFixture(fixtureName)
    describe(fixture.test_suite, () => {
        for (const tc of fixture.tests) {
            it(tc.name, () => {
                const result = parse(tc.input)
                if (result.error) throw new Error(`Parse error: ${result.error}`)

                if (tc.expected_result === 'success') {
                    const sql = generateWhere(result.root, columns)
                    if (tc.expected_sql) expect(sql).toBe(tc.expected_sql)
                    if (tc.expected_sql_contains) {
                        const contains = Array.isArray(tc.expected_sql_contains)
                            ? tc.expected_sql_contains
                            : [tc.expected_sql_contains]
                        for (const substr of contains) expect(sql).toContain(substr)
                    }
                } else if (tc.expected_result === 'error') {
                    expect(() => generateWhere(result.root, columns)).toThrow()
                }
            })
        }
    })
}

function runSelectTestSuite(fixtureName) {
    const fixture = loadFixture(fixtureName)
    describe(fixture.test_suite, () => {
        for (const tc of fixture.tests) {
            it(tc.name, () => {
                if (tc.expected_result === 'success') {
                    const result = generateSelect(tc.input, columns)
                    if (tc.expected_sql) expect(result.sql).toBe(tc.expected_sql)
                } else if (tc.expected_result === 'error') {
                    expect(() => generateSelect(tc.input, columns)).toThrow()
                }
            })
        }
    })
}

describe('StarRocks Generator', () => {
    runTestSuite('basic.json')
    runTestSuite('boolean.json')
    runTestSuite('json_columns.json')
    runTestSuite('map_array.json')
    runTestSuite('in.json')
    runTestSuite('has.json')
    runTestSuite('truthy.json')
    runTestSuite('not.json')
    runTestSuite('errors.json')
    runTestSuite('struct.json')
    runTestSuite('transformers.json')

    runSelectTestSuite('select_basic.json')
    runSelectTestSuite('select_composite.json')
    runSelectTestSuite('select_errors.json')
})
