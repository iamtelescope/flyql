import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const cssContent = readFileSync(resolve(import.meta.dirname, '../src/flyql.css'), 'utf-8')

function extractBlock(selector) {
    // Simple selector-block extractor — finds "<selector> {" and returns the body up to the matching '}'.
    const startIdx = cssContent.indexOf(selector + ' {')
    if (startIdx === -1) return ''
    const bodyStart = cssContent.indexOf('{', startIdx) + 1
    const bodyEnd = cssContent.indexOf('}', bodyStart)
    return cssContent.substring(bodyStart, bodyEnd)
}

describe('flyql.css (UX polish)', () => {
    describe(':root tokens', () => {
        it('defines --flyql-path-separator-color for light theme', () => {
            const block = extractBlock(':root')
            expect(block).toContain('--flyql-path-separator-color: #4ca772;')
        })
    })

    describe('.flyql-dark tokens', () => {
        it('defines --flyql-path-separator-color for dark theme', () => {
            const block = extractBlock('.flyql-dark')
            expect(block).toContain('--flyql-path-separator-color: #a3d9a5;')
        })

        it('updates --flyql-parameter-color for dark theme', () => {
            const block = extractBlock('.flyql-dark')
            expect(block).toContain('--flyql-parameter-color: #d4a5e8;')
        })

        it('updates --flyql-renderer-color for dark theme', () => {
            const block = extractBlock('.flyql-dark')
            expect(block).toContain('--flyql-renderer-color: #e0b3e6;')
        })
    })

    describe('.flyql-path-dot rule', () => {
        it('uses the path-separator token color', () => {
            const block = extractBlock('.flyql-path-dot')
            expect(block).toContain('color: var(--flyql-path-separator-color)')
        })
    })

    describe('.flyql-path-dot descendant overrides (F2)', () => {
        it('includes .flyql-panel__match .flyql-path-dot in the override selector list', () => {
            expect(cssContent).toContain('.flyql-panel__match .flyql-path-dot')
        })

        it('override selectors keep path-separator color', () => {
            // Find the combined override block anchored by the panel-match selector.
            const idx = cssContent.indexOf('.flyql-panel__match .flyql-path-dot')
            expect(idx).toBeGreaterThan(-1)
            const openBrace = cssContent.indexOf('{', idx)
            const closeBrace = cssContent.indexOf('}', openBrace)
            const body = cssContent.substring(openBrace, closeBrace)
            expect(body).toContain('color: var(--flyql-path-separator-color)')
        })

        it('override selector list covers editor token classes that set their own color', () => {
            expect(cssContent).toContain('.flyql-key .flyql-path-dot')
            expect(cssContent).toContain('.flyql-column .flyql-path-dot')
            expect(cssContent).toContain('.flyql-col-column .flyql-path-dot')
        })
    })

    describe('.flyql-panel__footer-path rule', () => {
        it('wraps long paths with word-break instead of ellipsis', () => {
            const block = extractBlock('.flyql-panel__footer-path')
            expect(block).toContain('white-space: normal')
            expect(block).toContain('word-break: break-all')
            expect(block).not.toContain('text-overflow: ellipsis')
        })

        it('uses the code font family', () => {
            const block = extractBlock('.flyql-panel__footer-path')
            expect(block).toContain('font-family: var(--flyql-code-font-family)')
        })
    })

    describe('.flyql-panel__label row wrap', () => {
        it('wraps overflowing labels instead of clipping with ellipsis', () => {
            const block = extractBlock('.flyql-panel__label')
            expect(block).toContain('white-space: normal')
            expect(block).toContain('word-break: break-all')
            expect(block).not.toContain('text-overflow: ellipsis')
        })
    })
})
