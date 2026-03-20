import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const EDITOR_DIR = resolve(import.meta.dirname, '../../src/editor')

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
