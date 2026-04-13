import { describe, it, expect } from 'vitest'
import { ColumnsEngine } from '../src/columns-engine.js'
import { ColumnSchema } from 'flyql/core'
import { Transformer, TransformerRegistry, defaultRegistry } from 'flyql/transformers'
import { Type } from 'flyql'

const TEST_COLUMNS = ColumnSchema.fromPlainObject({
    level: { type: 'enum', suggest: true },
    service: { type: 'string', suggest: true },
    message: { type: 'string', suggest: true },
    status_code: { type: 'number', suggest: true },
    hidden: { type: 'string', suggest: false },
    host: { type: 'string', suggest: true },
})

const TRANSFORMERS_OPTS = { capabilities: { transformers: true } }

describe('ColumnsEngine', () => {
    describe('constructor', () => {
        it('creates engine with columns', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            expect(engine.columns).toBeInstanceOf(ColumnSchema)
            expect(engine.suggestions).toEqual([])
        })

        it('creates engine without columns', () => {
            const engine = new ColumnsEngine()
            expect(engine.columns).toBeInstanceOf(ColumnSchema)
        })
    })

    describe('buildContext (AC #2, #3)', () => {
        it('empty input expects column', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('')
            expect(ctx.expecting).toBe('column')
        })

        it('typing column name expects column', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('lev')
            expect(ctx.expecting).toBe('column')
            expect(ctx.column).toBe('lev')
        })

        it('after comma expects column', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('level,')
            expect(ctx.expecting).toBe('column')
        })

        it('after pipe expects transformer', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            const ctx = engine.buildContext('message|')
            expect(ctx.expecting).toBe('transformer')
        })

        it('typing transformer expects transformer', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            const ctx = engine.buildContext('message|up')
            expect(ctx.expecting).toBe('transformer')
            expect(ctx.transformer).toBe('up')
        })

        it('after space expects alias (alias operator phase)', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('message ')
            expect(ctx.expecting).toBe('alias')
        })

        it('in transformer arguments expects argument', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            const ctx = engine.buildContext('message|chars(')
            expect(ctx.expecting).toBe('argument')
        })

        it('error state returns error context', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('|||')
            expect(ctx.expecting).toBe('error')
            expect(ctx.error).toBeTruthy()
        })

        it('tracks existing columns', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('level,')
            expect(ctx.existingColumns).toContain('level')
        })

        it('tracks multiple existing columns', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('level,service,')
            expect(ctx.existingColumns).toContain('level')
            expect(ctx.existingColumns).toContain('service')
        })
    })

    describe('updateSuggestions — column phase (AC #2)', () => {
        it('suggests all columns when empty', async () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('')
            engine.setCursorPosition(0)
            await engine.updateSuggestions()
            expect(engine.suggestionType).toBe('column')
            // Should include suggestable columns only (not hidden)
            const labels = engine.suggestions.map((s) => s.label)
            expect(labels).toContain('level')
            expect(labels).toContain('service')
            expect(labels).not.toContain('hidden')
        })

        it('filters columns by prefix', async () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('le')
            engine.setCursorPosition(2)
            await engine.updateSuggestions()
            expect(engine.suggestionType).toBe('column')
            const labels = engine.suggestions.map((s) => s.label)
            expect(labels).toContain('level')
            expect(labels).not.toContain('service')
        })

        it('excludes already-selected columns', async () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('level,')
            engine.setCursorPosition(6)
            await engine.updateSuggestions()
            const labels = engine.suggestions.map((s) => s.label)
            expect(labels).not.toContain('level')
            expect(labels).toContain('service')
        })

        it('column suggestions insert just the name', async () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('')
            engine.setCursorPosition(0)
            await engine.updateSuggestions()
            const item = engine.suggestions.find((s) => s.label === 'level')
            expect(item.insertText).toBe('level')
        })

        it('column suggestions include type detail', async () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('')
            engine.setCursorPosition(0)
            await engine.updateSuggestions()
            const item = engine.suggestions.find((s) => s.label === 'level')
            // Editor normalizes raw 'enum' input to canonical Type.String.
            expect(item.detail).toBe('string')
        })

        it('shows message when no columns match', async () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('zzzzz')
            engine.setCursorPosition(5)
            await engine.updateSuggestions()
            expect(engine.suggestions).toEqual([])
            expect(engine.message).toBe('No matching columns')
        })
    })

    describe('updateSuggestions — exact match shows next-step actions (AC #2)', () => {
        it('exact column match shows delimiter and transformer-pipe first', async () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            engine.setQuery('level')
            engine.setCursorPosition(5)
            await engine.updateSuggestions()
            expect(engine.suggestions[0].type).toBe('delimiter')
            expect(engine.suggestions[0].label).toBe(',')
            expect(engine.suggestions[0].detail).toBe('next column')
            expect(engine.suggestions[1].type).toBe('transformer')
            expect(engine.suggestions[1].label).toBe('|')
            expect(engine.suggestions[1].detail).toBe('transformer (pipe)')
        })

        it('exact match still shows other matching columns below', async () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            engine.setQuery('host')
            engine.setCursorPosition(4)
            await engine.updateSuggestions()
            expect(engine.suggestions[0].type).toBe('delimiter') // comma
            expect(engine.suggestions[1].type).toBe('transformer') // pipe
        })

        it('partial match does NOT show delimiter/transformer-pipe', async () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('lev')
            engine.setCursorPosition(3)
            await engine.updateSuggestions()
            const types = engine.suggestions.map((s) => s.type)
            expect(types).not.toContain('delimiter')
            expect(types).toContain('column')
        })
    })

    describe('updateSuggestions — after column space (next-step suggestions)', () => {
        it('suggests pipe and comma after column + space', async () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            engine.setQuery('message ')
            engine.setCursorPosition(8)
            await engine.updateSuggestions()
            expect(engine.suggestionType).toBe('delimiter')
            const pipe = engine.suggestions.find((s) => s.label === '|')
            expect(pipe.type).toBe('transformer')
            expect(pipe.detail).toBe('transformer (pipe)')
            const comma = engine.suggestions.find((s) => s.label === ',')
            expect(comma.type).toBe('delimiter')
            expect(comma.detail).toBe('next column')
        })
    })

    describe('updateSuggestions — transformer exact match shows next steps', () => {
        it('exact transformer without args shows comma and pipe (no parens)', async () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            engine.setQuery('level|upper')
            engine.setCursorPosition(11)
            await engine.updateSuggestions()
            expect(engine.suggestions[0].label).toBe(',')
            expect(engine.suggestions[1].label).toBe('|')
            // upper has no args, so no () suggestion
            const labels = engine.suggestions.map((s) => s.label)
            expect(labels).not.toContain('()')
        })

        it('exact transformer with args shows comma, parens, and pipe', async () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            engine.setQuery('level|split')
            engine.setCursorPosition(11)
            await engine.updateSuggestions()
            expect(engine.suggestions[0].label).toBe(',')
            expect(engine.suggestions[0].detail).toBe('next column')
            expect(engine.suggestions[1].label).toBe('()')
            expect(engine.suggestions[1].cursorOffset).toBe(-1)
            expect(engine.suggestions[2].label).toBe('|')
            expect(engine.suggestions[2].detail).toBe('transformer (pipe)')
        })

        it('partial transformer match does NOT show next steps', async () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            engine.setQuery('level|up')
            engine.setCursorPosition(8)
            await engine.updateSuggestions()
            const types = engine.suggestions.map((s) => s.type)
            expect(types).not.toContain('delimiter')
            expect(types).toContain('transformer')
        })
    })

    describe('getInsertRange with delimiter/transformer-pipe suggestions', () => {
        it('delimiter suggestion inserts at cursor without replacing prefix', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            const ctx = engine.buildContext('level')
            const delimSuggestion = { label: ',', insertText: ', ', type: 'delimiter' }
            const range = engine.getInsertRange(ctx, 'level', delimSuggestion)
            expect(range.start).toBe(5)
            expect(range.end).toBe(5)
        })

        it('pipe delimiter suggestion inserts at cursor without replacing prefix', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            const ctx = engine.buildContext('level')
            const pipeSuggestion = { label: '|', insertText: '|', type: 'transformer' }
            const range = engine.getInsertRange(ctx, 'level', pipeSuggestion)
            expect(range.start).toBe(5)
            expect(range.end).toBe(5)
        })

        it('column suggestion replaces prefix', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            const ctx = engine.buildContext('lev')
            const colSuggestion = { label: 'level', insertText: 'level', type: 'column' }
            const range = engine.getInsertRange(ctx, 'lev', colSuggestion)
            expect(range.start).toBe(0)
            expect(range.end).toBe(3)
        })
    })

    describe('updateSuggestions — transformer phase (AC #3)', () => {
        it('suggests transformers after pipe', async () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            engine.setQuery('message|')
            engine.setCursorPosition(8)
            await engine.updateSuggestions()
            expect(engine.suggestionType).toBe('transformer')
            const labels = engine.suggestions.map((s) => s.label)
            expect(labels).toContain('upper')
            expect(labels).toContain('lower')
            expect(labels).toContain('split')
            expect(labels).toContain('len')
            expect(labels).not.toContain('chars')
        })

        it('filters transformers by prefix', async () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            engine.setQuery('message|up')
            engine.setCursorPosition(10)
            await engine.updateSuggestions()
            const labels = engine.suggestions.map((s) => s.label)
            expect(labels).toContain('upper')
            expect(labels).not.toContain('lower')
        })
    })

    describe('getHighlightTokens (AC #4)', () => {
        it('highlights column names', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            const html = engine.getHighlightTokens('message')
            expect(html).toContain('flyql-col-column')
        })

        it('highlights operators (comma, pipe)', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            const html = engine.getHighlightTokens('level,service')
            expect(html).toContain('flyql-col-operator')
        })

        it('highlights transformers', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            const html = engine.getHighlightTokens('message|upper')
            expect(html).toContain('flyql-col-transformer')
        })

        it('highlights arguments', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            const html = engine.getHighlightTokens('message|chars(25)')
            expect(html).toContain('flyql-col-argument')
        })

        it('highlights aliases', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            const html = engine.getHighlightTokens('message as msg')
            expect(html).toContain('flyql-col-alias')
        })

        it('returns empty for empty input', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            expect(engine.getHighlightTokens('')).toBe('')
        })
    })

    describe('getParsedColumns (AC #5)', () => {
        it('parses single column', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('message')
            const cols = engine.getParsedColumns()
            expect(cols).toHaveLength(1)
            expect(cols[0].name).toBe('message')
            expect(cols[0].transformers).toEqual([])
            expect(cols[0].alias).toBeNull()
        })

        it('parses multiple columns', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('level,service,message')
            const cols = engine.getParsedColumns()
            expect(cols).toHaveLength(3)
            expect(cols.map((c) => c.name)).toEqual(['level', 'service', 'message'])
        })

        it('parses column with transformer', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            engine.setQuery('message|upper')
            const cols = engine.getParsedColumns()
            expect(cols).toHaveLength(1)
            expect(cols[0].transformers).toHaveLength(1)
            expect(cols[0].transformers[0].name).toBe('upper')
        })

        it('parses column with alias', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('message as msg')
            const cols = engine.getParsedColumns()
            expect(cols).toHaveLength(1)
            expect(cols[0].alias).toBe('msg')
        })

        it('parses complex expression', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            engine.setQuery('message|upper|chars(25) as msg,level')
            const cols = engine.getParsedColumns()
            expect(cols).toHaveLength(2)
            expect(cols[0].name).toBe('message')
            expect(cols[0].transformers).toHaveLength(2)
            expect(cols[0].alias).toBe('msg')
            expect(cols[1].name).toBe('level')
        })

        it('returns empty for empty input', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('')
            expect(engine.getParsedColumns()).toEqual([])
        })

        it('returns empty for invalid input', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('|||')
            expect(engine.getParsedColumns()).toEqual([])
        })
    })

    describe('getQueryStatus', () => {
        it('valid for single column', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('message')
            expect(engine.getQueryStatus().valid).toBe(true)
        })

        it('valid for multiple columns', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('level,service')
            expect(engine.getQueryStatus().valid).toBe(true)
        })

        it('valid for column with transformer', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            engine.setQuery('message|upper')
            expect(engine.getQueryStatus().valid).toBe(true)
        })

        it('valid for empty', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('')
            expect(engine.getQueryStatus().valid).toBe(true)
        })

        it('invalid for unclosed arguments', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            engine.setQuery('message|chars(')
            expect(engine.getQueryStatus().valid).toBe(false)
        })
    })

    describe('navigation', () => {
        it('navigateDown wraps around', async () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('')
            engine.setCursorPosition(0)
            await engine.updateSuggestions()
            const count = engine.suggestions.length
            for (let i = 0; i < count; i++) engine.navigateDown()
            expect(engine.state.selectedIndex).toBe(0) // wrapped
        })

        it('navigateUp wraps around', async () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('')
            engine.setCursorPosition(0)
            await engine.updateSuggestions()
            engine.navigateUp()
            expect(engine.state.selectedIndex).toBe(engine.suggestions.length - 1)
        })
    })

    describe('getInsertRange', () => {
        it('returns range for column prefix', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('lev')
            const range = engine.getInsertRange(ctx, 'lev')
            expect(range.start).toBe(0)
            expect(range.end).toBe(3)
        })

        it('returns range for transformer prefix', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            const ctx = engine.buildContext('message|up')
            const range = engine.getInsertRange(ctx, 'message|up')
            expect(range.start).toBe(8)
            expect(range.end).toBe(10)
        })

        it('returns zero range for empty context', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            const range = engine.getInsertRange(null, '')
            expect(range.start).toBe(0)
            expect(range.end).toBe(0)
        })
    })

    describe('highlightMatch', () => {
        it('highlights matching prefix', async () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('le')
            engine.setCursorPosition(2)
            await engine.updateSuggestions()
            const html = engine.highlightMatch('level')
            expect(html).toContain('flyql-panel__match')
            expect(html).toContain('le')
        })

        it('returns plain text when no prefix', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            expect(engine.highlightMatch('level')).toBe('level')
        })
    })

    describe('capabilities', () => {
        it('default engine (transformers enabled): pipe in column returns transformer context', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('message|')
            expect(ctx.expecting).toBe('transformer')
        })

        it('default engine: exact column suggestions include pipe', async () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('level')
            engine.setCursorPosition(5)
            await engine.updateSuggestions()
            const labels = engine.suggestions.map((s) => s.label)
            expect(labels).toContain(',')
            expect(labels).toContain('|')
        })

        it('default engine: alias state includes pipe', async () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('message ')
            engine.setCursorPosition(8)
            await engine.updateSuggestions()
            const labels = engine.suggestions.map((s) => s.label)
            expect(labels).toContain(',')
            expect(labels).toContain('|')
        })

        it('transformers disabled: pipe in column triggers error', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, { capabilities: { transformers: false } })
            const ctx = engine.buildContext('message|')
            expect(ctx.expecting).toBe('error')
            expect(ctx.error).toContain('transformers are not enabled')
        })

        it('transformers enabled explicitly: pipe in column returns transformer context', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            const ctx = engine.buildContext('message|')
            expect(ctx.expecting).toBe('transformer')
        })

        it('transformers enabled: exact column suggestions include pipe', async () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            engine.setQuery('level')
            engine.setCursorPosition(5)
            await engine.updateSuggestions()
            const labels = engine.suggestions.map((s) => s.label)
            expect(labels).toContain(',')
            expect(labels).toContain('|')
        })
    })

    describe('getDiagnostics', () => {
        it('empty query returns empty', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            engine.setQuery('')
            const diags = engine.getDiagnostics()
            expect(diags).toEqual([])
        })

        it('valid columns return empty', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            engine.setQuery('level')
            const diags = engine.getDiagnostics()
            expect(diags).toEqual([])
        })

        it('unknown column returns diagnostic', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            engine.setQuery('foo, level')
            const diags = engine.getDiagnostics()
            expect(diags.length).toBeGreaterThan(0)
            expect(diags[0].code).toBe('unknown_column')
        })

        it('unknown transformer returns diagnostic', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            engine.setQuery('level|nonexistent, service')
            const diags = engine.getDiagnostics()
            expect(diags.length).toBeGreaterThan(0)
            expect(diags[0].code).toBe('unknown_transformer')
        })

        it('smart suppression: partial column prefix at end is suppressed', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            engine.setQuery('lev')
            const diags = engine.getDiagnostics()
            expect(diags).toEqual([])
        })

        it('smart suppression: non-end diagnostic not suppressed', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            engine.setQuery('foo, level')
            const diags = engine.getDiagnostics()
            expect(diags.length).toBe(1)
            expect(diags[0].code).toBe('unknown_column')
        })

        it('syntax error at end is suppressed', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            engine.setQuery('level|')
            const diags = engine.getDiagnostics()
            expect(diags).toEqual([])
        })

        it('stores diagnostics on engine', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            engine.setQuery('foo, level')
            engine.getDiagnostics()
            expect(engine.diagnostics.length).toBe(1)
            expect(engine.diagnostics[0].code).toBe('unknown_column')
        })
    })

    describe('getHighlightTokens with diagnostics', () => {
        it('includes flyql-diagnostic class for errors', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            engine.setQuery('foo, level')
            const diags = engine.getDiagnostics()
            const html = engine.getHighlightTokens('foo, level', diags)
            expect(html).toContain('flyql-diagnostic')
        })

        it('includes flyql-diagnostic--highlight when highlightDiagIndex matches', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            engine.setQuery('foo, level')
            const diags = engine.getDiagnostics()
            if (diags.length > 0) {
                const html = engine.getHighlightTokens('foo, level', diags, 0)
                expect(html).toContain('flyql-diagnostic--highlight')
            }
        })

        it('no diagnostic classes when diagnostics is null', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            const html = engine.getHighlightTokens('level')
            expect(html).not.toContain('flyql-diagnostic')
        })

        it('escapes double quotes in diagnostic title attribute', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            engine.setQuery('foo, level')
            const diags = engine.getDiagnostics()
            expect(diags.length).toBeGreaterThan(0)
            // Inject a message with double quotes to verify escaping
            diags[0].message = 'column "foo" is unknown'
            const html = engine.getHighlightTokens('foo, level', diags)
            // Double quotes in the message must be escaped as &quot; in the title attribute
            expect(html).toContain('&quot;foo&quot;')
            expect(html).not.toContain('title="column "')
        })
    })

    describe('framework independence', () => {
        it('has no framework imports', async () => {
            const { readFileSync } = await import('fs')
            const { resolve } = await import('path')
            const content = readFileSync(resolve(import.meta.dirname, '../src/columns-engine.js'), 'utf-8')
            expect(content).not.toMatch(/from\s+['"]vue['"]/)
            expect(content).not.toMatch(/from\s+['"]react['"]/)
        })
    })

    describe('custom transformer registry', () => {
        class MyCustomTransformer extends Transformer {
            get name() {
                return 'myCustom'
            }
            get inputType() {
                return Type.String
            }
            get outputType() {
                return Type.String
            }
            apply(value) {
                return value
            }
        }

        function customRegistry() {
            const reg = defaultRegistry()
            reg.register(new MyCustomTransformer())
            return reg
        }

        it('shows custom transformer in suggestions', async () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, { ...TRANSFORMERS_OPTS, registry: customRegistry() })
            engine.setQuery('message|')
            engine.setCursorPosition(8)
            await engine.updateSuggestions()
            const labels = engine.suggestions.map((s) => s.label)
            expect(labels).toContain('myCustom')
            expect(labels).toContain('upper')
        })

        it('custom transformer produces no unknown diagnostic', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, { ...TRANSFORMERS_OPTS, registry: customRegistry() })
            engine.setQuery('message|myCustom, level')
            const diags = engine.getDiagnostics()
            const unknownTransformer = diags.filter((d) => d.code === 'unknown_transformer')
            expect(unknownTransformer).toEqual([])
        })

        it('default registry shows built-in transformers', async () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            engine.setQuery('message|')
            engine.setCursorPosition(8)
            await engine.updateSuggestions()
            const labels = engine.suggestions.map((s) => s.label)
            const builtins = defaultRegistry().names()
            for (const name of builtins) {
                expect(labels).toContain(name)
            }
            expect(labels).not.toContain('myCustom')
        })

        it('custom registry with additional transformer shows both built-in and custom', async () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, { ...TRANSFORMERS_OPTS, registry: customRegistry() })
            engine.setQuery('message|')
            engine.setCursorPosition(8)
            await engine.updateSuggestions()
            const labels = engine.suggestions.map((s) => s.label)
            expect(labels).toContain('upper')
            expect(labels).toContain('lower')
            expect(labels).toContain('len')
            expect(labels).toContain('split')
            expect(labels).toContain('myCustom')
        })

        it('setRegistry updates suggestion output', async () => {
            const engine = new ColumnsEngine(TEST_COLUMNS, TRANSFORMERS_OPTS)
            engine.setQuery('message|')
            engine.setCursorPosition(8)
            await engine.updateSuggestions()
            expect(engine.suggestions.map((s) => s.label)).not.toContain('myCustom')

            engine.setRegistry(customRegistry())
            await engine.updateSuggestions()
            expect(engine.suggestions.map((s) => s.label)).toContain('myCustom')
        })
    })
})
