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
} from '../../../src/generators/clickhouse/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const testDataDir = path.join(__dirname, '..', '..', '..', '..', 'tests-data', 'generators', 'clickhouse')

function loadFixture(filename) {
    const content = fs.readFileSync(path.join(testDataDir, filename), 'utf-8')
    return JSON.parse(content)
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
                if (result.error) {
                    throw new Error(`Parse error: ${result.error}`)
                }

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
                            expect(e.message.toLowerCase()).toContain(tc.expected_error_contains.toLowerCase())
                        }
                    }
                }
            })
        }
    })
}

describe('ClickHouse Generator', () => {
    runTestSuite('basic.json')
    runTestSuite('boolean.json')
    runTestSuite('json_columns.json')
    runTestSuite('map_array.json')
    runTestSuite('in.json')
    runTestSuite('truthy.json')
    runTestSuite('not.json')
    runTestSuite('errors.json')
})

describe('escapeParam', () => {
    it('escapes null', () => {
        expect(escapeParam(null)).toBe('NULL')
    })

    it('escapes undefined', () => {
        expect(escapeParam(undefined)).toBe('NULL')
    })

    it('escapes strings', () => {
        expect(escapeParam('hello')).toBe("'hello'")
    })

    it('escapes single quotes in strings', () => {
        expect(escapeParam("it's")).toBe("'it\\'s'")
    })

    it('escapes backslashes', () => {
        expect(escapeParam('back\\slash')).toBe("'back\\\\slash'")
    })

    it('escapes control characters', () => {
        expect(escapeParam('line\nbreak')).toBe("'line\\nbreak'")
        expect(escapeParam('tab\there')).toBe("'tab\\there'")
    })

    it('returns True for boolean true', () => {
        expect(escapeParam(true)).toBe('True')
    })

    it('returns False for boolean false', () => {
        expect(escapeParam(false)).toBe('False')
    })

    it('converts integers to string', () => {
        expect(escapeParam(42)).toBe('42')
    })

    it('converts floats to string', () => {
        expect(escapeParam(3.14)).toBe('3.14')
    })

    it('rejects NaN', () => {
        expect(() => escapeParam(NaN)).toThrow('unsupported numeric value')
    })

    it('rejects Infinity', () => {
        expect(() => escapeParam(Infinity)).toThrow('unsupported numeric value')
    })

    it('rejects -Infinity', () => {
        expect(() => escapeParam(-Infinity)).toThrow('unsupported numeric value')
    })
})

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
                                expect(e.message.toLowerCase()).toContain(substr.toLowerCase())
                            }
                        }
                    }
                }
            })
        }
    })
}

runSelectTestSuite('select_basic.json')
runSelectTestSuite('select_composite.json')
runSelectTestSuite('select_errors.json')

describe('generateSelect', () => {
    it('selects simple column', () => {
        const result = generateSelect('message', columns)
        expect(result.sql).toBe('message')
        expect(result.columns).toHaveLength(1)
    })

    it('selects multiple columns', () => {
        const result = generateSelect('message, count, price', columns)
        expect(result.sql).toBe('message, count, price')
        expect(result.columns).toHaveLength(3)
    })

    it('selects column with alias', () => {
        const result = generateSelect('message as msg', columns)
        expect(result.sql).toBe('message AS msg')
    })

    it('selects JSON path with implicit alias', () => {
        const result = generateSelect('new_json.name', columns)
        expect(result.sql).toContain('new_json.`name`')
        expect(result.sql).toContain('AS `new_json.name`')
    })

    it('selects map path', () => {
        const result = generateSelect('metadata.key1', columns)
        expect(result.sql).toContain("metadata['key1']")
    })

    it('selects array index', () => {
        const result = generateSelect('tags.0', columns)
        expect(result.sql).toContain('tags[0]')
    })

    it('selects JSONString path', () => {
        const result = generateSelect('json_column.name', columns)
        expect(result.sql).toContain('JSONExtractString')
    })

    it('throws on unknown column', () => {
        expect(() => generateSelect('unknown_col', columns)).toThrow('unknown column')
    })

    it('rejects invalid alias characters', () => {
        expect(() => generateSelect('message as msg; DROP TABLE', columns)).toThrow('invalid alias')
    })

    it('accepts valid alias', () => {
        const result = generateSelect('message as msg', columns)
        expect(result.sql).toBe('message AS msg')
    })
})
