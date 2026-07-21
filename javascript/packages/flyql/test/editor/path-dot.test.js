import { describe, it, expect } from 'vitest'
import { computeOutsideQuoteMask, renderWithDotMask } from '../../src/editor/path-dot.js'

describe('path-dot', () => {
    describe('computeOutsideQuoteMask', () => {
        it('plain unquoted text — every position is outside-quote', () => {
            expect(computeOutsideQuoteMask('a.b')).toEqual([true, true, true])
        })

        it('single-quoted segment — opening quote marked outside, closing inside', () => {
            // "a.'b.c'.d" — single-quote opens at 2, closes at 6.
            // The opening quote is processed before the in-quote flip
            // (so mask[2]=true); the closing quote is processed in-quote
            // (so mask[6]=false). Inner chars are inside-quote.
            expect(computeOutsideQuoteMask("a.'b.c'.d")).toEqual([
                true, // a
                true, // .
                true, // ' (opening — flipped after this position)
                false, // b
                false, // .
                false, // c
                false, // ' (closing)
                true, // .
                true, // d
            ])
        })

        it('double-quoted segment — symmetric to single-quoted', () => {
            expect(computeOutsideQuoteMask('a."b.c".d')).toEqual([
                true, // a
                true, // .
                true, // " (opening)
                false, // b
                false, // .
                false, // c
                false, // " (closing)
                true, // .
                true, // d
            ])
        })

        it("escaped inner quote (\\') does NOT close the segment", () => {
            // raw chars: ' a \ ' b '   (length 6)
            // \' at index 3 has prev=\ at index 2 → don't close.
            // closing ' at index 5 has prev=b → does close.
            expect(computeOutsideQuoteMask("'a\\'b'")).toEqual([true, false, false, false, false, false])
        })

        it("backslash-doubling parity: \\\\' is treated the same as \\'", () => {
            // raw chars: ' a \ \ ' b '   (length 7)
            // The walker uses a single-prev-char check, mirroring the parser
            // (core/parser.js:1631 / :1653). The quote at index 4 has prev=\,
            // so it does NOT close — matching parser behavior. AC9 pins this.
            expect(computeOutsideQuoteMask("'a\\\\'b'")).toEqual([true, false, false, false, false, false, false])
        })

        it('empty input', () => {
            expect(computeOutsideQuoteMask('')).toEqual([])
        })

        it('unclosed quote — every position after the opening quote is inside-quote', () => {
            // raw chars: a . ' b . c   (length 6, no closing quote)
            // Opening ' at index 2 is marked true (flip happens after); the
            // rest of the segment stays inside-quote.
            expect(computeOutsideQuoteMask("a.'b.c")).toEqual([true, true, true, false, false, false])
        })

        it('mismatched quote types do not close each other', () => {
            // single-quoted segment containing a literal " — " at index 2 must
            // not close the single-quoted segment.
            expect(computeOutsideQuoteMask("'a\"b'")).toEqual([true, false, false, false, false])
        })
    })

    describe('renderWithDotMask', () => {
        it('wraps dot when mask says outside-quote', () => {
            expect(renderWithDotMask('a.b', [true, true, true])).toBe('a<span class="flyql-path-dot">.</span>b')
        })

        it('does NOT wrap dot when mask says inside-quote', () => {
            expect(renderWithDotMask('.', [false])).toBe('.')
        })

        it('escapes <, ", and \' as HTML entities', () => {
            const text = "a<b'c"
            const mask = [true, true, true, true, true]
            expect(renderWithDotMask(text, mask)).toBe('a&lt;b&#x27;c')
        })

        it('mixes wrapped and unwrapped dots according to mask', () => {
            // a.'b.c'.d — outer dots wrapped, inner dot literal.
            const text = "a.'b.c'.d"
            const mask = computeOutsideQuoteMask(text)
            expect(renderWithDotMask(text, mask)).toBe(
                'a<span class="flyql-path-dot">.</span>&#x27;b.c&#x27;<span class="flyql-path-dot">.</span>d',
            )
        })

        it('escapes & < > " \'', () => {
            const text = '&<>"\''
            const mask = [true, true, true, true, true]
            expect(renderWithDotMask(text, mask)).toBe('&amp;&lt;&gt;&quot;&#x27;')
        })

        it('empty input', () => {
            expect(renderWithDotMask('', [])).toBe('')
        })
    })
})
