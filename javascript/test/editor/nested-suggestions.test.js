import { describe, it, expect } from 'vitest'
import {
    getKeySuggestions,
    getNestedColumnSuggestions,
    resolveColumnDef,
    getOperatorSuggestions,
    getValueSuggestions,
    updateSuggestions,
} from '../../src/editor/suggestions.js'
import { ColumnsEngine } from '../../src/editor/columns-engine.js'
import { ColumnSchema } from '../../src/core/column.js'

const NESTED_COLUMNS_PLAIN = {
    level: { type: 'enum', suggest: true },
    service: { type: 'string', suggest: true },
    metadata: {
        type: 'object',
        suggest: true,
        children: {
            labels: {
                type: 'object',
                suggest: true,
                children: {
                    tier: { type: 'string', suggest: true },
                    env: { type: 'string', suggest: true },
                },
            },
            version: { type: 'string', suggest: true },
        },
    },
    hidden_nested: {
        type: 'object',
        suggest: false,
        children: {
            secret: { type: 'string', suggest: true },
        },
    },
    config: {
        type: 'object',
        suggest: true,
        children: {
            hidden_group: {
                type: 'object',
                suggest: false,
                children: {
                    value: { type: 'string', suggest: true },
                },
            },
            visible: { type: 'string', suggest: true },
        },
    },
}

const NESTED_COLUMNS = ColumnSchema.fromPlainObject(NESTED_COLUMNS_PLAIN)

describe('getKeySuggestions — flat columns (AC #4)', () => {
    it('flat prefix returns top-level columns', () => {
        const result = getKeySuggestions(NESTED_COLUMNS, 'le')
        expect(result.map((s) => s.label)).toEqual(['level'])
    })

    it('empty prefix returns all top-level columns', () => {
        const result = getKeySuggestions(NESTED_COLUMNS, '')
        const labels = result.map((s) => s.label)
        expect(labels).toContain('level')
        expect(labels).toContain('service')
        expect(labels).toContain('metadata')
        expect(labels).not.toContain('hidden_nested')
    })

    it('nested column shows type as detail', () => {
        const result = getKeySuggestions(NESTED_COLUMNS, 'meta')
        const meta = result.find((s) => s.label === 'metadata')
        expect(meta.detail).toBe('object')
    })

    it('nested column insertText has trailing dot', () => {
        const result = getKeySuggestions(NESTED_COLUMNS, 'meta')
        const meta = result.find((s) => s.label === 'metadata')
        expect(meta.insertText).toBe('metadata.')
    })

    it('flat column shows type as detail', () => {
        const result = getKeySuggestions(NESTED_COLUMNS, 'le')
        expect(result[0].detail).toBe('enum')
    })
})

describe('getNestedColumnSuggestions (AC #1, #2)', () => {
    it('metadata. suggests children', () => {
        const result = getNestedColumnSuggestions(NESTED_COLUMNS, 'metadata.')
        const labels = result.map((s) => s.label)
        expect(labels).toContain('metadata.labels')
        expect(labels).toContain('metadata.version')
    })

    it('metadata.labels. suggests grandchildren', () => {
        const result = getNestedColumnSuggestions(NESTED_COLUMNS, 'metadata.labels.')
        const labels = result.map((s) => s.label)
        expect(labels).toContain('metadata.labels.tier')
        expect(labels).toContain('metadata.labels.env')
    })

    it('filters by partial last segment', () => {
        const result = getNestedColumnSuggestions(NESTED_COLUMNS, 'metadata.la')
        const labels = result.map((s) => s.label)
        expect(labels).toContain('metadata.labels')
        expect(labels).not.toContain('metadata.version')
    })

    it('intermediate node shows type as detail', () => {
        const result = getNestedColumnSuggestions(NESTED_COLUMNS, 'metadata.')
        const labelsItem = result.find((s) => s.label === 'metadata.labels')
        expect(labelsItem.detail).toBe('object')
    })

    it('intermediate node insertText has trailing dot', () => {
        const result = getNestedColumnSuggestions(NESTED_COLUMNS, 'metadata.')
        const labelsItem = result.find((s) => s.label === 'metadata.labels')
        expect(labelsItem.insertText).toBe('metadata.labels.')
    })

    it('leaf node shows type detail', () => {
        const result = getNestedColumnSuggestions(NESTED_COLUMNS, 'metadata.')
        const version = result.find((s) => s.label === 'metadata.version')
        expect(version.detail).toBe('string')
    })

    it('unknown parent returns empty', () => {
        const result = getNestedColumnSuggestions(NESTED_COLUMNS, 'nonexistent.')
        expect(result).toEqual([])
    })

    it('leaf node with no children returns empty', () => {
        const result = getNestedColumnSuggestions(NESTED_COLUMNS, 'metadata.version.')
        expect(result).toEqual([])
    })

    it('hidden parent returns empty', () => {
        const result = getNestedColumnSuggestions(NESTED_COLUMNS, 'hidden_nested.')
        expect(result).toEqual([])
    })

    it('full path in insertText for acceptance (AC #3)', () => {
        const result = getNestedColumnSuggestions(NESTED_COLUMNS, 'metadata.labels.')
        const tier = result.find((s) => s.label === 'metadata.labels.tier')
        expect(tier.insertText).toBe('metadata.labels.tier')
    })
})

