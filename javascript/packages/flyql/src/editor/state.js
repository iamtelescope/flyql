/**
 * Editor state management — pure JS, no framework dependencies.
 * Tracks cursor position, selection, and focus/activation state.
 */

export class EditorState {
    constructor() {
        this.query = ''
        this.cursorPosition = 0
        this.selectionStart = 0
        this.selectionEnd = 0
        this.focused = false
        this.activated = false
        this.composing = false
        this.selectedIndex = 0
    }

    setQuery(text) {
        this.query = text || ''
    }

    setCursorPosition(pos) {
        this.cursorPosition = pos
        this.selectionStart = pos
        this.selectionEnd = pos
    }

    setSelection(start, end) {
        this.selectionStart = start
        this.selectionEnd = end
        this.cursorPosition = start
    }

    setFocused(focused) {
        this.focused = focused
    }

    setActivated(activated) {
        this.activated = activated
    }

    setComposing(composing) {
        this.composing = composing
    }

    getTextBeforeCursor() {
        return this.query.substring(0, this.cursorPosition)
    }

    getFilterPrefix(context) {
        if (!context) return ''
        if (context.expecting === 'column') return context.key || ''
        if (context.expecting === 'operatorPrefix') return context.keyValueOperator || ''
        if (context.expecting === 'value') return context.value || ''
        if (context.expecting === 'boolOp') {
            const match = context.textBeforeCursor.match(/(\S*)$/)
            return match ? match[1] : ''
        }
        return ''
    }
}
