/**
 * Quote-aware path-dot rendering for KEY/COLUMN token text.
 *
 * Why this lives here:
 *   - getHighlightTokens may subdivide a single token at diagnostic,
 *     hover-highlight, or newline boundaries. Quote state must be
 *     stable across those splits, so we compute a value-level boolean
 *     mask once and slice it per segment.
 *   - Mirrors core/parser.js SINGLE_QUOTED_KEY (entry :1620, escape :1631)
 *     and DOUBLE_QUOTED_KEY (entry :1642, escape :1653). The pathological
 *     `\\'` case follows parser behavior — see AC9.
 */

const ESCAPE = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
}

function escapeChar(c) {
    return ESCAPE[c] !== undefined ? ESCAPE[c] : c
}

/**
 * Compute outside-quote mask over raw text. mask[i] === true iff position i
 * is OUTSIDE any quoted segment. Backslash-escape parity with parser:
 * a quote whose immediately preceding raw char is `\` does NOT close.
 *
 * Convention (asymmetric — verified by path-dot.test.js):
 *   - The OPENING quote is processed before flipping into in-quote state,
 *     so its position is marked TRUE (outside).
 *   - The CLOSING quote is processed while still in-quote state, so its
 *     position is marked FALSE (inside).
 * This is invisible for the current consumer (only `.` is wrapped, never
 * `'` or `"`), but if this helper is reused for any other char-class
 * decision, callers should account for the asymmetry — or compute their
 * own mask using a different convention.
 *
 * @param {string} rawText
 * @returns {boolean[]}
 */
export function computeOutsideQuoteMask(rawText) {
    const n = rawText.length
    const mask = new Array(n)
    let inQuote = null
    for (let i = 0; i < n; i++) {
        const c = rawText[i]
        if (inQuote === null) {
            mask[i] = true
            if (c === "'" || c === '"') {
                inQuote = c
            }
        } else {
            mask[i] = false
            if (c === inQuote && (i === 0 || rawText[i - 1] !== '\\')) {
                inQuote = null
            }
        }
    }
    return mask
}

/**
 * Render a raw-text segment as escaped HTML; wrap dots in
 * <span class="flyql-path-dot">.</span> only where segMask[i] is true.
 *
 * Throws if segMask is not aligned to segText — silently treating
 * out-of-range mask indices as falsy would no-wrap dots and mask the
 * caller's bug.
 *
 * @param {string} segText - raw segment text
 * @param {boolean[]} segMask - mask aligned to segText (segMask.length === segText.length)
 * @returns {string} HTML
 */
export function renderWithDotMask(segText, segMask) {
    if (segMask.length !== segText.length) {
        throw new Error(
            `renderWithDotMask: segMask length (${segMask.length}) must equal segText length (${segText.length})`,
        )
    }
    let out = ''
    for (let i = 0; i < segText.length; i++) {
        const c = segText[i]
        if (c === '.' && segMask[i]) {
            out += '<span class="flyql-path-dot">.</span>'
        } else {
            out += escapeChar(c)
        }
    }
    return out
}
