import { describe, it, expect } from 'vitest'
import { parse } from '../../src/core/parser.js'
import { Transformer, TransformerRegistry, defaultRegistry, SplitTransformer } from '../../src/transformers/index.js'
import { Type } from '../../src/flyql_type.js'
import { generateWhere as chGenerateWhere, newColumn as chNewColumn } from '../../src/generators/clickhouse/index.js'
import { generateWhere as pgGenerateWhere, newColumn as pgNewColumn } from '../../src/generators/postgresql/index.js'
import { generateWhere as srGenerateWhere, newColumn as srNewColumn } from '../../src/generators/starrocks/index.js'
import { match } from '../../src/matcher/index.js'
import { Evaluator } from '../../src/matcher/evaluator.js'
import { Record } from '../../src/matcher/record.js'
import { EditorEngine } from '../../src/editor/engine.js'
import { ColumnSchema } from '../../src/core/column.js'

class FirstOctetTransformer extends Transformer {
    get name() {
        return 'firstoctet'
    }
    get inputType() {
        return Type.String
    }
    get outputType() {
        return Type.Int
    }
    sql(dialect, columnRef) {
        if (dialect === 'clickhouse') return `toUInt8(splitByChar('.', ${columnRef})[1])`
        return `CAST(SPLIT_PART(${columnRef}, '.', 1) AS INTEGER)`
    }
    apply(value) {
        return parseInt(String(value).split('.')[0], 10)
    }
}

function customRegistry() {
    const registry = defaultRegistry()
    registry.register(new FirstOctetTransformer())
    return registry
}

describe('Custom Transformer Registration', () => {
    describe('registration', () => {
        it('registers and looks up custom transformer', () => {
            const registry = customRegistry()
            const t = registry.get('firstoctet')
            expect(t).not.toBeNull()
            expect(t.name).toBe('firstoctet')
            expect(t.inputType).toBe(Type.String)
            expect(t.outputType).toBe(Type.Int)
        })

        it('builtins still available after registration', () => {
            const registry = customRegistry()
            expect(registry.get('upper')).not.toBeNull()
            expect(registry.get('lower')).not.toBeNull()
            expect(registry.get('len')).not.toBeNull()
        })

        it('parses query with custom transformer in AST', () => {
            const result = parse('src_ip|firstoctet > 192')
            const key = result.root.left.expression.key
            expect(key.transformers).toHaveLength(1)
            expect(key.transformers[0].name).toBe('firstoctet')
        })
    })

    describe('generators', () => {
        const chColumns = { src_ip: chNewColumn('src_ip', false, 'String') }
        const pgColumns = { src_ip: pgNewColumn('src_ip', false, 'text') }
        const srColumns = { src_ip: srNewColumn('src_ip', false, 'VARCHAR') }

        it('ClickHouse generates custom SQL', () => {
            const registry = customRegistry()
            const result = parse('src_ip|firstoctet > 192')
            const sql = chGenerateWhere(result.root, chColumns, registry)
            expect(sql).toContain('toUInt8(splitByChar')
            expect(sql).toContain('> 192')
        })

        it('PostgreSQL generates custom SQL', () => {
            const registry = customRegistry()
            const result = parse('src_ip|firstoctet > 192')
            const sql = pgGenerateWhere(result.root, pgColumns, registry)
            expect(sql).toContain('CAST(SPLIT_PART')
            expect(sql).toContain('> 192')
        })

        it('StarRocks generates custom SQL', () => {
            const registry = customRegistry()
            const result = parse('src_ip|firstoctet > 192')
            const sql = srGenerateWhere(result.root, srColumns, registry)
            expect(sql).toContain('CAST(SPLIT_PART')
            expect(sql).toContain('> 192')
        })

        it('default registry rejects unknown transformer', () => {
            const result = parse('src_ip|firstoctet > 192')
            expect(() => chGenerateWhere(result.root, chColumns)).toThrow('unknown transformer')
        })
    })

    describe('matcher', () => {
        it('applies custom transformer - no match', () => {
            const registry = customRegistry()
            const evaluator = new Evaluator(registry)
            const result = parse('src_ip|firstoctet > 192')
            const record = new Record({ src_ip: '10.0.0.1' })
            expect(evaluator.evaluate(result.root, record)).toBe(false)
        })

        it('applies custom transformer - match', () => {
            const registry = customRegistry()
            const evaluator = new Evaluator(registry)
            const result = parse('src_ip|firstoctet > 192')
            const record = new Record({ src_ip: '193.0.0.1' })
            expect(evaluator.evaluate(result.root, record)).toBe(true)
        })

        it('match() function accepts registry', () => {
            const registry = customRegistry()
            expect(match('src_ip|firstoctet > 192', { src_ip: '193.0.0.1' }, registry)).toBe(true)
            expect(match('src_ip|firstoctet > 192', { src_ip: '10.0.0.1' }, registry)).toBe(false)
        })

        it('default registry rejects unknown transformer', () => {
            const evaluator = new Evaluator()
            const result = parse('src_ip|firstoctet > 192')
            const record = new Record({ src_ip: '10.0.0.1' })
            expect(() => evaluator.evaluate(result.root, record)).toThrow('unknown transformer')
        })
    })

    describe('SplitTransformer SQL escaping', () => {
        const split = new SplitTransformer()

        it('escapes single quotes in delimiter', () => {
            const sql = split.sql('clickhouse', 'col', ["'"])
            expect(sql).toContain("\\'")
            expect(sql).not.toMatch(/[^\\]''/)
        })

        it('escapes backslashes before single quotes', () => {
            const sql = split.sql('clickhouse', 'col', ['\\'])
            expect(sql).toContain('\\\\')
        })

        it('escapes backslash-quote sequence correctly', () => {
            // Input delimiter is \' (backslash + single quote, 2 chars)
            const sql = split.sql('clickhouse', 'col', ["\\'"])
            // Backslash escaped first to \\, then quote to \' => content is \\\' (4 chars)
            // Verify the escaped content between the wrapper quotes
            const innerMatch = sql.match(/splitByString\('(.+)',/)
            expect(innerMatch).not.toBeNull()
            // Inner content should be exactly: \ \ \ ' (backslash, backslash, backslash, quote)
            expect(innerMatch[1]).toBe("\\\\\\'")
        })
    })

    describe('editor suggestions', () => {
        it('custom transformer appears in suggestions', async () => {
            const registry = customRegistry()
            const columns = ColumnSchema.fromPlainObject({
                src_ip: { type: 'string', suggest: true, autocomplete: false },
            })
            const engine = new EditorEngine(columns, { registry })
            engine.setQuery('src_ip|')
            engine.setCursorPosition(7)
            await engine.updateSuggestions()
            const labels = engine.suggestions.map((s) => s.label)
            expect(labels).toContain('firstoctet')
            expect(labels).toContain('upper')
        })
    })
})
