import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parse } from '../../../src/core/parser.js'
import { generateWhere, generateSelect, newColumn } from '../../../src/generators/postgresql/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const testDataDir = path.join(__dirname, '..', '..', '..', '..', '..', '..', 'tests-data', 'generators', 'postgresql')

function loadFixture(filename) {
    return JSON.parse(fs.readFileSync(path.join(testDataDir, filename), 'utf-8'))
}

function buildColumns() {
    const columnsData = loadFixture('columns.json')
    const columns = {}
    for (const [key, col] of Object.entries(columnsData.columns)) {
        const column = newColumn({ name: col.name, type: col.type, values: col.values })
        if (col.raw_identifier) {
            column.rawIdentifier = col.raw_identifier
        }
        columns[key] = column
    }
    return columns
}

function toJsOptions(o) {
    return { format: o.format, indentChar: o.indent_char, indentCount: o.indent_count }
}

function normalizeWS(s) {
    return s.split(/\s+/).filter(Boolean).join(' ').replaceAll('( ', '(').replaceAll(' )', ')')
}

const columns = buildColumns()
const fixture = loadFixture('formatting.json')

describe('PostgreSQL formatting', () => {
    for (const tc of fixture.tests) {
        it(tc.name, () => {
            const kind = tc.kind || 'where'
            const opts = toJsOptions(tc.options)

            let unformatted
            let formatted
            if (kind === 'where') {
                const res = parse(tc.input)
                unformatted = generateWhere(res.root, columns)
                formatted = generateWhere(res.root, columns, null, opts)
            } else {
                unformatted = generateSelect(tc.input, columns).sql
                formatted = generateSelect(tc.input, columns, null, opts).sql
            }

            expect(unformatted).toBe(tc.expected_unformatted_sql)
            expect(formatted).toBe(tc.expected_formatted_sql)
            expect(unformatted).not.toContain('\n')
            expect(normalizeWS(formatted)).toBe(unformatted)
        })
    }
})
