import { describe, it, expect } from 'vitest'
import { parse, diagnose } from '../../src/columns/index.js'
import { Column, ColumnSchema } from '../../src/core/column.js'
import { CODE_UNKNOWN_TRANSFORMER_ARG_COLUMN } from '../../src/core/validator.js'
import { Type, parseFlyQLType } from '../../src/flyql_type.js'

function makeColumn(name, typeStr, children = null) {
    const t = typeStr ? parseFlyQLType(typeStr) : Type.Unknown
    return new Column(name, t, { matchName: name, children })
}

function makeSchema(defs) {
    const m = {}
    for (const d of defs) {
        const children = d.children
            ? Object.fromEntries(Object.entries(d.children).map(([k, v]) => [k, makeColumn(v.name, v.type)]))
            : null
        m[d.name] = makeColumn(d.name, d.type, children)
    }
    return new ColumnSchema(m)
}

const CAPS = { transformers: true, renderers: false }

describe('Columns Validator — CODE_UNKNOWN_TRANSFORMER_ARG_COLUMN (Issue #2)', () => {
    it('emits diagnostic when field-ref arg names an unknown column', () => {
        const cols = parse('message|split(abc)', CAPS)
        const schema = makeSchema([{ name: 'message', type: 'string' }])
        const diags = diagnose(cols, schema)
        expect(diags).toHaveLength(1)
        expect(diags[0].code).toBe(CODE_UNKNOWN_TRANSFORMER_ARG_COLUMN)
        expect(diags[0].severity).toBe('error')
        expect(diags[0].message).toBe("unknown column in argument: 'abc'")
        const start = 'message|split('.length
        expect(diags[0].range.start).toBe(start)
        expect(diags[0].range.end).toBe(start + 'abc'.length)
        expect(diags[0].error).not.toBeNull()
        expect(diags[0].error.description).toContain('bare identifier')
    })

    it('accepts field-ref arg when column exists in schema', () => {
        const cols = parse('message|split(abc)', CAPS)
        const schema = makeSchema([
            { name: 'message', type: 'string' },
            { name: 'abc', type: 'string' },
        ])
        const diags = diagnose(cols, schema)
        expect(diags).toHaveLength(0)
    })

    it('quoted-arg never triggers field-ref schema lookup', () => {
        const cols = parse("message|split('abc')", CAPS)
        const schema = makeSchema([{ name: 'message', type: 'string' }])
        const diags = diagnose(cols, schema)
        expect(diags).toHaveLength(0)
    })

    it('numeric arg never triggers field-ref schema lookup', () => {
        const cols = parse('message|len', CAPS)
        const schema = makeSchema([{ name: 'message', type: 'string' }])
        const diags = diagnose(cols, schema)
        expect(diags).toHaveLength(0)
    })

    it('dotted-path field ref: valid nested column accepted', () => {
        const cols = parse('message|split(attributes.foo)', CAPS)
        const schema = makeSchema([
            { name: 'message', type: 'string' },
            {
                name: 'attributes',
                type: 'struct',
                children: { foo: { name: 'foo', type: 'string' } },
            },
        ])
        const diags = diagnose(cols, schema)
        expect(diags).toHaveLength(0)
    })

    it('dotted-path field ref: unknown nested column emits diagnostic over full path', () => {
        const text = 'message|split(attributes.bar)'
        const cols = parse(text, CAPS)
        const schema = makeSchema([
            { name: 'message', type: 'string' },
            {
                name: 'attributes',
                type: 'struct',
                children: { foo: { name: 'foo', type: 'string' } },
            },
        ])
        const diags = diagnose(cols, schema)
        expect(diags).toHaveLength(1)
        expect(diags[0].code).toBe(CODE_UNKNOWN_TRANSFORMER_ARG_COLUMN)
        const start = text.indexOf('attributes.bar')
        expect(diags[0].range.start).toBe(start)
        expect(diags[0].range.end).toBe(start + 'attributes.bar'.length)
    })

    it('argumentKinds length mismatch falls through to literal type checks (AC 19)', () => {
        // Hand-construct a transformer with mismatched lengths to simulate legacy AST.
        const cols = parse('message|split(abc)', CAPS)
        cols[0].transformers[0].argumentKinds = ['col']
        cols[0].transformers[0].arguments = ['x', 'y']
        const schema = makeSchema([{ name: 'message', type: 'string' }])
        const diags = diagnose(cols, schema)
        // With kindsInSync=false, the field-ref branch is skipped and no
        // unknown-column-in-arg diagnostic is emitted. Legacy checks may
        // produce arg_count or arg_type diagnostics but NEVER
        // CODE_UNKNOWN_TRANSFORMER_ARG_COLUMN in this state.
        expect(diags.every((d) => d.code !== CODE_UNKNOWN_TRANSFORMER_ARG_COLUMN)).toBe(true)
    })
})
