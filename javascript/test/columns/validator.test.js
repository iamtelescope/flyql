import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parse, diagnose } from '../../src/columns/index.js'
import { Column } from '../../src/core/column.js'
import {
    CODE_UNKNOWN_COLUMN,
    CODE_UNKNOWN_TRANSFORMER,
    CODE_ARG_COUNT,
    CODE_ARG_TYPE,
    CODE_CHAIN_TYPE,
} from '../../src/core/validator.js'
import { defaultRegistry } from '../../src/transformers/registry.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURE_PATH = path.join(__dirname, '..', '..', '..', 'tests-data', 'columns', 'validator.json')
const SHARED_DATA = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf-8'))

function makeColumn(name, normalizedType) {
    return new Column(name, false, normalizedType, normalizedType, { matchName: name })
}

function makeColumns(defs) {
    return defs.map((d) => makeColumn(d.name, d.normalized_type))
}

describe('Columns Validator', () => {
    describe('shared fixtures', () => {
        for (const tc of SHARED_DATA.tests) {
            it(tc.name, () => {
                const caps = tc.capabilities || { transformers: true }
                let parsedColumns
                try {
                    parsedColumns = parse(tc.input, caps)
                } catch {
                    parsedColumns = []
                }
                const columns = makeColumns(tc.columns)
                const diags = diagnose(parsedColumns, columns)
                expect(diags).toHaveLength(tc.expected_diagnostics.length)
                for (let i = 0; i < tc.expected_diagnostics.length; i++) {
                    const expected = tc.expected_diagnostics[i]
                    expect(diags[i].code).toBe(expected.code)
                    expect(diags[i].severity).toBe(expected.severity)
                    expect(diags[i].range.start).toBe(expected.range[0])
                    expect(diags[i].range.end).toBe(expected.range[1])
                    if (expected.message_contains) {
                        expect(diags[i].message).toContain(expected.message_contains)
                    }
                }
            })
        }
    })

    describe('additional tests', () => {
        it('empty array returns empty', () => {
            const diags = diagnose([], [makeColumn('level', 'string')])
            expect(diags).toEqual([])
        })

        it('null returns empty', () => {
            const diags = diagnose(null, [makeColumn('level', 'string')])
            expect(diags).toEqual([])
        })

        it('valid column with valid transformer returns empty', () => {
            const cols = parse('level|upper', { transformers: true })
            const diags = diagnose(cols, [makeColumn('level', 'string')])
            expect(diags).toEqual([])
        })

        it('unknown column returns CODE_UNKNOWN_COLUMN', () => {
            const cols = parse('foo', { transformers: true })
            const diags = diagnose(cols, [makeColumn('level', 'string')])
            expect(diags).toHaveLength(1)
            expect(diags[0].code).toBe(CODE_UNKNOWN_COLUMN)
            expect(diags[0].range.start).toBe(0)
            expect(diags[0].range.end).toBe(3)
        })

        it('unknown transformer returns CODE_UNKNOWN_TRANSFORMER', () => {
            const cols = parse('level|zzzz', { transformers: true })
            const diags = diagnose(cols, [makeColumn('level', 'string')])
            expect(diags).toHaveLength(1)
            expect(diags[0].code).toBe(CODE_UNKNOWN_TRANSFORMER)
            expect(diags[0].range.start).toBe(6)
            expect(diags[0].range.end).toBe(10)
        })

        it('chain type mismatch returns CODE_CHAIN_TYPE', () => {
            // len outputs int, upper expects string
            const cols = parse('level|len|upper', { transformers: true })
            const diags = diagnose(cols, [makeColumn('level', 'string')])
            expect(diags.some((d) => d.code === CODE_CHAIN_TYPE)).toBe(true)
        })

        it('multiple errors returns all diagnostics', () => {
            const cols = parse('foo, bar', { transformers: true })
            const diags = diagnose(cols, [makeColumn('level', 'string')])
            expect(diags).toHaveLength(2)
            expect(diags[0].code).toBe(CODE_UNKNOWN_COLUMN)
            expect(diags[1].code).toBe(CODE_UNKNOWN_COLUMN)
        })

        it('dotted column highlights only base segment', () => {
            const cols = parse('resource.service.name', { transformers: true })
            const diags = diagnose(cols, [makeColumn('level', 'string')])
            expect(diags).toHaveLength(1)
            expect(diags[0].range.start).toBe(0)
            expect(diags[0].range.end).toBe(8) // "resource"
        })
    })
})
