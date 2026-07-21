import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const cssContent = readFileSync(resolve(import.meta.dirname, '../src/flyql.css'), 'utf-8')

describe('flyql.css (copied from flyql-vue)', () => {
    it('defines theme variables on :root', () => {
        expect(cssContent).toContain(':root {')
        expect(cssContent).toContain('--flyql-bg:')
        expect(cssContent).toContain('--flyql-text:')
        expect(cssContent).toContain('--flyql-key-color:')
    })

    it('defines the .flyql-dark theme overrides', () => {
        expect(cssContent).toContain('.flyql-dark {')
    })

    it('has editor component styles (unified from the Vue SFCs)', () => {
        expect(cssContent).toContain('.flyql-editor {')
        expect(cssContent).toContain('.flyql-editor__highlight')
        expect(cssContent).toContain('.flyql-editor__input')
    })

    it('has columns component styles (unified from the Vue SFCs)', () => {
        expect(cssContent).toContain('.flyql-columns {')
        expect(cssContent).toContain('.flyql-col-column')
        expect(cssContent).toContain('.flyql-col-error')
    })

    it('has suggestion panel styles', () => {
        expect(cssContent).toContain('.flyql-panel {')
        expect(cssContent).toContain('.flyql-panel__item')
        expect(cssContent).toContain('.flyql-panel__badge')
    })

    it('is byte-identical to the flyql-vue stylesheet', () => {
        const vueCss = readFileSync(resolve(import.meta.dirname, '../../flyql-vue/src/flyql.css'), 'utf-8')
        expect(cssContent).toBe(vueCss)
    })
})
