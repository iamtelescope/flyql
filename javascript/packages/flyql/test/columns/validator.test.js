import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parse, diagnose } from '../../src/columns/index.js'
import { Column, ColumnSchema } from '../../src/core/column.js'
import {
    CODE_UNKNOWN_COLUMN,
    CODE_UNKNOWN_TRANSFORMER,
    CODE_ARG_COUNT,
    CODE_ARG_TYPE,
    CODE_CHAIN_TYPE,
} from '../../src/core/validator.js'
import { defaultRegistry } from '../../src/transformers/registry.js'
import { Type, parseFlyQLType } from '../../src/flyql_type.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURE_PATH = path.join(__dirname, '..', '..', '..', '..', '..', 'tests-data', 'columns', 'validator.json')
const SHARED_DATA = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf-8'))

function makeColumn(name, typeStr) {
    const t = typeStr ? parseFlyQLType(typeStr) : Type.Unknown
    return new Column(name, t, { matchName: name })
}

function buildColumnFromDef(d) {
    let children = null
    if (d.children && typeof d.children === 'object') {
        children = {}
        for (const [childName, childDef] of Object.entries(d.children)) {
            children[childName] = buildColumnFromDef(childDef)
        }
    }
    const t = d.type ? parseFlyQLType(d.type) : Type.Unknown
    return new Column(d.name, t, {
        matchName: d.name,
        children,
    })
}

function makeSchema(defs) {
    const m = {}
    for (const d of defs) {
        m[d.name] = buildColumnFromDef(d)
    }
    return new ColumnSchema(m)
}

function makeSchemaFromColumn(name, normalizedType) {
    return ColumnSchema.fromColumns([makeColumn(name, normalizedType)])
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
                const schema = makeSchema(tc.columns)
                const diags = diagnose(parsedColumns, schema)
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
            const diags = diagnose([], makeSchemaFromColumn('level', 'string'))
            expect(diags).toEqual([])
        })

        it('null returns empty', () => {
            const diags = diagnose(null, makeSchemaFromColumn('level', 'string'))
            expect(diags).toEqual([])
        })

        it('valid column with valid transformer returns empty', () => {
            const cols = parse('level|upper', { transformers: true })
            const diags = diagnose(cols, makeSchemaFromColumn('level', 'string'))
            expect(diags).toEqual([])
        })

        it('unknown column returns CODE_UNKNOWN_COLUMN', () => {
            const cols = parse('foo', { transformers: true })
            const diags = diagnose(cols, makeSchemaFromColumn('level', 'string'))
            expect(diags).toHaveLength(1)
            expect(diags[0].code).toBe(CODE_UNKNOWN_COLUMN)
            expect(diags[0].range.start).toBe(0)
            expect(diags[0].range.end).toBe(3)
        })

        it('unknown transformer returns CODE_UNKNOWN_TRANSFORMER', () => {
            const cols = parse('level|zzzz', { transformers: true })
            const diags = diagnose(cols, makeSchemaFromColumn('level', 'string'))
            expect(diags).toHaveLength(1)
            expect(diags[0].code).toBe(CODE_UNKNOWN_TRANSFORMER)
            expect(diags[0].range.start).toBe(6)
            expect(diags[0].range.end).toBe(10)
        })

        it('chain type mismatch returns CODE_CHAIN_TYPE', () => {
            // len outputs int, upper expects string
            const cols = parse('level|len|upper', { transformers: true })
            const diags = diagnose(cols, makeSchemaFromColumn('level', 'string'))
            expect(diags.some((d) => d.code === CODE_CHAIN_TYPE)).toBe(true)
        })

        it('multiple errors returns all diagnostics', () => {
            const cols = parse('foo, bar', { transformers: true })
            const diags = diagnose(cols, makeSchemaFromColumn('level', 'string'))
            expect(diags).toHaveLength(2)
            expect(diags[0].code).toBe(CODE_UNKNOWN_COLUMN)
            expect(diags[1].code).toBe(CODE_UNKNOWN_COLUMN)
        })

        it('dotted column highlights only base segment', () => {
            const cols = parse('resource.service.name', { transformers: true })
            const diags = diagnose(cols, makeSchemaFromColumn('level', 'string'))
            expect(diags).toHaveLength(1)
            expect(diags[0].range.start).toBe(0)
            expect(diags[0].range.end).toBe(8) // "resource"
        })
    })
})
