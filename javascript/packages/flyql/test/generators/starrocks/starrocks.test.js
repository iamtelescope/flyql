import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parse } from '../../../src/core/parser.js'
import { generateWhere, generateSelect, Column, newColumn } from '../../../src/generators/starrocks/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const testDataDir = path.join(__dirname, '..', '..', '..', '..', '..', '..', 'tests-data', 'generators', 'starrocks')

function loadFixture(filename) {
    return JSON.parse(fs.readFileSync(path.join(testDataDir, filename), 'utf-8'))
}

function buildColumns() {
    const columnsData = loadFixture('columns.json')
    const columns = {}
    for (const [key, col] of Object.entries(columnsData.columns)) {
        columns[key] = newColumn({ name: col.name, type: col.type, values: col.values })
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
    runTestSuite('types.json')
    runTestSuite('like.json')
    runTestSuite('column_ref.json')
    runTestSuite('functions.json')

    runSelectTestSuite('select_basic.json')
    runSelectTestSuite('select_composite.json')
    runSelectTestSuite('select_errors.json')
})

describe('StarRocks newColumn API guardrails', () => {
    it('throws on positional call', () => {
        expect(() => newColumn('status', 'INT', null)).toThrow(/expected an options object/)
    })

    it('throws on empty object with name required', () => {
        expect(() => newColumn({})).toThrow(/'name' must be a non-empty string/)
    })

    it('throws on non-string type', () => {
        expect(() => newColumn({ name: 'x', type: 123 })).toThrow(/'type' must be a raw-type string/)
    })

    it('direct new Column({}) throws — same contract as newColumn({})', () => {
        expect(() => new Column({})).toThrow(/'name' must be a non-empty string/)
    })
})
