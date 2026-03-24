import { describe, it, expect } from 'vitest'
import { EditorEngine } from '../../src/editor/engine.js'

const TEST_COLUMNS = {
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
}

describe('EditorEngine', () => {
    describe('constructor', () => {
        it('creates engine with columns', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            expect(engine.columns).toBe(TEST_COLUMNS)
            expect(engine.suggestions).toEqual([])
            expect(engine.context).toBeNull()
            expect(engine.isLoading).toBe(false)
        })

        it('creates engine with empty columns', () => {
            const engine = new EditorEngine()
            expect(engine.columns).toEqual({})
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
            expect(html).toContain('flyql-value')
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

    describe('clearValueCache', () => {
        it('clears the value cache', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            engine.valueCache['test'] = ['a', 'b']
            engine.clearValueCache()
            expect(engine.valueCache).toEqual({})
        })
    })

    describe('async value loading', () => {
        it('loads values via onAutocomplete', async () => {
            const engine = new EditorEngine(TEST_COLUMNS, {
                onAutocomplete: async (key) => ({
                    items: ['host-1', 'host-2'],
                }),
            })
            engine.setQuery('host=')
            engine.setCursorPosition(5)
            await engine.updateSuggestions()
            expect(engine.suggestions.length).toBe(2)
            // Should be cached
            expect(engine.valueCache['host']).toEqual(['host-1', 'host-2'])
        })

        it('uses cached values on subsequent calls', async () => {
            let callCount = 0
            const engine = new EditorEngine(TEST_COLUMNS, {
                onAutocomplete: async (key) => {
                    callCount++
                    return { items: ['host-1'] }
                },
            })
            engine.setQuery('host=')
            engine.setCursorPosition(5)
            await engine.updateSuggestions()
            expect(callCount).toBe(1)
            await engine.updateSuggestions()
            expect(callCount).toBe(1)
        })

        it('fetches with empty prefix for full list caching', async () => {
            let lastValue = null
            const engine = new EditorEngine(TEST_COLUMNS, {
                onAutocomplete: async (key, value) => {
                    lastValue = value
                    return { items: ['host-1', 'host-2'] }
                },
            })
            engine.setQuery('host=h')
            engine.setCursorPosition(6)
            await engine.updateSuggestions()
            expect(lastValue).toBe('')
        })

        it('discards stale async results via sequence counter', async () => {
            let resolveFirst
            const engine = new EditorEngine(TEST_COLUMNS, {
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
            engine.clearValueCache()
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
            expect(html).toContain('flyql-value')
        })

        it('handles Windows \\r\\n newlines', () => {
            const engine = new EditorEngine(TEST_COLUMNS)
            const html = engine.getHighlightTokens('status=info\r\nand host=prod')
            expect(html).toContain('flyql-key')
            expect(html).toContain('flyql-operator')
            expect(html).toContain('flyql-value')
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
            // info should be highlighted as value
            expect(html).toContain('flyql-value')
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
            expect(engine.suggestions[0].detail).toBe('enum')

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
})
