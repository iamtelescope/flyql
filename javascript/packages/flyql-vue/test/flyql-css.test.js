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
                // icon <gap> label <gap> text — the prefix gap and the container's
                // padding-left are the same token, so the two cannot drift.
                expect(extractBlock(`.flyql-${comp}__prefix`)).toContain('gap: var(--flyql-prefix-gap);')
                expect(extractBlock(`.flyql-${comp}__container`)).toContain('padding-left: var(--flyql-prefix-gap);')
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

            it('keeps the text layers free of horizontal padding', () => {
                // Padding on a horizontally scrollable box only exists at scroll
                // offset 0, so a gap held there slides out of view with the text.
                const body = extractBlock(`.flyql-${comp}__highlight,\n.flyql-${comp}__input`)
                expect(body).toContain('padding: var(--flyql-padding-block) 0;')
                expect(body).not.toContain('width: 100%;')
            })

            it('sizes the overlay by its offsets, not a width', () => {
                // `width` beats `right` on an absolutely positioned box, so a
                // width here would make the overlay ignore its own right offset.
                const body = extractBlock(`.flyql-${comp}__highlight`)
                expect(body).toContain('left: var(--flyql-prefix-gap);')
                expect(body).toContain('right: 8px;')
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

describe('flyql.css (host theming hooks)', () => {
    it('exposes radius, block padding, label weight and hover border as tokens', () => {
        const root = extractBlock(':root')
        expect(root).toContain('--flyql-border-radius: 8px;')
        expect(root).toContain('--flyql-padding-block: 6px;')
        expect(root).toContain('--flyql-label-font-weight: inherit;')
        // defaults to the resting border, so nothing changes unless a host sets it
        expect(root).toContain('--flyql-border-hover: var(--flyql-border);')
    })

    for (const comp of ['editor', 'columns']) {
        describe(`.flyql-${comp}`, () => {
            it('drives the radius from the token', () => {
                expect(extractBlock(`.flyql-${comp}`)).toContain('border-radius: var(--flyql-border-radius);')
            })

            it('hovers only while not focused, so focus keeps the border', () => {
                expect(cssContent).toContain(`.flyql-${comp}:hover:not(.flyql-${comp}--focused)`)
            })

            it('moves prefix and both text layers with one padding token', () => {
                // __input and __highlight are two copies of the same text; any
                // difference between them desyncs highlighting from the caret.
                expect(extractBlock(`.flyql-${comp}__prefix`)).toContain(
                    'padding: var(--flyql-padding-block) 0 var(--flyql-padding-block) 10px;',
                )
                expect(extractBlock(`.flyql-${comp}__highlight,\n.flyql-${comp}__input`)).toContain(
                    'padding: var(--flyql-padding-block) 0;',
                )
            })

            it('lets the label take a host font weight', () => {
                expect(extractBlock(`.flyql-${comp}__label`)).toContain('font-weight: var(--flyql-label-font-weight);')
            })

            it('stops the text wrapping in single-line mode', () => {
                expect(cssContent).toContain(`.flyql-${comp}--single-line .flyql-${comp}__input`)
                expect(cssContent).toContain('white-space: pre;')
            })
        })
    }
})

describe('flyql.css (clear button)', () => {
    for (const comp of ['editor', 'columns']) {
        it(`.flyql-${comp}__clear sits on the first line and does not scroll`, () => {
            const body = extractBlock(`.flyql-${comp}__clear`)
            // mirrors __prefix so it centres on the first line and stays there
            expect(body).toContain('min-height: var(--flyql-line-height);')
            expect(body).toContain('padding: var(--flyql-padding-block) 4px;')
            expect(body).toContain('flex: 0 0 auto;')
        })
    }
})
