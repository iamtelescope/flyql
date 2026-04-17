import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const EDITOR_DIR = resolve(import.meta.dirname, '../src')
const vueContent = readFileSync(resolve(EDITOR_DIR, 'FlyqlEditor.vue'), 'utf-8')

describe('FlyqlEditor component', () => {
    describe('UX polish (undo + truncation + footer path)', () => {
        it('imports editor-helpers', () => {
            expect(vueContent).toContain("from './editor-helpers.js'")
        })

        it('uses insertAtSelection for undo-safe insert', () => {
            expect(vueContent).toContain('insertAtSelection(')
        })

        it('truncates long labels in list rendering', () => {
            expect(vueContent).toContain('truncateLabel(')
        })

        it('gates footer path via labelWasTruncated', () => {
            expect(vueContent).toContain('labelWasTruncated(')
        })

        it('renders footer full-path span', () => {
            expect(vueContent).toContain('flyql-panel__footer-path')
        })

        it('removes synthetic beforeinput dispatch (AC 13)', () => {
            expect(vueContent).not.toContain("new InputEvent('beforeinput'")
        })

        it('applies truncateLabel before highlightMatch in list rendering (F19)', () => {
            expect(vueContent).toContain('highlightMatch(item.displayLabel || truncateLabel(item.label), item.label)')
        })
    })
})
