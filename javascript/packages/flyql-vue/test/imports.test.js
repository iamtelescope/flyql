import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const EDITOR_DIR = resolve(import.meta.dirname, '../src')

describe('ARIA accessibility attributes (AC #6)', () => {
    const vueContent = readFileSync(resolve(EDITOR_DIR, 'FlyqlEditor.vue'), 'utf-8')

    it('textarea has role="combobox"', () => {
        expect(vueContent).toContain('role="combobox"')
    })

    it('textarea has aria-label', () => {
        expect(vueContent).toContain(':aria-label="inputAriaLabel"')
        expect(vueContent).toContain("'FlyQL query input'")
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

    it('suggestion items have aria-selected', () => {
        expect(vueContent).toContain('aria-selected')
    })

    it('panel body has aria-live="polite"', () => {
        expect(vueContent).toContain('aria-live="polite"')
    })

    it('suggestion items have instance-scoped id for activedescendant', () => {
        expect(vueContent).toContain("-suggestion-' + index")
    })
})

describe('engines come from flyql/editor (AC #5)', () => {
    const editorVue = readFileSync(resolve(EDITOR_DIR, 'FlyqlEditor.vue'), 'utf-8')
    const columnsVue = readFileSync(resolve(EDITOR_DIR, 'FlyqlColumns.vue'), 'utf-8')
    const indexJs = readFileSync(resolve(EDITOR_DIR, 'index.js'), 'utf-8')

    it('FlyqlEditor imports the engine from flyql/editor', () => {
        expect(editorVue).toContain("from 'flyql/editor'")
        expect(editorVue).not.toMatch(/from\s+['"]\.\/(engine|editor-helpers|suggestions|state)\.js['"]/)
    })

    it('FlyqlColumns imports the engine from flyql/editor', () => {
        expect(columnsVue).toContain("from 'flyql/editor'")
        expect(columnsVue).not.toMatch(/from\s+['"]\.\/(columns-engine|editor-helpers|suggestions|state)\.js['"]/)
    })

    it('index.js re-exports EditorEngine and ColumnsEngine from flyql/editor', () => {
        expect(indexJs).toMatch(/export\s+\{\s*EditorEngine,\s*ColumnsEngine\s*\}\s+from\s+'flyql\/editor'/)
    })

    it('no local engine files remain in flyql-vue', () => {
        for (const file of [
            'engine.js',
            'columns-engine.js',
            'suggestions.js',
            'state.js',
            'editor-helpers.js',
            'path-dot.js',
        ]) {
            expect(existsSync(resolve(EDITOR_DIR, file)), `${file} should not exist`).toBe(false)
        }
    })
})