describe('getKeySuggestions delegates to nested when dot present', () => {
    it('prefix with dot uses nested traversal', () => {
        const result = getKeySuggestions(NESTED_COLUMNS, 'metadata.')
        const labels = result.map((s) => s.label)
        expect(labels).toContain('metadata.labels')
        expect(labels).toContain('metadata.version')
    })

    it('prefix without dot uses flat traversal', () => {
        const result = getKeySuggestions(NESTED_COLUMNS, 'meta')
        const labels = result.map((s) => s.label)
        expect(labels).toContain('metadata')
        expect(labels).not.toContain('metadata.labels')
    })
})

describe('ColumnsEngine nested suggestions (AC #5)', () => {
    it('typing metadata. in columns editor shows children', async () => {
        const engine = new ColumnsEngine(ColumnSchema.fromPlainObject(NESTED_COLUMNS_PLAIN))
        engine.setQuery('metadata.')
        engine.setCursorPosition(9)
        await engine.updateSuggestions()
        const labels = engine.suggestions.map((s) => s.label)
        expect(labels).toContain('metadata.labels')
        expect(labels).toContain('metadata.version')
    })

    it('typing metadata.labels. shows grandchildren', async () => {
        const engine = new ColumnsEngine(ColumnSchema.fromPlainObject(NESTED_COLUMNS_PLAIN))
        engine.setQuery('metadata.labels.')
        engine.setCursorPosition(16)
        await engine.updateSuggestions()
        const labels = engine.suggestions.map((s) => s.label)
        expect(labels).toContain('metadata.labels.tier')
        expect(labels).toContain('metadata.labels.env')
    })

    it('excludes already-selected nested columns', async () => {
        const engine = new ColumnsEngine(ColumnSchema.fromPlainObject(NESTED_COLUMNS_PLAIN))
        engine.setQuery('metadata.labels.tier,metadata.labels.')
        engine.setCursorPosition(37)
        await engine.updateSuggestions()
        const labels = engine.suggestions.map((s) => s.label)
        expect(labels).not.toContain('metadata.labels.tier')
        expect(labels).toContain('metadata.labels.env')
    })

    it('mixed flat + nested columns coexist (AC #4)', async () => {
        const engine = new ColumnsEngine(ColumnSchema.fromPlainObject(NESTED_COLUMNS_PLAIN))
        engine.setQuery('')
        engine.setCursorPosition(0)
        await engine.updateSuggestions()
        const labels = engine.suggestions.map((s) => s.label)
        expect(labels).toContain('level')
        expect(labels).toContain('metadata')
        // No nested paths at top level
        expect(labels).not.toContain('metadata.labels')
    })

    it('exact nested leaf shows next-step delimiters (P2)', async () => {
        const engine = new ColumnsEngine(ColumnSchema.fromPlainObject(NESTED_COLUMNS_PLAIN), {
            capabilities: { transformers: true },
        })
        engine.setQuery('metadata.labels.tier')
        engine.setCursorPosition(20)
        await engine.updateSuggestions()
        const labels = engine.suggestions.map((s) => s.label)
        expect(labels).toContain(',')
        expect(labels).toContain('|')
    })

    it('intermediate nested node does not show next-step delimiters', async () => {
        const engine = new ColumnsEngine(ColumnSchema.fromPlainObject(NESTED_COLUMNS_PLAIN))
        engine.setQuery('metadata.labels')
        engine.setCursorPosition(15)
        await engine.updateSuggestions()
        const labels = engine.suggestions.map((s) => s.label)
        // metadata.labels is not a leaf — should show column suggestions, not delimiters
        expect(labels).not.toContain(',')
        expect(labels).not.toContain('|')
    })
})

describe('resolveColumnDef — nested column resolution (P1)', () => {
    it('resolves top-level column', () => {
        const col = resolveColumnDef(NESTED_COLUMNS, 'level')
        expect(col.type).toBe('enum')
    })

    it('resolves nested leaf column', () => {
        const col = resolveColumnDef(NESTED_COLUMNS, 'metadata.labels.tier')
        expect(col.type).toBe('string')
    })

    it('resolves intermediate nested column', () => {
        const col = resolveColumnDef(NESTED_COLUMNS, 'metadata.labels')
        expect(col.type).toBe('object')
        expect(col.children).toBeDefined()
    })

    it('returns null for unknown column', () => {
        expect(resolveColumnDef(NESTED_COLUMNS, 'nonexistent')).toBeNull()
    })

    it('returns null for unknown nested path', () => {
        expect(resolveColumnDef(NESTED_COLUMNS, 'metadata.nonexistent')).toBeNull()
    })
})

