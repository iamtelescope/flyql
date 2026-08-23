import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const jsxContent = readFileSync(resolve(import.meta.dirname, '../src/FlyqlColumns.jsx'), 'utf-8')

describe('FlyqlColumns component', () => {
    describe('props (parity with FlyqlColumns.vue)', () => {
        it('accepts value/onChange', () => {
            expect(jsxContent).toContain('value = ')
            expect(jsxContent).toContain('onChange = ')
        })

        it('accepts capabilities and registries', () => {
            expect(jsxContent).toContain('capabilities')
            expect(jsxContent).toContain('rendererRegistry')
        })

        it('emits parsed columns via onParsedChange', () => {
            expect(jsxContent).toContain('onParsedChange')
            expect(jsxContent).toContain('getParsedColumns')
        })

        it('emits submit', () => {
            expect(jsxContent).toContain('onSubmit')
        })
    })

    describe('uses ColumnsEngine (not EditorEngine)', () => {
        it('imports ColumnsEngine from flyql/editor', () => {
            expect(jsxContent).toMatch(/import\s+\{[^}]*ColumnsEngine[^}]*\}\s+from\s+'flyql\/editor'/)
        })

        it('does not import EditorEngine', () => {
            expect(jsxContent).not.toMatch(/import\s+\{[^}]*\bEditorEngine\b[^}]*\}\s+from\s+'flyql\/editor'/)
        })
    })

    describe('ARIA accessibility attributes', () => {
        it('textarea has role="combobox"', () => {
            expect(jsxContent).toContain('role="combobox"')
        })

        it('textarea has aria-label', () => {
            expect(jsxContent).toContain('aria-label={inputAriaLabel}')
            expect(jsxContent).toContain("'FlyQL columns expression input'")
        })

        it('suggestion list has role="listbox"', () => {
            expect(jsxContent).toContain('role="listbox"')
        })

        it('suggestion items have role="option"', () => {
            expect(jsxContent).toContain('role="option"')
        })

        it('panel body has aria-live="polite"', () => {
            expect(jsxContent).toContain('aria-live="polite"')
        })
    })

    describe('syntax highlighting', () => {
        it('has highlight overlay pre element', () => {
            expect(jsxContent).toContain('flyql-columns__highlight')
            expect(jsxContent).toContain('dangerouslySetInnerHTML')
        })

        it('has transparent textarea for input', () => {
            expect(jsxContent).toContain('flyql-columns__input')
        })
    })

    describe('imperative API (forwardRef)', () => {
        it('uses forwardRef and useImperativeHandle', () => {
            expect(jsxContent).toContain('forwardRef')
            expect(jsxContent).toContain('useImperativeHandle')
        })

        it('exposes getParsedColumns in addition to the editor API', () => {
            expect(jsxContent).toContain('getParsedColumns')
            expect(jsxContent).toContain('getQueryStatus')
            expect(jsxContent).toContain('flushDiagnostics')
        })
    })

    describe('loading render prop', () => {
        it('renders a loading slot with spinner fallback', () => {
            expect(jsxContent).toContain('flyql-panel__loading')
            expect(jsxContent).toContain('flyql-panel__spinner')
        })
    })

    describe('diagnostic description fallback', () => {
        it('guards the description span with diag.error && diag.error.description', () => {
            expect(jsxContent).toContain('flyql-panel__diagnostic-desc')
            expect(jsxContent).toContain('diag.error && diag.error.description')
        })
    })
})

describe('prefix slot (icon + label)', () => {
    it('declares the label prop next to the icon render prop', () => {
        expect(jsxContent).toContain('icon = null,')
        expect(jsxContent).toContain("label = '',")
    })

    it('renders icon and label inside a single prefix element', () => {
        expect(jsxContent).toContain('className="flyql-columns__prefix"')
        expect(jsxContent).toContain('className="flyql-columns__icon"')
        expect(jsxContent).toContain('className="flyql-columns__label"')
    })

    it('drops the prefix entirely when there is neither icon nor label', () => {
        expect(jsxContent).toContain('{(showIcon || showLabel) && (')
        expect(jsxContent).toContain('const showIcon = icon !== false')
        expect(jsxContent).toContain('const showLabel =')
    })

    it('falls back to the built-in glyph and supports an icon render prop', () => {
        expect(jsxContent).toContain('icon === null || icon === true ? (')
        expect(jsxContent).toContain("typeof icon === 'function' ? (")
    })

    it('focuses the input when the prefix is clicked', () => {
        expect(jsxContent).toContain('textareaRef.current?.focus()')
    })

    it('lets a visible label be the accessible name of the input', () => {
        expect(jsxContent).toContain('aria-label={inputAriaLabel}')
        expect(jsxContent).toContain("typeof label === 'string' && label ? label : 'FlyQL columns expression input'")
    })
})
