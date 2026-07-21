import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const jsxContent = readFileSync(resolve(import.meta.dirname, '../src/FlyqlEditor.jsx'), 'utf-8')

describe('FlyqlEditor component', () => {
    describe('ARIA accessibility attributes', () => {
        it('textarea has role="combobox"', () => {
            expect(jsxContent).toContain('role="combobox"')
        })

        it('textarea has aria-label', () => {
            expect(jsxContent).toContain('aria-label="FlyQL query input"')
        })

        it('textarea has aria-expanded', () => {
            expect(jsxContent).toContain('aria-expanded')
        })

        it('textarea has aria-activedescendant', () => {
            expect(jsxContent).toContain('aria-activedescendant')
        })

        it('suggestion list has role="listbox"', () => {
            expect(jsxContent).toContain('role="listbox"')
        })

        it('suggestion items have role="option"', () => {
            expect(jsxContent).toContain('role="option"')
        })

        it('suggestion items have aria-selected', () => {
            expect(jsxContent).toContain('aria-selected')
        })

        it('panel body has aria-live="polite"', () => {
            expect(jsxContent).toContain('aria-live="polite"')
        })

        it('suggestion items have instance-scoped id for activedescendant', () => {
            expect(jsxContent).toContain("instanceId + '-suggestion-' + index")
        })
    })

    describe('DOM structure', () => {
        it('has highlight overlay pre element', () => {
            expect(jsxContent).toContain('flyql-editor__highlight')
            expect(jsxContent).toContain('dangerouslySetInnerHTML')
        })

        it('has transparent textarea for input', () => {
            expect(jsxContent).toContain('flyql-editor__input')
        })

        it('renders the panel through a portal to document.body', () => {
            expect(jsxContent).toContain('createPortal')
            expect(jsxContent).toContain('document.body')
        })

        it('applies flyql-dark class from dark prop', () => {
            expect(jsxContent).toContain('flyql-dark')
        })
    })

    describe('imperative API (forwardRef)', () => {
        it('uses forwardRef and useImperativeHandle', () => {
            expect(jsxContent).toContain('forwardRef')
            expect(jsxContent).toContain('useImperativeHandle')
        })

        it('exposes focus, blur, getQueryStatus, flushDiagnostics', () => {
            expect(jsxContent).toContain('getQueryStatus')
            expect(jsxContent).toContain('flushDiagnostics')
        })
    })

    describe('UX polish (undo + truncation + footer path)', () => {
        it('imports editor helpers from flyql/editor', () => {
            expect(jsxContent).toMatch(/import\s+\{[^}]*insertAtSelection[^}]*\}\s+from\s+'flyql\/editor'/)
        })

        it('uses insertAtSelection for undo-safe insert', () => {
            expect(jsxContent).toContain('insertAtSelection(')
        })

        it('truncates long labels in list rendering', () => {
            expect(jsxContent).toContain('truncateLabel(')
        })

        it('gates footer path via labelWasTruncated', () => {
            expect(jsxContent).toContain('labelWasTruncated(')
        })

        it('renders footer full-path span', () => {
            expect(jsxContent).toContain('flyql-panel__footer-path')
        })
    })

    describe('diagnostic description fallback', () => {
        it('guards the description span with diag.error && diag.error.description', () => {
            expect(jsxContent).toContain('flyql-panel__diagnostic-desc')
            expect(jsxContent).toContain('diag.error && diag.error.description')
        })
    })

    describe('IME composition handling', () => {
        it('tracks composition state on the engine', () => {
            expect(jsxContent).toContain('onCompositionStart')
            expect(jsxContent).toContain('onCompositionEnd')
            expect(jsxContent).toContain('engine.state.composing')
        })
    })
})
