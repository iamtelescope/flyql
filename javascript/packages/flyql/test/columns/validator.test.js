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
    CODE_UNKNOWN_RENDERER,
    CODE_RENDERER_ARG_COUNT,
    CODE_RENDERER_ARG_TYPE,
    Diagnostic,
} from '../../src/core/validator.js'
import { defaultRegistry } from '../../src/transformers/registry.js'
import { Range } from '../../src/core/range.js'
import { Renderer, RendererRegistry, ArgSpec } from '../../src/renderers/index.js'
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

    describe('renderers', () => {
        const caps = { transformers: true, renderers: true }

        class HrefRenderer extends Renderer {
            get name() {
                return 'href'
            }
            get argSchema() {
                return [new ArgSpec(Type.String, true)]
            }
        }

        class TruncateRenderer extends Renderer {
            get name() {
                return 'truncate'
            }
            get argSchema() {
                return [new ArgSpec(Type.Int, true)]
            }
        }

        function makeURLSchema() {
            return makeSchemaFromColumn('url', 'string')
        }

        function registry() {
            const reg = new RendererRegistry()
            reg.register(new HrefRenderer())
            reg.register(new TruncateRenderer())
            return reg
        }

        it('unknown renderer returns CODE_UNKNOWN_RENDERER', () => {
            const cols = parse('url as link|unknown("x")', caps)
            const diags = diagnose(cols, makeURLSchema(), null, registry())
            expect(diags).toHaveLength(1)
            expect(diags[0].code).toBe(CODE_UNKNOWN_RENDERER)
        })

        it('valid renderer returns zero diagnostics', () => {
            const cols = parse('url as link|href("/x")', caps)
            const diags = diagnose(cols, makeURLSchema(), null, registry())
            expect(diags).toHaveLength(0)
        })

        it('renderer arg count mismatch returns CODE_RENDERER_ARG_COUNT', () => {
            const cols = parse('url as link|href("/x", "extra")', caps)
            const diags = diagnose(cols, makeURLSchema(), null, registry())
            expect(diags.some((d) => d.code === CODE_RENDERER_ARG_COUNT)).toBe(true)
        })

        it('renderer arg type mismatch returns CODE_RENDERER_ARG_TYPE', () => {
            const cols = parse('url as link|href(42)', caps)
            const diags = diagnose(cols, makeURLSchema(), null, registry())
            expect(diags.some((d) => d.code === CODE_RENDERER_ARG_TYPE)).toBe(true)
        })

        it('per-renderer diagnose hook appends custom diagnostics', () => {
            class HrefWithHook extends Renderer {
                get name() {
                    return 'href'
                }
                get argSchema() {
                    return [new ArgSpec(Type.String, true)]
                }
                diagnose(args, col) {
                    if (args && args[0] && !args[0].includes('{{value}}')) {
                        return [new Diagnostic(new Range(0, 1), 'href missing placeholder', 'warning', 'custom_href')]
                    }
                    return []
                }
            }
            const reg = new RendererRegistry()
            reg.register(new HrefWithHook())
            const cols = parse('url as link|href("/static")', caps)
            const diags = diagnose(cols, makeURLSchema(), null, reg)
            expect(diags.some((d) => d.code === 'custom_href')).toBe(true)
        })

        it('registry-level chain diagnose hook appends diagnostics', () => {
            const reg = registry()
            reg.setDiagnose((col, chain) => {
                const names = chain.map((r) => r.name)
                const ti = names.indexOf('truncate')
                const hi = names.indexOf('href')
                if (ti >= 0 && hi >= 0 && ti < hi) {
                    return [new Diagnostic(new Range(0, 1), 'href cannot follow truncate', 'error', 'chain_forbidden')]
                }
                return []
            })
            const cols = parse('url as link|truncate(10)|href("/x")', caps)
            const diags = diagnose(cols, makeURLSchema(), null, reg)
            expect(diags.some((d) => d.code === 'chain_forbidden')).toBe(true)
        })

        it('null registry emits unknown_renderer for every renderer', () => {
            const cols = parse('url as link|href("/x")', caps)
            const diags = diagnose(cols, makeURLSchema(), null, null)
            expect(diags).toHaveLength(1)
            expect(diags[0].code).toBe(CODE_UNKNOWN_RENDERER)
        })
    })
})
