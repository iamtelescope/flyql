import { describe, it, expect } from 'vitest'
import { EditorEngine } from '../src/engine.js'
import { Diagnostic, Range, ColumnSchema } from 'flyql/core'

const TEST_COLUMNS = ColumnSchema.fromPlainObject({
    status: {
        type: 'enum',
        suggest: true,
        autocomplete: true,
        values: ['debug', 'info', 'warning', 'error'],
    },
    host: {
        type: 'string',
        suggest: true,
        autocomplete: true,
    },
    level: {
        type: 'number',
        suggest: true,
        autocomplete: false,
    },
    hidden: {
        type: 'string',
        suggest: false,
        autocomplete: false,
    },
})

describe('EditorEngine', () => {
    describe('constructor', () => {
        it('creates engine with columns', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            expect(engine.columns).toBeInstanceOf(ColumnSchema)
            expect(engine.suggestions).toEqual([])
            expect(engine.context).toBeNull()
            expect(engine.isLoading).toBe(false)
        })

        it('creates engine with empty columns', () => {
            const engine = new EditorEngine()
            expect(engine.columns).toBeInstanceOf(ColumnSchema)
        })

        it('accepts onAutocomplete option', () => {
            const fn = async () => ({ items: [] })
            const engine = new EditorEngine(TEST_COLUMNS, { onAutocomplete: fn })
            expect(engine.onAutocomplete).toBe(fn)
        })
    })

    describe('setQuery', () => {
        it('sets query text', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('status=info')
            expect(engine.state.query).toBe('status=info')
        })

        it('handles null/empty', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery(null)
            expect(engine.state.query).toBe('')
            engine.setQuery('')
            expect(engine.state.query).toBe('')
        })
    })

    describe('setCursorPosition', () => {
        it('sets cursor position', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('status=info')
            engine.setCursorPosition(6)
            expect(engine.state.cursorPosition).toBe(6)
        })
    })

    describe('buildContext', () => {
        it('returns column expecting for empty input', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('')
            expect(ctx.expecting).toBe('column')
            expect(ctx.state).toBe('INITIAL')
        })

        it('returns column expecting for partial key', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('sta')
            expect(ctx.expecting).toBe('column')
            expect(ctx.key).toBe('sta')
        })

        it('returns operatorOrBool after complete key', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('status ')
            expect(ctx.expecting).toBe('operatorOrBool')
        })

        it('returns value expecting after operator', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('status=')
            expect(ctx.expecting).toBe('value')
        })

        it('returns boolOp expecting after complete expression', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('status=info ')
            expect(ctx.expecting).toBe('boolOp')
        })

        it('returns operatorPrefix for > (could be >=)', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('status>')
            expect(ctx.expecting).toBe('operatorPrefix')
            expect(ctx.keyValueOperator).toBe('>')
        })

        it('returns operatorPrefix for < (could be <=)', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('status<')
            expect(ctx.expecting).toBe('operatorPrefix')
            expect(ctx.keyValueOperator).toBe('<')
        })

        it('returns value for >= (no longer variant)', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('status>=')
            expect(ctx.expecting).toBe('value')
        })

        it('returns value for = (no longer variant starting with =)', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('status=')
            expect(ctx.expecting).toBe('value')
        })

        it('returns operatorPrefix for ! (could be != or !~)', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('status!')
            expect(ctx.expecting).toBe('operatorPrefix')
            expect(ctx.keyValueOperator).toBe('!')
        })

        it('returns none expecting for EXPECT_HAS_KEYWORD state', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('status not h')
            expect(ctx.expecting).toBe('none')
        })

        it('returns ERROR for invalid input', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('===')
            expect(ctx.state).toBe('ERROR')
        })

        it('returns quoteChar for quoted values', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('status="inf')
            expect(ctx.expecting).toBe('value')
            expect(ctx.quoteChar).toBe('"')
        })

        it('returns quoteChar for single quoted values', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const ctx = engine.buildContext("status='inf")
            expect(ctx.expecting).toBe('value')
            expect(ctx.quoteChar).toBe("'")
        })

        it('returns transformer expecting after pipe on column', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('host|')
            expect(ctx.expecting).toBe('transformer')
            expect(ctx.transformerBaseKey).toBe('host')
            expect(ctx.transformerPrefix).toBe('')
            expect(ctx.transformerChain).toBe('')
        })

        it('returns transformer expecting with partial prefix', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('host|up')
            expect(ctx.expecting).toBe('transformer')
            expect(ctx.transformerBaseKey).toBe('host')
            expect(ctx.transformerPrefix).toBe('up')
            expect(ctx.transformerChain).toBe('')
        })

        it('returns transformer expecting for chained transformer', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('host|upper|')
            expect(ctx.expecting).toBe('transformer')
            expect(ctx.transformerBaseKey).toBe('host')
            expect(ctx.transformerPrefix).toBe('')
            expect(ctx.transformerChain).toBe('upper')
        })

        it('returns transformer expecting for chained with prefix', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('host|upper|le')
            expect(ctx.expecting).toBe('transformer')
            expect(ctx.transformerBaseKey).toBe('host')
            expect(ctx.transformerPrefix).toBe('le')
            expect(ctx.transformerChain).toBe('upper')
        })

        it('returns transformer expecting for multi-chain', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('host|lower|upper|')
            expect(ctx.expecting).toBe('transformer')
            expect(ctx.transformerBaseKey).toBe('host')
            expect(ctx.transformerPrefix).toBe('')
            expect(ctx.transformerChain).toBe('lower|upper')
        })

        it('returns transformer expecting after complete transformer with space', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('host|upper ')
            expect(ctx.expecting).toBe('operatorOrBool')
            expect(ctx.key).toBe('host')
        })

        it('normalizes key to base column after transformer in value state', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('host|upper =')
            expect(ctx.expecting).toBe('value')
            expect(ctx.key).toBe('host')
            expect(ctx.transformerBaseKey).toBe('host')
        })

        it('normalizes key to base column after chained transformer in value state', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('host|upper|lower =')
            expect(ctx.expecting).toBe('value')
            expect(ctx.key).toBe('host')
        })
    })

    describe('updateSuggestions', () => {
        it('returns column suggestions for empty input', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('')
            engine.setCursorPosition(0)
            await engine.updateSuggestions()
            expect(engine.suggestions.length).toBeGreaterThan(0)
            expect(engine.suggestionType).toBe('column')
            // Should not include hidden columns
            const labels = engine.suggestions.map((s) => s.label)
            expect(labels).toContain('status')
            expect(labels).toContain('host')
            expect(labels).not.toContain('hidden')
        })

        it('filters column suggestions by prefix', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('sta')
            engine.setCursorPosition(3)
            await engine.updateSuggestions()
            expect(engine.suggestions.length).toBe(1)
            expect(engine.suggestions[0].label).toBe('status')
        })

        it('returns operator suggestions for known column', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('status')
            engine.setCursorPosition(6)
            await engine.updateSuggestions()
            expect(engine.suggestionType).toBe('operator')
            expect(engine.suggestions.length).toBeGreaterThan(0)
        })

        it('returns filtered operator suggestions for prefix operator >', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('status>')
            engine.setCursorPosition(7)
            await engine.updateSuggestions()
            expect(engine.suggestionType).toBe('operator')
            const labels = engine.suggestions.map((s) => s.label)
            expect(labels).toContain('>')
            expect(labels).toContain('>=')
            expect(labels).not.toContain('=')
            expect(labels).not.toContain('<')
        })

        it('returns filtered operator suggestions for prefix operator <', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('status<')
            engine.setCursorPosition(7)
            await engine.updateSuggestions()
            expect(engine.suggestionType).toBe('operator')
            const labels = engine.suggestions.map((s) => s.label)
            expect(labels).toContain('<')
            expect(labels).toContain('<=')
            expect(labels).not.toContain('>')
        })

        it('returns filtered operator suggestions for prefix operator !', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('host!')
            engine.setCursorPosition(5)
            await engine.updateSuggestions()
            expect(engine.suggestionType).toBe('operator')
            const labels = engine.suggestions.map((s) => s.label)
            expect(labels).toContain('!=')
            expect(labels).toContain('!~')
            expect(labels).not.toContain('=')
            expect(labels).not.toContain('>')
        })

        it('returns value suggestions for enum column', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('status=')
            engine.setCursorPosition(7)
            await engine.updateSuggestions()
            expect(engine.suggestionType).toBe('value')
            expect(engine.suggestions.length).toBe(4)
        })

        it('returns boolOp suggestions after complete expression', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('status=info ')
            engine.setCursorPosition(12)
            await engine.updateSuggestions()
            expect(engine.suggestionType).toBe('boolOp')
            expect(engine.suggestions.length).toBe(4)
        })

        it('returns error message for invalid input', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('===')
            engine.setCursorPosition(3)
            await engine.updateSuggestions()
            expect(engine.suggestions).toEqual([])
            expect(engine.message).toBeTruthy()
        })

        it('excludes regex operators for enum columns', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('status')
            engine.setCursorPosition(6)
            await engine.updateSuggestions()
            const labels = engine.suggestions.map((s) => s.label)
            expect(labels).not.toContain('~')
            expect(labels).not.toContain('!~')
        })

        it('excludes regex operators for number columns', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('level')
            engine.setCursorPosition(5)
            await engine.updateSuggestions()
            const labels = engine.suggestions.map((s) => s.label)
            expect(labels).not.toContain('~')
            expect(labels).not.toContain('!~')
            expect(labels).toContain('=')
            expect(labels).toContain('>')
        })

        it('includes regex operators for string columns', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('host')
            engine.setCursorPosition(4)
            await engine.updateSuggestions()
            const labels = engine.suggestions.map((s) => s.label)
            expect(labels).toContain('~')
            expect(labels).toContain('!~')
        })

        it('returns disabled autocomplete message', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('level=')
            engine.setCursorPosition(6)
            await engine.updateSuggestions()
            expect(engine.message).toBe('Autocompletion is disabled for this column')
        })

        it('suggests operators and pipe after complete transformer', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('host|upper')
            engine.setCursorPosition(10)
            await engine.updateSuggestions()
            const labels = engine.suggestions.map((s) => s.label)
            expect(labels).toContain('|')
            expect(labels).toContain('=')
            expect(labels).toContain('!=')
            expect(engine.suggestionType).toBe('operator')
        })

        it('operators after transformer have leading space in insertText', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('host|upper')
            engine.setCursorPosition(10)
            await engine.updateSuggestions()
            const eq = engine.suggestions.find((s) => s.label === '=')
            expect(eq.insertText).toBe(' =')
            const neq = engine.suggestions.find((s) => s.label === '!=')
            expect(neq.insertText).toBe(' !=')
        })

        it('pipe after complete transformer has type transformer', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('host|upper')
            engine.setCursorPosition(10)
            await engine.updateSuggestions()
            const pipe = engine.suggestions.find((s) => s.label === '|')
            expect(pipe).toBeTruthy()
            expect(pipe.type).toBe('transformer')
        })

        it('no pipe after len transformer (int output, no int-input builtins)', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('host|len')
            engine.setCursorPosition(8)
            await engine.updateSuggestions()
            const labels = engine.suggestions.map((s) => s.label)
            expect(labels).not.toContain('|')
            expect(labels).toContain('=')
        })

        it('suggests operators and pipe after chained transformer', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('host|upper|lower')
            engine.setCursorPosition(16)
            await engine.updateSuggestions()
            const labels = engine.suggestions.map((s) => s.label)
            expect(labels).toContain('|')
            expect(labels).toContain('=')
        })

        it('suggests transformer names for partial prefix after pipe', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('host|up')
            engine.setCursorPosition(7)
            await engine.updateSuggestions()
            expect(engine.suggestionType).toBe('transformer')
            expect(engine.suggestions.map((s) => s.label)).toContain('upper')
        })

        it('shows type incompatibility error for field|len|', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('host|len|')
            engine.setCursorPosition(9)
            await engine.updateSuggestions()
            expect(engine.suggestions).toHaveLength(0)
            expect(engine.message).toBe('No matching transformers')
        })

        it('shows specific type mismatch naming the attempted transformer', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('host|len|upper')
            engine.setCursorPosition(14)
            await engine.updateSuggestions()
            // Diagnostics catch the chain type error
            engine.getDiagnostics()
            expect(engine.diagnostics.some((d) => d.code === 'chain_type')).toBe(true)
        })

        it('shows unknown transformer error for field|bogus', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('host|bogus')
            engine.setCursorPosition(10)
            await engine.updateSuggestions()
            expect(engine.suggestions).toHaveLength(0)
            expect(engine.message).toBe('No matching transformers')
            // Diagnostics catch the unknown transformer
            engine.getDiagnostics()
            expect(engine.diagnostics.some((d) => d.code === 'unknown_transformer')).toBe(true)
        })
    })

    describe('getHighlightTokens', () => {
        it('returns empty string for empty query', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('')
            expect(engine.getHighlightTokens()).toBe('')
        })

        it('generates highlight HTML for valid query', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('status=info')
            const html = engine.getHighlightTokens()
            expect(html).toContain('flyql-key')
            expect(html).toContain('flyql-operator')
            expect(html).toContain('flyql-column')
        })

        it('handles parse errors in highlight', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('status=info ===')
            const html = engine.getHighlightTokens()
            expect(html).toContain('flyql-error')
        })

        it('escapes HTML in query text', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('key="<script>"')
            const html = engine.getHighlightTokens()
            expect(html).not.toContain('<script>')
            expect(html).toContain('&lt;script&gt;')
        })

        it('highlights transformer with distinct class', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const html = engine.getHighlightTokens('host|upper=value')
            expect(html).toContain('flyql-key')
            expect(html).toContain('flyql-transformer')
            expect(html).toContain('flyql-operator')
            expect(html).toContain('flyql-column')
        })

        it('highlights chained transformers', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const html = engine.getHighlightTokens('field|lower|len>10')
            // Both pipe and transformer names should get flyql-transformer class
            const transformerMatches = html.match(/flyql-transformer/g)
            // At minimum: |, lower, |, len = 4 spans (may merge consecutive same-type)
            expect(transformerMatches.length).toBeGreaterThanOrEqual(2)
        })

        it('does not use transformer class for queries without pipe', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const html = engine.getHighlightTokens('status=info')
            expect(html).not.toContain('flyql-transformer')
        })
    })

    describe('getQueryStatus', () => {
        it('returns valid for empty query', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('')
            const status = engine.getQueryStatus()
            expect(status.valid).toBe(true)
            expect(status.message).toBe('Empty query')
        })

        it('returns valid for complete query', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('status="info"')
            const status = engine.getQueryStatus()
            expect(status.valid).toBe(true)
            expect(status.message).toBe('Valid query')
        })

        it('returns valid for unquoted value', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('status=info')
            const status = engine.getQueryStatus()
            expect(status.valid).toBe(true)
        })

        it('returns valid for truthy expression', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('status')
            const status = engine.getQueryStatus()
            expect(status.valid).toBe(true)
        })

        it('returns valid for complex query with unquoted values', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('level="debug" and not host=prod or status')
            const status = engine.getQueryStatus()
            expect(status.valid).toBe(true)
        })

        it('returns invalid for incomplete query', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('status=')
            const status = engine.getQueryStatus()
            expect(status.valid).toBe(false)
        })

        it('returns invalid for error query', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('===')
            const status = engine.getQueryStatus()
            expect(status.valid).toBe(false)
        })
    })

    describe('navigation', () => {
        it('navigates down through suggestions', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('')
            engine.setCursorPosition(0)
            await engine.updateSuggestions()
            expect(engine.state.selectedIndex).toBe(0)
            engine.navigateDown()
            expect(engine.state.selectedIndex).toBe(1)
        })

        it('wraps around when navigating down past end', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('')
            engine.setCursorPosition(0)
            await engine.updateSuggestions()
            const count = engine.suggestions.length
            for (let i = 0; i < count; i++) {
                engine.navigateDown()
            }
            expect(engine.state.selectedIndex).toBe(0)
        })

        it('navigates up through suggestions', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('')
            engine.setCursorPosition(0)
            await engine.updateSuggestions()
            engine.navigateUp()
            expect(engine.state.selectedIndex).toBe(engine.suggestions.length - 1)
        })

        it('does nothing when no suggestions', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.navigateDown()
            expect(engine.state.selectedIndex).toBe(0)
            engine.navigateUp()
            expect(engine.state.selectedIndex).toBe(0)
        })
    })

    describe('selectSuggestion', () => {
        it('returns suggestion at index', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('')
            engine.setCursorPosition(0)
            await engine.updateSuggestions()
            const suggestion = engine.selectSuggestion(0)
            expect(suggestion).toBeTruthy()
            expect(suggestion.type).toBe('column')
        })

        it('returns null for invalid index', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            expect(engine.selectSuggestion(0)).toBeNull()
            expect(engine.selectSuggestion(-1)).toBeNull()
        })
    })

    describe('getInsertRange', () => {
        it('returns range for column replacement', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('sta')
            engine.setCursorPosition(3)
            await engine.updateSuggestions()
            const range = engine.getInsertRange(engine.context, 'sta')
            expect(range.start).toBe(0)
            expect(range.end).toBe(3)
        })

        it('returns range for operator insertion', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('status')
            engine.setCursorPosition(6)
            await engine.updateSuggestions()
            const range = engine.getInsertRange(engine.context, 'status')
            expect(range.start).toBe(6)
        })

        it('returns range for value replacement', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('status=in')
            engine.setCursorPosition(9)
            await engine.updateSuggestions()
            const range = engine.getInsertRange(engine.context, 'status=in')
            expect(range.start).toBe(7)
        })
    })

    describe('getState', () => {
        it('returns full state snapshot', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('test')
            engine.setCursorPosition(4)
            const state = engine.getState()
            expect(state.query).toBe('test')
            expect(state.cursorPosition).toBe(4)
            expect(state).toHaveProperty('focused')
            expect(state).toHaveProperty('activated')
            expect(state).toHaveProperty('suggestions')
            expect(state).toHaveProperty('suggestionType')
            expect(state).toHaveProperty('message')
            expect(state).toHaveProperty('isLoading')
        })
    })

    describe('getParseError', () => {
        it('returns null when no error', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('status')
            engine.setCursorPosition(6)
            await engine.updateSuggestions()
            expect(engine.getParseError()).toBeNull()
        })

        it('returns error message on parse error', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('===')
            engine.setCursorPosition(3)
            await engine.updateSuggestions()
            expect(engine.getParseError()).toBeTruthy()
        })
    })

    describe('getStateLabel', () => {
        it('returns label for column type', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('')
            engine.setCursorPosition(0)
            await engine.updateSuggestions()
            expect(engine.getStateLabel()).toBe('column name')
        })

        it('returns label for boolOp type', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('status=info ')
            engine.setCursorPosition(12)
            await engine.updateSuggestions()
            expect(engine.getStateLabel()).toBe('boolean operator')
        })
    })

    describe('highlightMatch', () => {
        it('highlights matching prefix', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('sta')
            engine.setCursorPosition(3)
            await engine.updateSuggestions()
            const html = engine.highlightMatch('status')
            expect(html).toContain('flyql-panel__match')
            expect(html).toContain('sta')
        })

        it('returns plain text when no prefix', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('')
            engine.setCursorPosition(0)
            await engine.updateSuggestions()
            const html = engine.highlightMatch('status')
            expect(html).toBe('status')
        })

        it('escapes HTML in label', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const html = engine.highlightMatch('<b>test</b>')
            expect(html).not.toContain('<b>')
            expect(html).toContain('&lt;b&gt;')
        })
    })

    describe('async value loading', () => {
        it('loads values via onAutocomplete', async () => {
            const engine = new EditorEngine(TEST_COLUMNS, {
                debounceMs: 0,
                onAutocomplete: async (key) => ({
                    items: ['host-1', 'host-2'],
                }),
            })
            engine.setQuery('host=')
            engine.setCursorPosition(5)
            await engine.updateSuggestions()
            expect(engine.suggestions.length).toBe(2)
        })

        it('re-fetches on every update when incomplete is true', async () => {
            let callCount = 0
            const engine = new EditorEngine(TEST_COLUMNS, {
                debounceMs: 0,
                onAutocomplete: async (key) => {
                    callCount++
                    return { items: ['host-1'], incomplete: true }
                },
            })
            engine.setQuery('host=')
            engine.setCursorPosition(5)
            await engine.updateSuggestions()
            expect(callCount).toBe(1)
            engine.setQuery('host=h')
            engine.setCursorPosition(6)
            await engine.updateSuggestions()
            expect(callCount).toBe(2)
        })

        it('does not re-fetch when incomplete is false (client-side filter)', async () => {
            let callCount = 0
            const engine = new EditorEngine(TEST_COLUMNS, {
                debounceMs: 0,
                onAutocomplete: async (key) => {
                    callCount++
                    return { items: ['host-1', 'host-2', 'other'], incomplete: false }
                },
            })
            engine.setQuery('host=')
            engine.setCursorPosition(5)
            await engine.updateSuggestions()
            expect(callCount).toBe(1)
            expect(engine.suggestions.length).toBe(3)

            // Type more — should filter client-side, no new server call
            engine.setQuery('host=h')
            engine.setCursorPosition(6)
            await engine.updateSuggestions()
            expect(callCount).toBe(1) // no additional call
            expect(engine.suggestions.length).toBe(2) // host-1, host-2
            expect(engine.suggestions[0].label).toBe('host-1')
        })

        it('passes typed value prefix to onAutocomplete', async () => {
            let lastValue = null
            const engine = new EditorEngine(TEST_COLUMNS, {
                debounceMs: 0,
                onAutocomplete: async (key, value) => {
                    lastValue = value
                    return { items: ['host-1', 'host-2'] }
                },
            })
            engine.setQuery('host=h')
            engine.setCursorPosition(6)
            await engine.updateSuggestions()
            expect(lastValue).toBe('h')
        })

        it('discards stale async results via sequence counter', async () => {
            let resolveFirst
            const engine = new EditorEngine(TEST_COLUMNS, {
                debounceMs: 0,
                onAutocomplete: async (key) => {
                    if (!resolveFirst) {
                        return new Promise((resolve) => {
                            resolveFirst = () => resolve({ items: ['stale-1'] })
                        })
                    }
                    return { items: ['fresh-1', 'fresh-2'] }
                },
            })

            // Start first (slow) request
            engine.setQuery('host=')
            engine.setCursorPosition(5)
            const first = engine.updateSuggestions()

            // Start second (fast) request — invalidates the first
            engine.setQuery('host=')
            engine.setCursorPosition(5)
            await engine.updateSuggestions()
            expect(engine.suggestions.length).toBe(2)

            // Now resolve the stale first request
            resolveFirst()
            await first
            // Stale result should have been discarded
            expect(engine.suggestions.length).toBe(2)
            expect(engine.suggestions[0].label).toBe('fresh-1')
        })

        it('initial load has no debounce', async () => {
            let callCount = 0
            const engine = new EditorEngine(TEST_COLUMNS, {
                debounceMs: 300,
                onAutocomplete: async () => {
                    callCount++
                    return { items: ['host-1'], incomplete: false }
                },
            })
            engine.setQuery('host=')
            engine.setCursorPosition(5)
            // Should not need to wait for debounce — initial load is immediate
            await engine.updateSuggestions()
            expect(callCount).toBe(1)
            expect(engine.suggestions.length).toBe(1)
        })

        it('debounces keystrokes while initial fetch is in flight', async () => {
            let callCount = 0
            let resolveFirst
            const engine = new EditorEngine(TEST_COLUMNS, {
                debounceMs: 300,
                onAutocomplete: async () => {
                    callCount++
                    if (callCount === 1) {
                        return new Promise((resolve) => {
                            resolveFirst = () => resolve({ items: ['host-1', 'host-2'], incomplete: true })
                        })
                    }
                    return { items: ['host-1'], incomplete: true }
                },
            })

            // Start initial load (in flight, no debounce for first fetch)
            engine.setQuery('host=')
            engine.setCursorPosition(5)
            const first = engine.updateSuggestions()

            // Type more while first is in flight — hits refinement branch with debounce
            engine.setQuery('host=h')
            engine.setCursorPosition(6)
            const second = engine.updateSuggestions()

            // Only 1 call should have been made (the initial one);
            // the second is waiting on the 300ms debounce timer
            expect(callCount).toBe(1)

            // Resolve the first to let it settle
            resolveFirst()
            await first
            // Second is still debouncing — seq mismatch discards it
        })

        it('resets _valueState when key changes', async () => {
            let callCount = 0
            const columns = ColumnSchema.fromPlainObject({
                host: { type: 'string', suggest: true, autocomplete: true },
                service: { type: 'string', suggest: true, autocomplete: true },
            })
            const engine = new EditorEngine(columns, {
                debounceMs: 0,
                onAutocomplete: async (key) => {
                    callCount++
                    return { items: [key + '-val'], incomplete: false }
                },
            })
            engine.setQuery('host=')
            engine.setCursorPosition(5)
            await engine.updateSuggestions()
            expect(callCount).toBe(1)

            // Same key, should use client-side filter
            engine.setQuery('host=h')
            engine.setCursorPosition(6)
            await engine.updateSuggestions()
            expect(callCount).toBe(1)

            // Different key — should reset and fetch again
            engine.setQuery('service=')
            engine.setCursorPosition(8)
            await engine.updateSuggestions()
            expect(callCount).toBe(2)
        })

        it('shows "No matching values" when server returns 0 items', async () => {
            const engine = new EditorEngine(TEST_COLUMNS, {
                debounceMs: 0,
                onAutocomplete: async () => ({ items: [], incomplete: false }),
            })
            engine.setQuery('host=')
            engine.setCursorPosition(5)
            await engine.updateSuggestions()
            expect(engine.suggestions.length).toBe(0)
            expect(engine.message).toBe('No matching values')
        })

        it('does not show "No matching values" for empty client-side filter', async () => {
            const engine = new EditorEngine(TEST_COLUMNS, {
                debounceMs: 0,
                onAutocomplete: async () => ({ items: ['alpha', 'beta'], incomplete: false }),
            })
            engine.setQuery('host=')
            engine.setCursorPosition(5)
            await engine.updateSuggestions()
            expect(engine.suggestions.length).toBe(2)

            // Client-side filter yields 0 — no message
            engine.setQuery('host=zzz')
            engine.setCursorPosition(8)
            await engine.updateSuggestions()
            expect(engine.suggestions.length).toBe(0)
            expect(engine.message).toBe('')
        })
    })

    describe('parenthesis grouping (AC #6)', () => {
        it('( at start expects column suggestions', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('(')
            engine.setCursorPosition(1)
            await engine.updateSuggestions()
            expect(engine.suggestionType).toBe('column')
            expect(engine.suggestions.length).toBeGreaterThan(0)
        })

        it('buildContext includes nestingDepth after (', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('(')
            engine.setCursorPosition(1)
            await engine.updateSuggestions()
            expect(engine.context.nestingDepth).toBe(1)
        })

        it(') after clause transitions to boolOp phase', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('(status=info) ')
            engine.setCursorPosition(14)
            await engine.updateSuggestions()
            expect(engine.suggestionType).toBe('boolOp')
            expect(engine.context.nestingDepth).toBe(0)
        })

        it('nested groups track depth correctly', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('((')
            engine.setCursorPosition(2)
            await engine.updateSuggestions()
            expect(engine.context.nestingDepth).toBe(2)
            expect(engine.suggestionType).toBe('column')
        })

        it('nestingDepth is 0 for empty input', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('')
            expect(ctx.nestingDepth).toBe(0)
        })

        it('nestingDepth is 0 for flat query', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('status=info ')
            engine.setCursorPosition(12)
            await engine.updateSuggestions()
            expect(engine.context.nestingDepth).toBe(0)
        })

        it('( after boolean expects columns inside group', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('status=info or (')
            engine.setCursorPosition(16)
            await engine.updateSuggestions()
            expect(engine.suggestionType).toBe('column')
            expect(engine.context.nestingDepth).toBe(1)
        })

        it('complex grouped query: (status>=400 and host=prod*) or level=error', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            // After closing paren + space, boolOp phase
            const afterParen = '(status>=400 and host=prod*) '
            engine.setQuery(afterParen)
            engine.setCursorPosition(afterParen.length)
            await engine.updateSuggestions()
            expect(engine.suggestionType).toBe('boolOp')
            expect(engine.context.nestingDepth).toBe(0)

            // After "or ", column phase
            const afterOr = '(status>=400 and host=prod*) or '
            engine.setQuery(afterOr)
            engine.setCursorPosition(afterOr.length)
            await engine.updateSuggestions()
            expect(engine.suggestionType).toBe('column')
        })
    })

    describe('multiline highlighting (AC #1, #3)', () => {
        it('highlights tokens across newlines', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const html = engine.getHighlightTokens('status=info\nand host=prod')
            expect(html).toContain('flyql-key')
            expect(html).toContain('flyql-operator')
            expect(html).toContain('flyql-column')
        })

        it('handles Windows \\r\\n newlines', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const html = engine.getHighlightTokens('status=info\r\nand host=prod')
            expect(html).toContain('flyql-key')
            expect(html).toContain('flyql-operator')
            expect(html).toContain('flyql-column')
        })

        it('handles bare \\r newlines', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const status = engine.getQueryStatus()
            engine.setQuery('status=info\rand host=prod')
            const result = engine.getQueryStatus()
            expect(result.valid).toBe(true)
        })

        it('handles query with multiple newlines', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const html = engine.getHighlightTokens('status=info\nand\nhost=prod')
            expect(html).toContain('flyql-key')
            // Should contain multiple key spans (status and host)
            const keyMatches = html.match(/flyql-key/g)
            expect(keyMatches.length).toBeGreaterThanOrEqual(2)
        })
    })

    describe('error display (AC #2)', () => {
        it('error context includes specific parser message', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('===')
            engine.setCursorPosition(3)
            await engine.updateSuggestions()
            const error = engine.getParseError()
            expect(error).toBeTruthy()
            expect(typeof error).toBe('string')
            expect(error.length).toBeGreaterThan(0)
        })

        it('error clears when query becomes valid', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            // Invalid
            engine.setQuery('===')
            engine.setCursorPosition(3)
            await engine.updateSuggestions()
            expect(engine.getParseError()).toBeTruthy()

            // Fix to valid
            engine.setQuery('status=info')
            engine.setCursorPosition(11)
            await engine.updateSuggestions()
            expect(engine.getParseError()).toBeNull()
        })

        it('highlight tokens mark error portion with flyql-error class', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const html = engine.getHighlightTokens('status=info ===')
            expect(html).toContain('flyql-error')
            // Valid portion should still be highlighted correctly
            expect(html).toContain('flyql-key')
        })

        it('error in highlight does not affect valid prefix', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const html = engine.getHighlightTokens('status=info ===bad')
            // status should be highlighted as key
            expect(html).toContain('flyql-key')
            // = should be highlighted as operator
            expect(html).toContain('flyql-operator')
            // info should be highlighted as column reference
            expect(html).toContain('flyql-column')
            // error portion should have error class
            expect(html).toContain('flyql-error')
        })
    })

    describe('query status validation (AC #1-#6)', () => {
        it('validates grouped query as valid', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('(status=info) and host=prod')
            const status = engine.getQueryStatus()
            expect(status.valid).toBe(true)
        })

        it('validates multiline query as valid', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('status=info\nand host=prod')
            const status = engine.getQueryStatus()
            expect(status.valid).toBe(true)
        })

        it('validates unmatched paren as invalid', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.setQuery('(status=info')
            const status = engine.getQueryStatus()
            expect(status.valid).toBe(false)
        })
    })

    describe('full suggestion cycle (AC #1-#3)', () => {
        it('column → operator → value → boolOp cycle', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)

            // Column phase
            engine.setQuery('sta')
            engine.setCursorPosition(3)
            await engine.updateSuggestions()
            expect(engine.suggestionType).toBe('column')
            expect(engine.suggestions[0].label).toBe('status')
            // Editor normalizes the raw 'enum' input to canonical Type.String.
            expect(engine.suggestions[0].detail).toBe('string')

            // Operator phase (after known column)
            engine.setQuery('status')
            engine.setCursorPosition(6)
            await engine.updateSuggestions()
            expect(engine.suggestionType).toBe('operator')

            // Value phase
            engine.setQuery('status=')
            engine.setCursorPosition(7)
            await engine.updateSuggestions()
            expect(engine.suggestionType).toBe('value')
            expect(engine.suggestions.length).toBe(4)

            // BoolOp phase
            engine.setQuery('status=info ')
            engine.setCursorPosition(12)
            await engine.updateSuggestions()
            expect(engine.suggestionType).toBe('boolOp')
            const labels = engine.suggestions.map((s) => s.label)
            expect(labels).toContain('and')
            expect(labels).toContain('or')
            expect(labels).toContain('and not')
            expect(labels).toContain('or not')

            // Back to column phase
            engine.setQuery('status=info and ')
            engine.setCursorPosition(16)
            await engine.updateSuggestions()
            expect(engine.suggestionType).toBe('column')
        })
    })

    describe('getDiagnostics', () => {
        it('returns empty array for empty query', () => {
            const engine = new EditorEngine(ColumnSchema.fromPlainObject({ status: { type: 'enum' } }))
            engine.setQuery('')
            expect(engine.getDiagnostics()).toEqual([])
        })

        it('returns syntax diagnostic when query has syntax error', () => {
            const engine = new EditorEngine(ColumnSchema.fromPlainObject({ status: { type: 'enum' } }))
            engine.setQuery('=X')
            const diags = engine.getDiagnostics()
            expect(diags.length).toBe(1)
            expect(diags[0].code).toBe('syntax')
        })

        it('returns empty for incomplete query at end', () => {
            const engine = new EditorEngine(ColumnSchema.fromPlainObject({ status: { type: 'enum' } }))
            engine.setQuery('status=info and ')
            expect(engine.getDiagnostics()).toEqual([])
        })

        it('returns unknown_column diagnostic for unrecognized column', () => {
            const engine = new EditorEngine(ColumnSchema.fromPlainObject({ host: { type: 'string' } }))
            engine.setQuery("hstt='X'")
            const diags = engine.getDiagnostics()
            expect(diags.length).toBe(1)
            expect(diags[0].code).toBe('unknown_column')
            expect(diags[0].range.start).toBe(0)
            expect(diags[0].range.end).toBe(4)
        })

        it('returns no diagnostics for valid query', () => {
            const engine = new EditorEngine(
                ColumnSchema.fromPlainObject({ status: { type: 'enum', values: ['info'] } }),
            )
            engine.setQuery("status='info'")
            expect(engine.getDiagnostics()).toEqual([])
        })

        it('column type mapping: enum → string', () => {
            const engine = new EditorEngine(ColumnSchema.fromPlainObject({ status: { type: 'enum' } }))
            engine.setQuery('status=x')
            engine.getDiagnostics()
            // Editor overwrites raw 'enum' with canonical flyql.Type after
            // normalization (unify-column-type-system refactor).
            expect(engine._validatorColumns.get('status').type).toBe('string')
        })

        it('column type mapping: number → int', () => {
            const engine = new EditorEngine(ColumnSchema.fromPlainObject({ level: { type: 'number' } }))
            engine.setQuery('level=1')
            engine.getDiagnostics()
            expect(engine._validatorColumns.get('level').type).toBe('int')
        })

        it('column type mapping: unknown type falls back to Unknown', () => {
            const engine = new EditorEngine(ColumnSchema.fromPlainObject({ x: { type: 'custom' } }))
            engine.setQuery('x=1')
            engine.getDiagnostics()
            // Unmapped raw types never leak — they collapse to Type.Unknown.
            expect(engine._validatorColumns.get('x').type).toBe('unknown')
        })

        it('setColumns() invalidates validator column cache', () => {
            const engine = new EditorEngine(ColumnSchema.fromPlainObject({ a: { type: 'string' } }))
            engine.setQuery('a=1')
            engine.getDiagnostics()
            expect(engine._validatorColumns).not.toBeNull()
            engine.setColumns(ColumnSchema.fromPlainObject({ b: { type: 'number' } }))
            expect(engine._validatorColumns).toBeNull()
            engine.setQuery('b=1')
            engine.getDiagnostics()
            expect(engine._validatorColumns).not.toBeNull()
            expect(engine._validatorColumns.get('b').name).toBe('b')
        })

        it('returns empty for whitespace-only query', () => {
            const engine = new EditorEngine(ColumnSchema.fromPlainObject({ a: { type: 'string' } }))
            engine.setQuery('   ')
            expect(engine.getDiagnostics()).toEqual([])
        })
    })

    describe('getHighlightTokens with diagnostics', () => {
        it('renders without diagnostic spans when diagnostics is null', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const html = engine.getHighlightTokens('status=info', null)
            expect(html).not.toContain('flyql-diagnostic')
        })

        it('renders without diagnostic spans when diagnostics is empty array', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const html = engine.getHighlightTokens('status=info', [])
            expect(html).not.toContain('flyql-diagnostic')
        })

        it('adds diagnostic span for error diagnostic', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const diag = new Diagnostic(new Range(0, 4), "column 'hstt' is not defined", 'error', 'unknown_column')
            const html = engine.getHighlightTokens('hstt=X', [diag])
            expect(html).toContain('flyql-diagnostic--error')
        })

        it('adds diagnostic span for warning diagnostic', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const diag = new Diagnostic(new Range(0, 6), 'deprecated column', 'warning', 'deprecated')
            const html = engine.getHighlightTokens('status=info', [diag])
            expect(html).toContain('flyql-diagnostic--warning')
        })

        it('preserves syntax coloring spans inside diagnostic spans', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const diag = new Diagnostic(new Range(0, 4), 'unknown column', 'error', 'unknown_column')
            const html = engine.getHighlightTokens('hstt=X', [diag])
            expect(html).toContain('flyql-key')
            expect(html).toContain('flyql-diagnostic--error')
        })

        it('shows message in title attribute', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const diag = new Diagnostic(new Range(0, 4), "column 'hstt' is not defined", 'error', 'unknown_column')
            const html = engine.getHighlightTokens('hstt=X', [diag])
            expect(html).toContain('title="')
            expect(html).toContain('is not defined')
        })

        it('highlights diagnostic range on hover', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const diag = new Diagnostic(new Range(0, 4), 'test error', 'error', 'e1')
            const htmlNoHover = engine.getHighlightTokens('hstt=X', [diag], -1)
            expect(htmlNoHover).not.toContain('flyql-diagnostic--highlight')
            const htmlHover = engine.getHighlightTokens('hstt=X', [diag], 0)
            expect(htmlHover).toContain('flyql-diagnostic--highlight')
        })

        it('handles adjacent diagnostics as separate spans', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const d1 = new Diagnostic(new Range(0, 3), 'first', 'error', 'e1')
            const d2 = new Diagnostic(new Range(3, 6), 'second', 'error', 'e2')
            const html = engine.getHighlightTokens('status=info', [d1, d2])
            const matches = html.match(/flyql-diagnostic--error/g)
            expect(matches.length).toBeGreaterThanOrEqual(2)
        })
    })

    describe('tab cycling', () => {
        it('defaults activeTab to values', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            expect(engine.activeTab).toBe('values')
        })

        it('populates both suggestion lists in value context', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.state.setQuery('status=')
            engine.state.setCursorPosition(7)
            await engine.updateSuggestions()
            expect(engine.valueSuggestions.length).toBeGreaterThan(0)
            expect(engine.columnSuggestions.length).toBeGreaterThan(0)
        })

        it('excludes LHS column from columnSuggestions', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.state.setQuery('status=')
            engine.state.setCursorPosition(7)
            await engine.updateSuggestions()
            const labels = engine.columnSuggestions.map((s) => s.label)
            expect(labels).not.toContain('status')
            expect(labels).toContain('host')
            expect(labels).toContain('level')
        })

        it('cycleTab switches to columns', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.state.setQuery('status=')
            engine.state.setCursorPosition(7)
            await engine.updateSuggestions()
            expect(engine.activeTab).toBe('values')

            engine.cycleTab()
            expect(engine.activeTab).toBe('columns')
            expect(engine.suggestions).toBe(engine.columnSuggestions)
        })

        it('cycleTab back to values', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.state.setQuery('status=')
            engine.state.setCursorPosition(7)
            await engine.updateSuggestions()

            engine.cycleTab()
            engine.cycleTab()
            expect(engine.activeTab).toBe('values')
            expect(engine.suggestions).toBe(engine.valueSuggestions)
        })

        it('setTab to same tab is no-op', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.state.setQuery('status=')
            engine.state.setCursorPosition(7)
            await engine.updateSuggestions()
            engine.state.selectedIndex = 2

            engine.setTab('values')
            expect(engine.state.selectedIndex).toBe(2) // unchanged
        })

        it('resets activeTab when key changes', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.state.setQuery('status=')
            engine.state.setCursorPosition(7)
            await engine.updateSuggestions()
            engine.cycleTab()
            expect(engine.activeTab).toBe('columns')

            engine.state.setQuery('host=')
            engine.state.setCursorPosition(5)
            await engine.updateSuggestions()
            expect(engine.activeTab).toBe('values')
        })

        it('resets activeTab when leaving value context', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.state.setQuery('status=')
            engine.state.setCursorPosition(7)
            await engine.updateSuggestions()
            engine.cycleTab()
            expect(engine.activeTab).toBe('columns')

            engine.state.setQuery('status=info ')
            engine.state.setCursorPosition(12)
            await engine.updateSuggestions()
            expect(engine.activeTab).toBe('values')
        })

        it('filters both tabs simultaneously', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.state.setQuery('status=ho')
            engine.state.setCursorPosition(9)
            await engine.updateSuggestions()

            // Values tab: no static values match 'ho'
            expect(engine.valueSuggestions.length).toBe(0)

            // Columns tab: 'host' matches 'ho'
            const colLabels = engine.columnSuggestions.map((s) => s.label)
            expect(colLabels).toContain('host')
        })

        it('clears message when switching to columns tab', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.state.setQuery('level=')
            engine.state.setCursorPosition(6)
            await engine.updateSuggestions()
            // level has autocomplete: false, so message should indicate no suggestions
            expect(engine.activeTab).toBe('values')

            engine.cycleTab()
            expect(engine.activeTab).toBe('columns')
            expect(engine.message).toBe('')
        })

        it('columnSuggestions have type columnRef', async () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.state.setQuery('status=')
            engine.state.setCursorPosition(7)
            await engine.updateSuggestions()
            for (const s of engine.columnSuggestions) {
                expect(s.type).toBe('columnRef')
            }
        })
    })
})
