import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const EDITOR_DIR = resolve(import.meta.dirname, '../src')
const vueContent = readFileSync(resolve(EDITOR_DIR, 'FlyqlColumns.vue'), 'utf-8')

describe('FlyqlColumns component', () => {
    describe('export and import (AC #1)', () => {
        it('is exported from editor index', () => {
            const indexContent = readFileSync(resolve(EDITOR_DIR, 'index.js'), 'utf-8')
            expect(indexContent).toContain('FlyqlColumns')
            expect(indexContent).toContain('ColumnsEngine')
        })

        it('is a valid Vue SFC', () => {
            expect(vueContent).toContain('<template>')
            expect(vueContent).toContain('<script setup>')
            expect(vueContent).toContain('defineProps')
        })
    })

    describe('props and emits', () => {
        it('accepts modelValue for v-model', () => {
            expect(vueContent).toContain('modelValue: { type: String')
        })

        it('accepts columns prop', () => {
            expect(vueContent).toContain('columns: { type: Object')
        })

        it('accepts registry prop', () => {
            expect(vueContent).toContain('registry: { type: Object')
        })

        it('accepts rendererRegistry prop', () => {
            expect(vueContent).toContain('rendererRegistry: { type: Object')
        })

        it('threads rendererRegistry into engine options', () => {
            expect(vueContent).toContain('engineOpts.rendererRegistry = props.rendererRegistry')
        })

        it('reactive watcher on rendererRegistry prop', () => {
            expect(vueContent).toContain('engine.setRendererRegistry')
        })

        it('accepts placeholder prop', () => {
            expect(vueContent).toContain('placeholder: { type: String')
        })

        it('accepts debug prop', () => {
            expect(vueContent).toContain('debug: { type: Boolean')
        })

        it('emits update:modelValue', () => {
            expect(vueContent).toContain("'update:modelValue'")
        })

        it('emits update:parsed', () => {
            expect(vueContent).toContain("'update:parsed'")
        })

        it('emits submit', () => {
            expect(vueContent).toContain("'submit'")
        })
    })

    describe('uses ColumnsEngine (not EditorEngine)', () => {
        it('imports ColumnsEngine', () => {
            expect(vueContent).toContain("from './columns-engine.js'")
        })

        it('does not import EditorEngine', () => {
            expect(vueContent).not.toContain("from './engine.js'")
        })
    })

    describe('syntax highlighting (AC #4)', () => {
        it('has highlight overlay pre element', () => {
            expect(vueContent).toContain('flyql-columns__highlight')
            expect(vueContent).toContain('v-html="highlightedHtml"')
        })

        it('has transparent textarea for input', () => {
            expect(vueContent).toContain('flyql-columns__input')
        })
    })

    describe('suggestion panel (AC #2, #3)', () => {
        it('has suggestion panel with badge', () => {
            expect(vueContent).toContain('flyql-panel__badge')
        })

        it('shows C badge for columns', () => {
            expect(vueContent).toContain("return 'C'")
        })

        it('shows T badge for transformers', () => {
            expect(vueContent).toContain("return 'T'")
        })
    })

    describe('ARIA accessibility (AC #6)', () => {
        it('textarea has aria-label', () => {
            expect(vueContent).toContain('aria-label="FlyQL columns expression input"')
        })

        it('textarea has role="combobox"', () => {
            expect(vueContent).toContain('role="combobox"')
        })

        it('textarea has aria-expanded', () => {
            expect(vueContent).toContain('aria-expanded')
        })

        it('textarea has aria-activedescendant', () => {
            expect(vueContent).toContain('aria-activedescendant')
        })

        it('suggestion list has role="listbox"', () => {
            expect(vueContent).toContain('role="listbox"')
        })

        it('suggestion items have role="option"', () => {
            expect(vueContent).toContain('role="option"')
        })

        it('panel body has aria-live="polite"', () => {
            expect(vueContent).toContain('aria-live="polite"')
        })
    })

    describe('keyboard handling (AC #6)', () => {
        it('handles ArrowUp', () => {
            expect(vueContent).toContain("e.key === 'ArrowUp'")
        })

        it('handles ArrowDown', () => {
            expect(vueContent).toContain("e.key === 'ArrowDown'")
        })

        it('handles Enter for suggestion accept', () => {
            expect(vueContent).toContain("e.key === 'Enter'")
        })

        it('handles Escape to dismiss', () => {
            expect(vueContent).toContain("e.key === 'Escape'")
        })

        it('handles Tab for suggestion accept', () => {
            expect(vueContent).toContain("e.key === 'Tab'")
        })

        it('handles Ctrl+Enter for submit', () => {
            expect(vueContent).toContain("emit('submit')")
        })
    })

    describe('CSS theming', () => {
        it('uses scoped styles for component', () => {
            expect(vueContent).toContain('<style scoped>')
        })

        it('uses --flyql-bg variable', () => {
            expect(vueContent).toContain('var(--flyql-bg)')
        })

        it('uses --flyql-border variable', () => {
            expect(vueContent).toContain('var(--flyql-border)')
        })

        it('has own icon (grid, not search)', () => {
            expect(vueContent).toContain('flyql-columns__icon')
            expect(vueContent).toContain('<rect')
        })

        it('has highlight token CSS classes', () => {
            expect(vueContent).toContain('.flyql-col-column')
            expect(vueContent).toContain('.flyql-col-operator')
            expect(vueContent).toContain('.flyql-col-transformer')
            expect(vueContent).toContain('.flyql-col-argument')
            expect(vueContent).toContain('.flyql-col-alias')
            expect(vueContent).toContain('.flyql-col-error')
        })
    })

    describe('parsed output (AC #5)', () => {
        it('exposes getParsedColumns', () => {
            expect(vueContent).toContain('getParsedColumns')
        })

        it('emits parsed on input', () => {
            expect(vueContent).toContain('emitParsed()')
        })
    })

    describe('diagnostics panel', () => {
        it('emits diagnostics event', () => {
            expect(vueContent).toContain("'diagnostics'")
        })

        it('has diagnostics panel container', () => {
            expect(vueContent).toContain('flyql-panel__diagnostics')
        })

        it('references hoveredDiagIndex', () => {
            expect(vueContent).toContain('hoveredDiagIndex')
        })

        it('has mouseenter/mouseleave for diagnostic items', () => {
            expect(vueContent).toContain('@mouseenter="hoveredDiagIndex = idx"')
            expect(vueContent).toContain('@mouseleave="hoveredDiagIndex = -1"')
        })

        it('has diagnostic bullet and message spans', () => {
            expect(vueContent).toContain('flyql-panel__diagnostic-bullet')
            expect(vueContent).toContain('flyql-panel__diagnostic-msg')
        })
    })
})
