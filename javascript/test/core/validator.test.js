import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
    parse,
    Key,
    Expression,
    Node,
    Column,
    diagnose,
    Diagnostic,
    CODE_UNKNOWN_COLUMN,
    CODE_UNKNOWN_TRANSFORMER,
    CODE_ARG_COUNT,
    CODE_ARG_TYPE,
    CODE_CHAIN_TYPE,
    CODE_INVALID_AST,
    Range,
} from '../../src/index.js'
import { ColumnSchema } from '../../src/core/column.js'
import { ArgSpec, Transformer, TransformerRegistry, defaultRegistry } from '../../src/transformers/index.js'
import { Type } from '../../src/flyql_type.js'
import { Column as CHColumn } from '../../src/generators/clickhouse/column.js'

// ---------------------------------------------------------------------------
// Shared fixture loading
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURE_PATH = path.join(__dirname, '..', '..', '..', 'tests-data', 'core', 'validator.json')
const SHARED_CASES = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf-8')).tests

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeColumn(name, typeStr, { jsonString = false, matchName = null } = {}) {
    const t = typeStr || Type.Unknown
    return new Column(name, jsonString, t, { matchName })
}

function parseAst(query) {
    const p = parse(query)
    expect(p.root).not.toBeNull()
    return p.root
}

function columnsFromSpec(colSpecs) {
    return colSpecs.map((c) => makeColumn(c.name, c.type))
}

// ---------------------------------------------------------------------------
// Custom test transformers
// ---------------------------------------------------------------------------

class TakesStringThenInt extends Transformer {
    get name() {
        return 'takes_string_then_int'
    }
    get inputType() {
        return Type.String
    }
    get outputType() {
        return Type.String
    }
    get argSchema() {
        return [new ArgSpec(Type.String, true), new ArgSpec(Type.Int, true)]
    }
    sql(dialect, columnRef) {
        return columnRef
    }
    apply(value) {
        return value
    }
}

class StringToInt extends Transformer {
    get name() {
        return 'string_to_int'
    }
    get inputType() {
        return Type.String
    }
    get outputType() {
        return Type.Int
    }
    sql(dialect, columnRef) {
        return columnRef
    }
    apply(value) {
        return parseInt(value, 10)
    }
}

class TakesFloat extends Transformer {
    get name() {
        return 'takes_float'
    }
    get inputType() {
        return Type.String
    }
    get outputType() {
        return Type.String
    }
    get argSchema() {
        return [new ArgSpec(Type.Float, true)]
    }
    sql(dialect, columnRef) {
        return columnRef
    }
    apply(value) {
        return value
    }
}

class TakesInt extends Transformer {
    get name() {
        return 'takes_int'
    }
    get inputType() {
        return Type.String
    }
    get outputType() {
        return Type.String
    }
    get argSchema() {
        return [new ArgSpec(Type.Int, true)]
    }
    sql(dialect, columnRef) {
        return columnRef
    }
    apply(value) {
        return value
    }
}

// ---------------------------------------------------------------------------
// Registry fixture
// ---------------------------------------------------------------------------

function createRegistry() {
    const reg = defaultRegistry()
    reg.register(new TakesStringThenInt())
    reg.register(new StringToInt())
    reg.register(new TakesFloat())
    reg.register(new TakesInt())
    return reg
}

// ---------------------------------------------------------------------------
// Shared fixture-driven tests
// ---------------------------------------------------------------------------

describe('Validator (shared fixtures)', () => {
    const registry = createRegistry()

    for (const tc of SHARED_CASES) {
        it(tc.name, () => {
            const cols = columnsFromSpec(tc.columns)
            const schema = ColumnSchema.fromColumns(cols)
            const useDefault = tc.use_default_registry || false
            const reg = useDefault ? null : registry

            let ast = null
            if (tc.query !== null) {
                ast = parseAst(tc.query)
            }

            const diags = diagnose(ast, schema, reg)

            expect(diags).toHaveLength(tc.expected_diagnostics.length)

            for (let i = 0; i < tc.expected_diagnostics.length; i++) {
                const exp = tc.expected_diagnostics[i]
                const d = diags[i]
                expect(d.code).toBe(exp.code)
                expect(d.severity).toBe(exp.severity)
                if (exp.range) {
                    expect(d.range).toEqual(new Range(exp.range[0], exp.range[1]))
                }
                if (exp.message_contains) {
                    expect(d.message).toContain(exp.message_contains)
                }
            }

            // Check absent codes
            if (tc.absent_codes) {
                const diagCodes = new Set(diags.map((d) => d.code))
                for (const absent of tc.absent_codes) {
                    expect(diagCodes.has(absent)).toBe(false)
                }
            }
        })
    }
})

// ---------------------------------------------------------------------------
// Language-specific tests
// ---------------------------------------------------------------------------

describe('Validator (language-specific)', () => {
    const registry = createRegistry()

    it('should return empty list for undefined AST', () => {
        const cols = [makeColumn('host', 'string')]
        expect(diagnose(undefined, ColumnSchema.fromColumns(cols))).toEqual([])
    })

    it('should report invalid AST when segment ranges are empty', () => {
        const key = new Key(['foo'], 'foo', [], null, null, [])
        const expr = new Expression(key, '=', 'X', true)
        const node = new Node('and', expr, null, null)
        const cols = [makeColumn('foo', 'string')]
        const diags = diagnose(node, ColumnSchema.fromColumns(cols), registry)
        expect(diags).toHaveLength(1)
        expect(diags[0].code).toBe(CODE_INVALID_AST)
        expect(diags[0].range).toEqual(new Range(0, 0))
    })

    it('should accept ClickHouse Column via bridge', () => {
        // After the unify-column-type-system refactor, dialect Columns are
        // opaque — bridge via flyql.Column to get a canonical column for
        // the validator.
        const ch = new CHColumn('host', false, 'String')
        const bridged = new Column(ch.name, ch.jsonString, ch.flyqlType(), { matchName: ch.matchName })
        const ast = parseAst("host='X'")
        expect(diagnose(ast, ColumnSchema.fromColumns([bridged]), registry)).toEqual([])
    })

    it('should use matchName for escaped identifiers', () => {
        const col = new CHColumn('1host', false, 'String')
        expect(col.name).toBe('`1host`')
        expect(col.matchName).toBe('1host')
    })
})
