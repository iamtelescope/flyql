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

describe('flyql.css (prefix slot: icon + label)', () => {
    for (const comp of ['editor', 'columns']) {
        describe(`.flyql-${comp}`, () => {
            it('lays the root out as a top-aligned flex row', () => {
                const body = extractBlock(`.flyql-${comp}`)
                expect(body).toContain('display: flex;')
                expect(body).toContain('align-items: flex-start;')
            })

            it('gives the prefix a fixed-width slot that caps at half the field', () => {
                const body = extractBlock(`.flyql-${comp}__prefix`)
                expect(body).toContain('flex: 0 0 auto;')
                expect(body).toContain('max-width: 50%;')
                expect(body).toContain('cursor: text;')
            })

            it('keeps the icon centred on the first input line under any box-sizing reset', () => {
                const body = extractBlock(`.flyql-${comp}__prefix`)
                expect(body).toContain('box-sizing: content-box;')
                expect(body).toContain('min-height: var(--flyql-line-height);')
            })

            it('centres the icon on the cap box, not the line box', () => {
                // FlyQL queries are dominated by CamelCase names and digits, so
                // the caps are the reference the eye aligns against.
                expect(extractBlock(`.flyql-${comp}__icon`)).toContain('top: var(--flyql-icon-offset);')
            })

            it('uses one gap between icon, label and text', () => {
                // icon <gap> label <gap> text — the prefix gap and the input's
                // padding-left are the same token, so the two cannot drift.
                expect(extractBlock(`.flyql-${comp}__prefix`)).toContain('gap: var(--flyql-prefix-gap);')
                const body = extractBlock(`.flyql-${comp}__highlight,\n.flyql-${comp}__input`)
                expect(body).toContain('padding: 6px 8px 6px var(--flyql-prefix-gap);')
            })

            it('drives the input line box from the themeable token', () => {
                const body = extractBlock(`.flyql-${comp}__highlight,\n.flyql-${comp}__input`)
                expect(body).toContain('line-height: var(--flyql-line-height);')
                expect(body).not.toContain('line-height: 18px;')
            })

            it('lets the input container take the remaining width', () => {
                const body = extractBlock(`.flyql-${comp}__container`)
                expect(body).toContain('flex: 1 1 auto;')
                expect(body).toContain('min-width: 0;')
            })

            it('no longer positions the icon absolutely', () => {
                const body = extractBlock(`.flyql-${comp}__icon`)
                expect(body).not.toContain('position: absolute;')
                expect(body).toContain('flex: 0 0 auto;')
            })

            it('keeps the UI font and corrects the baseline it lands on', () => {
                // The UI font has a taller ascent than the code font, so inside
                // the shared line box its baseline sits lower than the query's.
                const body = extractBlock(`.flyql-${comp}__label`)
                expect(body).toContain('font-family: var(--flyql-font-family);')
                expect(body).toContain('top: var(--flyql-label-offset);')
            })

            it('truncates an overlong label instead of pushing the input', () => {
                const body = extractBlock(`.flyql-${comp}__label`)
                expect(body).toContain('color: var(--flyql-label-color)')
                expect(body).toContain('white-space: nowrap;')
                expect(body).toContain('text-overflow: ellipsis;')
            })

            it('drops the left padding the absolute icon used to need', () => {
                const body = extractBlock(`.flyql-${comp}__highlight,\n.flyql-${comp}__input`)
                expect(body).toContain('padding: 6px 8px 6px var(--flyql-prefix-gap);')
            })
        })
    }

    it('exposes the line box and the icon nudge as theme tokens', () => {
        expect(extractBlock(':root')).toContain('--flyql-line-height: 18px;')
        expect(extractBlock(':root')).toContain('--flyql-icon-offset: -1px;')
        expect(extractBlock(':root')).toContain('--flyql-prefix-gap: 9px;')
        expect(extractBlock(':root')).toContain('--flyql-label-offset: -1.5px;')
        // no bare `line-height: 18px` property left, only the token declaration
        expect(cssContent).not.toContain('\n    line-height: 18px;')
    })

    it('pins a real monospace stack rather than bare `monospace`', () => {
        // `monospace` resolves differently per browser (Menlo in Chrome on
        // macOS, Courier in Safari), which shifts the icon's optical centre.
        expect(extractBlock(':root')).toContain(
            '--flyql-code-font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;',
        )
    })

    it('defines --flyql-label-color for both themes', () => {
        expect(extractBlock(':root')).toContain('--flyql-label-color: #6b6b6b;')
        expect(extractBlock('.flyql-dark')).toContain('--flyql-label-color: #9d9d9d;')
    })
})
