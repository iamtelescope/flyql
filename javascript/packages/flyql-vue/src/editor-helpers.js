/**
 * Editor display/DOM helpers shared by both editor SFCs.
 * Pure ES module — no Vue imports; engines stay free of DOM coupling.
 */

export const DEFAULT_MAX_LEN = 32

/**
 * Truncate long dotted suggestion labels for the panel list.
 * - Dotted labels longer than maxLen are rendered as `…<trailing-segments>` where
 *   the trailing suffix is the longest sequence of whole segments joined by '.' that
 *   fits within maxLen - ellipsis.length characters.
 * - When the leaf segment alone exceeds the budget, the function returns
 *   `ellipsis + leafSegment` whose total length MAY exceed maxLen — CSS
 *   `text-overflow: ellipsis` on `.flyql-panel__label` handles the visible clip.
 *   This is an intentional exception to the maxLen invariant so the leaf
 *   (usually the most informative part) remains visible in the footer's full path.
 * - Flat labels (no dots) are returned unchanged; CSS `text-overflow: ellipsis`
 *   handles their overflow.
 * - Labels at or below maxLen are returned unchanged.
 * Pure function; no DOM access, no escaping.
 */
export function truncateLabel(label, opts = {}) {
    const { maxLen = DEFAULT_MAX_LEN, ellipsis = '\u2026' } = opts
    if (!label) return label
    if (label.indexOf('.') === -1) return label
    if (label.length <= maxLen) return label
    const segments = label.split('.')
    const budget = maxLen - ellipsis.length
    let visible = ''
    for (let i = segments.length - 1; i >= 0; i--) {
        const candidate = visible ? segments[i] + '.' + visible : segments[i]
        if (candidate.length > budget) break
        visible = candidate
    }
    if (!visible) {
        // Leaf alone exceeds budget — still show it; CSS ellipsis clips the overflow.
        visible = segments[segments.length - 1]
    }
    return ellipsis + visible
}

/**
 * Predicate matching truncateLabel's truncation condition exactly.
 * Used by SFCs to decide whether to render the footer full-path span.
 */
export function labelWasTruncated(label, opts = {}) {
    const { maxLen = DEFAULT_MAX_LEN } = opts
    if (!label || label.indexOf('.') === -1) return false
    return label.length > maxLen
}

/**
 * Insert `text` at `{start, end}` of `textarea`, preserving the browser's native
 * undo stack. Uses document.execCommand('insertText') when available. Verifies
 * the native path actually mutated the textarea (defends against execCommand
 * returning true but doing nothing in detached / unfocused / sandboxed hosts).
 * Falls back to direct assignment plus a synthetic InputEvent on any failure
 * mode: false return, exception, or unchanged value.
 *
 * Returns 'native' | 'fallback' | 'no-op'.
 */
export function insertAtSelection(textarea, range, text) {
    if (!textarea) return 'no-op'
    if (typeof document === 'undefined') return 'no-op'
    if (document.activeElement !== textarea) {
        textarea.focus()
    }
    textarea.setSelectionRange(range.start, range.end)
    const preValue = textarea.value
    let nativeOk = false
    try {
        if (typeof document.execCommand === 'function') {
            nativeOk = document.execCommand('insertText', false, text) === true
        }
    } catch {
        nativeOk = false
    }
    if (nativeOk && textarea.value !== preValue) {
        const end = range.start + text.length
        textarea.setSelectionRange(end, end)
        return 'native'
    }
    const before = preValue.substring(0, range.start)
    const after = preValue.substring(range.end)
    textarea.value = before + text + after
    const end = range.start + text.length
    textarea.setSelectionRange(end, end)
    textarea.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: text, bubbles: true }))
    return 'fallback'
}