describe('getOperatorSuggestions — nested columns (P1)', () => {
    it('type-filters operators for nested enum-type column', () => {
        const ENUM_NESTED = ColumnSchema.fromPlainObject({
            data: {
                type: 'object',
                suggest: true,
                children: {
                    status: { type: 'enum', suggest: true },
                },
            },
        })
        const ops = getOperatorSuggestions(ENUM_NESTED, 'data.status')
        const labels = ops.map((o) => o.label)
        expect(labels).toContain('=')
        expect(labels).not.toContain('~')
        expect(labels).not.toContain('!~')
    })

    it('shows all operators for nested string column', () => {
        const ops = getOperatorSuggestions(NESTED_COLUMNS, 'metadata.labels.tier')
        const labels = ops.map((o) => o.label)
        expect(labels).toContain('=')
        expect(labels).toContain('~')
    })
})

describe('updateSuggestions — query editor nested exact match (P1)', () => {
    it('shows operators after exact nested leaf column', async () => {
        const ctx = {
            state: 'KEY',
            key: 'metadata.labels.tier',
            expecting: 'column',
            textBeforeCursor: 'metadata.labels.tier',
        }
        const result = await updateSuggestions(ctx, NESTED_COLUMNS, null, {}, () => {})
        expect(result.suggestionType).toBe('operator')
        expect(result.suggestions.map((s) => s.label)).toContain('=')
    })

    it('shows column suggestions for intermediate nested node', async () => {
        const ctx = {
            state: 'KEY',
            key: 'metadata.labels',
            expecting: 'column',
            textBeforeCursor: 'metadata.labels',
        }
        const result = await updateSuggestions(ctx, NESTED_COLUMNS, null, {}, () => {})
        expect(result.suggestionType).toBe('column')
        // Should show nothing useful since 'metadata.labels' partial match with no trailing dot
        // won't produce children
    })
})

describe('suggest: false on intermediate node (P5)', () => {
    it('hidden intermediate node blocks children suggestions', () => {
        const result = getNestedColumnSuggestions(NESTED_COLUMNS, 'config.hidden_group.')
        expect(result).toEqual([])
    })

    it('visible sibling still works next to hidden intermediate', () => {
        const result = getNestedColumnSuggestions(NESTED_COLUMNS, 'config.')
        const labels = result.map((s) => s.label)
        expect(labels).toContain('config.visible')
        expect(labels).not.toContain('config.hidden_group')
    })
})

describe('case normalization in suggestions (P3)', () => {
    it('uses schema casing in labels regardless of user input casing', () => {
        const result = getNestedColumnSuggestions(NESTED_COLUMNS, 'Metadata.')
        const labels = result.map((s) => s.label)
        // Should use schema casing 'metadata', not user-typed 'Metadata'
        expect(labels).toContain('metadata.labels')
        expect(labels).toContain('metadata.version')
        expect(labels).not.toContain('Metadata.labels')
    })
})

describe('resolveColumnDef — case-insensitive top-level (P1r2)', () => {
    it('resolves top-level column with wrong casing', () => {
        const col = resolveColumnDef(NESTED_COLUMNS, 'Level')
        expect(col).toBeDefined()
        expect(col.type).toBe('enum')
    })

    it('resolves top-level column with exact casing', () => {
        const col = resolveColumnDef(NESTED_COLUMNS, 'level')
        expect(col).toBeDefined()
        expect(col.type).toBe('enum')
    })
})

describe('getValueSuggestions — nested columns (P2r2)', () => {
    const VALUED_NESTED = ColumnSchema.fromPlainObject({
        data: {
            type: 'object',
            suggest: true,
            children: {
                status: { type: 'enum', suggest: true, autocomplete: true, values: ['active', 'inactive'] },
                notes: { type: 'string', suggest: true, autocomplete: false },
            },
        },
    })

    it('returns values for nested leaf with autocomplete + values', async () => {
        const result = await getValueSuggestions(VALUED_NESTED, 'data.status', '', null, null, {}, () => {})
        expect(result.suggestions.length).toBe(2)
        expect(result.suggestions.map((s) => s.label)).toContain('active')
        expect(result.suggestions.map((s) => s.label)).toContain('inactive')
    })

    it('returns disabled message for nested leaf without autocomplete', async () => {
        const result = await getValueSuggestions(VALUED_NESTED, 'data.notes', '', null, null, {}, () => {})
        expect(result.suggestions).toEqual([])
        expect(result.message).toBe('Autocompletion is disabled for this column')
    })

    it('returns empty for unknown nested path', async () => {
        const result = await getValueSuggestions(VALUED_NESTED, 'data.nonexistent', '', null, null, {}, () => {})
        expect(result.suggestions).toEqual([])
    })
})
