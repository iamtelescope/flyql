import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parse } from '../../../src/core/parser.js'
import {
    generateWhere,
    generateSelect,
    Column,
    newColumn,
    escapeParam,
    escapeIdentifier,
} from '../../../src/generators/postgresql/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const testDataDir = path.join(__dirname, '..', '..', '..', '..', '..', '..', 'tests-data', 'generators', 'postgresql')

function loadFixture(filename) {
    const content = fs.readFileSync(path.join(testDataDir, filename), 'utf-8')
    return JSON.parse(content)
}

function buildColumns() {
    const columnsData = loadFixture('columns.json')
    const columns = {}
    for (const [key, col] of Object.entries(columnsData.columns)) {
        const column = newColumn(col.name, col.type, col.values)
        if (col.raw_identifier) {
            column.withRawIdentifier(col.raw_identifier)
        }
        columns[key] = column
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
                    if (tc.expected_sql) {
                        expect(sql).toBe(tc.expected_sql)
                    }
                    if (tc.expected_sql_contains) {
                        for (const substr of tc.expected_sql_contains) {
                            expect(sql).toContain(substr)
                        }
                    }
                } else if (tc.expected_result === 'error') {
                    expect(() => generateWhere(result.root, columns)).toThrow()
                    try {
                        generateWhere(result.root, columns)
                    } catch (e) {
                        if (tc.expected_error_contains) {
                            for (const substr of tc.expected_error_contains) {
                                expect(e.message).toContain(substr)
                            }
                        }
                    }
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
                    if (tc.expected_sql) {
                        expect(result.sql).toBe(tc.expected_sql)
                    }
                } else if (tc.expected_result === 'error') {
                    expect(() => generateSelect(tc.input, columns)).toThrow()
                    try {
                        generateSelect(tc.input, columns)
                    } catch (e) {
                        if (tc.expected_error_contains) {
                            for (const substr of tc.expected_error_contains) {
                                expect(e.message).toContain(substr)
                            }
                        }
                    }
                }
            })
        }
    })
}

describe('PostgreSQL Generator', () => {
    // WHERE clause tests
    runTestSuite('basic.json')
    runTestSuite('boolean.json')
    runTestSuite('json_columns.json')
    runTestSuite('map_array.json')
    runTestSuite('in.json')
    runTestSuite('has.json')
    runTestSuite('truthy.json')
    runTestSuite('not.json')
    runTestSuite('errors.json')
    runTestSuite('transformers.json')
    runTestSuite('types.json')
    runTestSuite('like.json')
    runTestSuite('column_ref.json')

    // SELECT clause tests
    runSelectTestSuite('select_basic.json')
    runSelectTestSuite('select_composite.json')
    runSelectTestSuite('select_errors.json')

    // escapeParam tests
    describe('escapeParam', () => {
        it('escapes null', () => {
            expect(escapeParam(null)).toBe('NULL')
        })

        it('escapes undefined', () => {
            expect(escapeParam(undefined)).toBe('NULL')
        })

        it('escapes string', () => {
            expect(escapeParam('hello')).toBe("'hello'")
        })

        it('escapes string with special chars', () => {
            expect(escapeParam("it's")).toBe("'it\\'s'")
        })

        it('escapes string with backslash', () => {
            expect(escapeParam('a\\b')).toBe("'a\\\\b'")
        })

        it('escapes boolean true (lowercase)', () => {
            expect(escapeParam(true)).toBe('true')
        })

        it('escapes boolean false (lowercase)', () => {
            expect(escapeParam(false)).toBe('false')
        })

        it('escapes integer', () => {
            expect(escapeParam(42)).toBe('42')
        })

        it('escapes float', () => {
            expect(escapeParam(3.14)).toBe('3.14')
        })

        it('escapes zero', () => {
            expect(escapeParam(0)).toBe('0')
        })
    })

    // escapeIdentifier tests
    describe('escapeIdentifier', () => {
        it('wraps name in double quotes', () => {
            expect(escapeIdentifier('message')).toBe('"message"')
        })

        it('escapes double quotes in name', () => {
            expect(escapeIdentifier('my"col')).toBe('"my""col"')
        })

        it('wraps simple name', () => {
            expect(escapeIdentifier('count')).toBe('"count"')
        })
    })
})
