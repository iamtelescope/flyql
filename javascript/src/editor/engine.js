/**
 * EditorEngine — framework-agnostic editor logic.
 * Pure JS class, no Vue/React/DOM dependencies.
 * One instance per editor component.
 */

import { Parser, CharType, State, VALID_KEY_VALUE_OPERATORS } from '../core/index.js'
import { EditorState } from './state.js'
import { updateSuggestions, getInsertRange, STATE_LABELS } from './suggestions.js'

const CHAR_TYPE_CLASS = {
    [CharType.KEY]: 'flyql-key',
    [CharType.OPERATOR]: 'flyql-operator',
    [CharType.VALUE]: 'flyql-value',
    [CharType.NUMBER]: 'flyql-number',
    [CharType.STRING]: 'flyql-string',
    [CharType.SPACE]: 'flyql-space',
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function wrapSpan(charType, text) {
    const escaped = escapeHtml(text)
    const cls = CHAR_TYPE_CLASS[charType]
    if (cls) {
        return `<span class="${cls}">${escaped}</span>`
    }
    return escaped
}

export class EditorEngine {
    constructor(columns, options = {}) {
        this.columns = columns || {}
        this.onAutocomplete = options.onAutocomplete || null
        this.onLoadingChange = options.onLoadingChange || null
        this.state = new EditorState()
        this.context = null
        this.suggestions = []
        this.suggestionType = ''
        this.message = ''
        this.isLoading = false
        this.valueCache = {}
        this._suggestionSeq = 0
    }

    /**
     * Set the query text and update cursor position.
     */
    setQuery(text) {
        this.state.setQuery(text)
    }

    /**
     * Set cursor position within the query.
     */
    setCursorPosition(pos) {
        this.state.setCursorPosition(pos)
    }

    /**
     * Build context from text before cursor — determines what the editor expects next.
     */
    buildContext(textBeforeCursor) {
        if (!textBeforeCursor) {
            return {
                expecting: 'column',
                key: '',
                value: '',
                quoteChar: '',
                keyValueOperator: '',
                state: 'INITIAL',
                textBeforeCursor: '',
            }
        }

        const parser = new Parser()
        try {
            parser.parse(textBeforeCursor, false, true)
        } catch (e) {
            return {
                expecting: '',
                key: '',
                value: '',
                quoteChar: '',
                keyValueOperator: '',
                state: 'ERROR',
                error: e.message || 'Parse error',
                textBeforeCursor,
            }
        }

        if (parser.state === State.ERROR) {
            return {
                expecting: '',
                key: '',
                value: '',
                quoteChar: '',
                keyValueOperator: '',
                state: 'ERROR',
                error: parser.errorText || 'Parse error',
                textBeforeCursor,
            }
        }

        const ctx = {
            state: parser.state,
            key: parser.key || '',
            value: parser.value || '',
            keyValueOperator: parser.keyValueOperator || '',
            quoteChar: '',
            expecting: '',
            textBeforeCursor,
        }

        if (
            parser.state === State.KEY ||
            parser.state === State.INITIAL ||
            parser.state === State.BOOL_OP_DELIMITER ||
            parser.state === State.SINGLE_QUOTED_KEY ||
            parser.state === State.DOUBLE_QUOTED_KEY
        ) {
            ctx.expecting = 'column'
        } else if (parser.state === State.KEY_OR_BOOL_OP) {
            ctx.expecting = 'operatorOrBool'
        } else if (parser.state === State.EXPECT_OPERATOR) {
            ctx.expecting = 'operatorOrBool'
        } else if (parser.state === State.EXPECT_LIST_START) {
            ctx.expecting = 'list'
        } else if (
            parser.state === State.EXPECT_LIST_VALUE ||
            parser.state === State.IN_LIST_VALUE ||
            parser.state === State.IN_LIST_SINGLE_QUOTED_VALUE ||
            parser.state === State.IN_LIST_DOUBLE_QUOTED_VALUE ||
            parser.state === State.EXPECT_LIST_COMMA_OR_END
        ) {
            ctx.expecting = 'none'
        } else if (parser.state === State.KEY_VALUE_OPERATOR) {
            const op = parser.keyValueOperator
            const isValid = VALID_KEY_VALUE_OPERATORS.includes(op)
            const hasLonger = VALID_KEY_VALUE_OPERATORS.some((o) => o.startsWith(op) && o !== op)
            if (hasLonger) {
                ctx.expecting = 'operatorPrefix'
            } else if (isValid) {
                ctx.expecting = 'value'
            }
        } else if (
            parser.state === State.VALUE ||
            parser.state === State.EXPECT_VALUE ||
            parser.state === State.DOUBLE_QUOTED_VALUE ||
            parser.state === State.SINGLE_QUOTED_VALUE
        ) {
            ctx.expecting = 'value'
            if (parser.state === State.DOUBLE_QUOTED_VALUE) ctx.quoteChar = '"'
            else if (parser.state === State.SINGLE_QUOTED_VALUE) ctx.quoteChar = "'"
        } else if (parser.state === State.EXPECT_BOOL_OP) {
            ctx.expecting = 'boolOp'
        } else if (parser.state === State.EXPECT_NOT_TARGET) {
            ctx.expecting = 'column'
        } else if (parser.state === State.EXPECT_IN_KEYWORD) {
            ctx.expecting = 'none'
        }

        return ctx
    }

    /**
     * Update suggestions based on current cursor position.
     * Returns a promise (may be async for value loading).
     */
    async updateSuggestions() {
        const seq = ++this._suggestionSeq
        const textBeforeCursor = this.state.getTextBeforeCursor()
        const ctx = this.buildContext(textBeforeCursor)
        this.context = ctx
        this.message = ''
        this.isLoading = false
        this.suggestions = []
        this.state.selectedIndex = 0

        const result = await updateSuggestions(ctx, this.columns, this.onAutocomplete, this.valueCache, (loading) => {
            if (seq !== this._suggestionSeq) return
            this.isLoading = loading
            if (this.onLoadingChange) this.onLoadingChange(loading)
        })

        if (seq !== this._suggestionSeq) return ctx

        this.suggestions = result.suggestions
        this.suggestionType = result.suggestionType
        this.message = result.message
        this.state.selectedIndex = 0

        return ctx
    }

    /**
     * Generate highlight tokens as HTML string.
     * Accepts an optional query parameter to avoid mutating engine state.
     */
    getHighlightTokens(query) {
        const value = query !== undefined ? query : this.state.query
        if (!value) return ''

        const parser = new Parser()
        try {
            parser.parse(value, false, true)
        } catch {
            return escapeHtml(value)
        }

        const typedChars = parser.typedChars
        if (!typedChars || typedChars.length === 0) {
            return escapeHtml(value)
        }

        let html = ''
        let currentType = null
        let currentText = ''

        for (const [char, charType] of typedChars) {
            const ch = char.value
            if (charType === currentType && ch !== '\n') {
                currentText += ch
            } else {
                if (currentText) {
                    html += wrapSpan(currentType, currentText)
                }
                currentType = charType
                currentText = ch
            }
        }
        if (currentText) {
            html += wrapSpan(currentType, currentText)
        }

        if (parser.state === State.ERROR && typedChars.length < value.length) {
            const remaining = value.substring(typedChars.length)
            html += `<span class="flyql-error">${escapeHtml(remaining)}</span>`
        }

        return html
    }

    /**
     * Get current suggestions list.
     */
    getSuggestions() {
        return this.suggestions
    }

    /**
     * Get the current editor state snapshot.
     */
    getState() {
        return {
            query: this.state.query,
            cursorPosition: this.state.cursorPosition,
            focused: this.state.focused,
            activated: this.state.activated,
            composing: this.state.composing,
            selectedIndex: this.state.selectedIndex,
            context: this.context,
            suggestions: this.suggestions,
            suggestionType: this.suggestionType,
            message: this.message,
            isLoading: this.isLoading,
        }
    }

    /**
     * Get current parse error, if any.
     */
    getParseError() {
        if (this.context && this.context.state === 'ERROR') {
            return this.context.error
        }
        return null
    }

    /**
     * Validate the full query and return status.
     */
    getQueryStatus() {
        const value = this.state.query
        if (!value) return { valid: true, message: 'Empty query' }
        const parser = new Parser()
        try {
            parser.parse(value, false, false)
        } catch (e) {
            return { valid: false, message: e.message || 'Parse error' }
        }
        if (parser.state === State.ERROR) {
            return { valid: false, message: parser.errorText || 'Parse error' }
        }
        if (parser.state === State.EXPECT_BOOL_OP) {
            return { valid: true, message: 'Valid query' }
        }
        return { valid: false, message: 'Incomplete query' }
    }

    /**
     * Get the text range to replace when accepting a suggestion.
     */
    getInsertRange(ctx, fullText) {
        return getInsertRange(ctx || this.context, fullText || this.state.query, this.suggestionType)
    }

    /**
     * Navigate suggestion selection up.
     */
    navigateUp() {
        if (this.suggestions.length === 0) return
        this.state.selectedIndex =
            this.state.selectedIndex <= 0 ? this.suggestions.length - 1 : this.state.selectedIndex - 1
    }

    /**
     * Navigate suggestion selection down.
     */
    navigateDown() {
        if (this.suggestions.length === 0) return
        this.state.selectedIndex =
            this.state.selectedIndex >= this.suggestions.length - 1 ? 0 : this.state.selectedIndex + 1
    }

    /**
     * Get the selected suggestion item.
     */
    selectSuggestion(index) {
        const suggestion = this.suggestions[index]
        if (!suggestion) return null
        return suggestion
    }

    /**
     * Get the state label for the current suggestion type.
     */
    getStateLabel() {
        return STATE_LABELS[this.suggestionType] || ''
    }

    /**
     * Get filter prefix for highlighting matched text in suggestions.
     */
    getFilterPrefix() {
        return this.state.getFilterPrefix(this.context)
    }

    /**
     * Clear the value cache (e.g., when deactivating).
     */
    clearValueCache() {
        this.valueCache = {}
    }

    /**
     * Highlight the matching portion of a suggestion label.
     */
    highlightMatch(label) {
        const prefix = this.getFilterPrefix()
        if (!prefix) return escapeHtml(label)
        if (!label.toLowerCase().startsWith(prefix.toLowerCase())) return escapeHtml(label)
        const matched = escapeHtml(label.substring(0, prefix.length))
        const rest = escapeHtml(label.substring(prefix.length))
        return `<span class="flyql-panel__match">${matched}</span>${rest}`
    }
}
