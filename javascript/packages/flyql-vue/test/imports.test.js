import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const EDITOR_DIR = resolve(import.meta.dirname, '../src')

const FRAMEWORK_IMPORTS = [
    /from\s+['"]vue['"]/,
    /from\s+['"]react['"]/,
    /from\s+['"]@vue\//,
    /from\s+['"]@angular\//,
    /import\s+.*['"]vue['"]/,
    /import\s+.*['"]react['"]/,
    /require\s*\(\s*['"]vue['"]\s*\)/,
    /require\s*\(\s*['"]react['"]\s*\)/,
]

function checkFileForFrameworkImports(filename) {
    const content = readFileSync(resolve(EDITOR_DIR, filename), 'utf-8')
    const violations = []
    for (const pattern of FRAMEWORK_IMPORTS) {
        const match = content.match(pattern)
        if (match) {
            violations.push(match[0])
        }
    }
    return violations
}

describe('ARIA accessibility attributes (AC #6)', () => {
    const vueContent = readFileSync(resolve(EDITOR_DIR, 'FlyqlEditor.vue'), 'utf-8')

    it('textarea has role="combobox"', () => {
        expect(vueContent).toContain('role="combobox"')
    })

    it('textarea has aria-label', () => {
        expect(vueContent).toContain('aria-label="FlyQL query input"')
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

describe('engine module framework independence (AC #5)', () => {
    it('engine.js has no framework imports', () => {
        const violations = checkFileForFrameworkImports('engine.js')
        expect(violations).toEqual([])
    })

    it('suggestions.js has no framework imports', () => {
        const violations = checkFileForFrameworkImports('suggestions.js')
        expect(violations).toEqual([])
    })

    it('state.js has no framework imports', () => {
        const violations = checkFileForFrameworkImports('state.js')
        expect(violations).toEqual([])
    })
})
