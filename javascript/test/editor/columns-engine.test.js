import { describe, it, expect } from 'vitest'
import { ColumnsEngine } from '../../src/editor/columns-engine.js'

const TEST_COLUMNS = {
    level: { type: 'enum', suggest: true },
    service: { type: 'string', suggest: true },
    message: { type: 'string', suggest: true },
    status_code: { type: 'number', suggest: true },
    hidden: { type: 'string', suggest: false },
    host: { type: 'string', suggest: true },
}

describe('ColumnsEngine', () => {
    describe('constructor', () => {
        it('creates engine with columns', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            expect(engine.columns).toBe(TEST_COLUMNS)
            expect(engine.suggestions).toEqual([])
        })

        it('creates engine without columns', () => {
            const engine = new ColumnsEngine()
            expect(engine.columns).toEqual({})
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

        it('after pipe expects modifier', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('message|')
            expect(ctx.expecting).toBe('modifier')
        })

        it('typing modifier expects modifier', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('message|up')
            expect(ctx.expecting).toBe('modifier')
            expect(ctx.modifier).toBe('up')
        })

        it('after space expects alias (alias operator phase)', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('message ')
            expect(ctx.expecting).toBe('alias')
        })

        it('in modifier arguments expects argument', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
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
            expect(item.detail).toBe('enum')
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
        it('exact column match shows delimiter and modifier-pipe first', async () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('level')
            engine.setCursorPosition(5)
            await engine.updateSuggestions()
            expect(engine.suggestions[0].type).toBe('delimiter')
            expect(engine.suggestions[0].label).toBe(',')
            expect(engine.suggestions[0].detail).toBe('next column')
            expect(engine.suggestions[1].type).toBe('delimiter')
            expect(engine.suggestions[1].label).toBe('|')
            expect(engine.suggestions[1].detail).toBe('add modifier')
        })

        it('exact match still shows other matching columns below', async () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('host')
            engine.setCursorPosition(4)
            await engine.updateSuggestions()
            expect(engine.suggestions[0].type).toBe('delimiter')
            expect(engine.suggestions[1].type).toBe('delimiter')
        })

        it('partial match does NOT show delimiter/modifier-pipe', async () => {
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
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('message ')
            engine.setCursorPosition(8)
            await engine.updateSuggestions()
            expect(engine.suggestionType).toBe('delimiter')
            const pipe = engine.suggestions.find((s) => s.label === '|')
            expect(pipe.type).toBe('delimiter')
            expect(pipe.detail).toBe('add modifier')
            const comma = engine.suggestions.find((s) => s.label === ',')
            expect(comma.type).toBe('delimiter')
            expect(comma.detail).toBe('next column')
        })
    })

    describe('updateSuggestions — modifier exact match shows next steps', () => {
        it('exact modifier without args shows comma and pipe (no parens)', async () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('level|upper')
            engine.setCursorPosition(11)
            await engine.updateSuggestions()
            expect(engine.suggestions[0].label).toBe(',')
            expect(engine.suggestions[1].label).toBe('|')
            // upper has no args, so no () suggestion
            const labels = engine.suggestions.map((s) => s.label)
            expect(labels).not.toContain('()')
        })

        it('exact modifier with args shows comma, parens, and pipe', async () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('level|chars')
            engine.setCursorPosition(11)
            await engine.updateSuggestions()
            expect(engine.suggestions[0].label).toBe(',')
            expect(engine.suggestions[0].detail).toBe('next column')
            expect(engine.suggestions[1].label).toBe('()')
            expect(engine.suggestions[1].detail).toBe('(int, int?)')
            expect(engine.suggestions[1].cursorOffset).toBe(-1)
            expect(engine.suggestions[2].label).toBe('|')
            expect(engine.suggestions[2].detail).toBe('chain modifier')
        })

        it('partial modifier match does NOT show next steps', async () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('level|up')
            engine.setCursorPosition(8)
            await engine.updateSuggestions()
            const types = engine.suggestions.map((s) => s.type)
            expect(types).not.toContain('delimiter')
            expect(types).toContain('modifier')
        })
    })

    describe('getInsertRange with delimiter/modifier-pipe suggestions', () => {
        it('delimiter suggestion inserts at cursor without replacing prefix', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('level')
            const delimSuggestion = { label: ',', insertText: ', ', type: 'delimiter' }
            const range = engine.getInsertRange(ctx, 'level', delimSuggestion)
            expect(range.start).toBe(5)
            expect(range.end).toBe(5)
        })

        it('pipe delimiter suggestion inserts at cursor without replacing prefix', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('level')
            const pipeSuggestion = { label: '|', insertText: '|', type: 'delimiter' }
            const range = engine.getInsertRange(ctx, 'level', pipeSuggestion)
            expect(range.start).toBe(5)
            expect(range.end).toBe(5)
        })

        it('column suggestion replaces prefix', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            const ctx = engine.buildContext('lev')
            const colSuggestion = { label: 'level', insertText: 'level', type: 'column' }
            const range = engine.getInsertRange(ctx, 'lev', colSuggestion)
            expect(range.start).toBe(0)
            expect(range.end).toBe(3)
        })
    })

    describe('updateSuggestions — modifier phase (AC #3)', () => {
        it('suggests modifiers after pipe', async () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('message|')
            engine.setCursorPosition(8)
            await engine.updateSuggestions()
            expect(engine.suggestionType).toBe('modifier')
            const labels = engine.suggestions.map((s) => s.label)
            expect(labels).toContain('upper')
            expect(labels).toContain('lower')
            expect(labels).toContain('chars')
        })

        it('filters modifiers by prefix', async () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
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

        it('highlights modifiers', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            const html = engine.getHighlightTokens('message|upper')
            expect(html).toContain('flyql-col-modifier')
        })

        it('highlights arguments', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
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
            expect(cols[0].modifiers).toEqual([])
            expect(cols[0].alias).toBeNull()
        })

        it('parses multiple columns', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('level,service,message')
            const cols = engine.getParsedColumns()
            expect(cols).toHaveLength(3)
            expect(cols.map((c) => c.name)).toEqual(['level', 'service', 'message'])
        })

        it('parses column with modifier', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('message|upper')
            const cols = engine.getParsedColumns()
            expect(cols).toHaveLength(1)
            expect(cols[0].modifiers).toHaveLength(1)
            expect(cols[0].modifiers[0].name).toBe('upper')
        })

        it('parses column with alias', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('message as msg')
            const cols = engine.getParsedColumns()
            expect(cols).toHaveLength(1)
            expect(cols[0].alias).toBe('msg')
        })

        it('parses complex expression', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('message|upper|chars(25) as msg,level')
            const cols = engine.getParsedColumns()
            expect(cols).toHaveLength(2)
            expect(cols[0].name).toBe('message')
            expect(cols[0].modifiers).toHaveLength(2)
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

        it('valid for column with modifier', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('message|upper')
            expect(engine.getQueryStatus().valid).toBe(true)
        })

        it('valid for empty', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
            engine.setQuery('')
            expect(engine.getQueryStatus().valid).toBe(true)
        })

        it('invalid for unclosed arguments', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
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

        it('returns range for modifier prefix', () => {
            const engine = new ColumnsEngine(TEST_COLUMNS)
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

    describe('framework independence', () => {
        it('has no framework imports', async () => {
            const { readFileSync } = await import('fs')
            const { resolve } = await import('path')
            const content = readFileSync(resolve(import.meta.dirname, '../../src/editor/columns-engine.js'), 'utf-8')
            expect(content).not.toMatch(/from\s+['"]vue['"]/)
            expect(content).not.toMatch(/from\s+['"]react['"]/)
        })
    })
})
