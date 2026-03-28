/**
 * EditorEngine — framework-agnostic editor logic.
 * Pure JS class, no Vue/React/DOM dependencies.
 * One instance per editor component.
 */

import { Parser, CharType, State, VALID_KEY_VALUE_OPERATORS } from '../core/index.js'
import { EditorState } from './state.js'
import {
    updateSuggestions,
    prepareSuggestionValues,
    resolveColumnDef,
    getInsertRange,
    STATE_LABELS,
} from './suggestions.js'

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

/**
 * Normalize newlines to spaces for parser consumption.
 * The editor supports multiline visually, but the parser only recognizes spaces as delimiters.
 */
function normalizeForParser(text) {
    return text.replace(/\r\n/g, '  ').replace(/[\r\n]/g, ' ')
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
        this.onKeyDiscovery = options.onKeyDiscovery || null
        this.onLoadingChange = options.onLoadingChange || null
        this.debounceMs = options.debounceMs ?? 300
        this.state = new EditorState()
        this.context = null
        this.suggestions = []
        this.suggestionType = ''
        this.incomplete = false
        this.message = ''
        this.isLoading = false
        this.keyCache = {}
        this._suggestionSeq = 0
        this._debounceTimer = null
        this._valueState = null
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
                nestingDepth: 0,
            }
        }

        const normalized = normalizeForParser(textBeforeCursor)
        const parser = new Parser()
        try {
            parser.parse(normalized, false, true)
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
                nestingDepth: parser.nodesStack ? parser.nodesStack.length : 0,
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
                nestingDepth: parser.nodesStack ? parser.nodesStack.length : 0,
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
            nestingDepth: parser.nodesStack ? parser.nodesStack.length : 0,
        }

        // Detect transformer context: key contains pipe character
        const keyStr = ctx.key
        const pipeIndex = keyStr.indexOf('|')
        if (pipeIndex >= 0) {
            const lastPipeIndex = keyStr.lastIndexOf('|')
            ctx.transformerBaseKey = keyStr.substring(0, pipeIndex)
            ctx.transformerPrefix = keyStr.substring(lastPipeIndex + 1)
            ctx.transformerChain = pipeIndex < lastPipeIndex ? keyStr.substring(pipeIndex + 1, lastPipeIndex) : ''
            // Normalize key to base column for all downstream lookups
            ctx.key = ctx.transformerBaseKey
            if (parser.state === State.KEY) {
                ctx.expecting = 'transformer'
                return ctx
            }
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
        } else if (parser.state === State.EXPECT_HAS_KEYWORD) {
            ctx.expecting = 'none'
        }

        return ctx
    }

    /**
     * Update suggestions based on current cursor position.
     * Debounces async calls (value/key loading) to avoid excessive requests.
     * Returns a promise (may be async for value loading).
     */
    async updateSuggestions() {
        const seq = ++this._suggestionSeq
        if (this._debounceTimer) {
            clearTimeout(this._debounceTimer)
            this._debounceTimer = null
        }
        const textBeforeCursor = this.state.getTextBeforeCursor()
        const ctx = this.buildContext(textBeforeCursor)
        this.context = ctx
        this.message = ''
        this.suggestionType = ctx ? ctx.expecting || '' : 'column'

        // Reset value state when leaving value context or changing key
        if (!ctx || ctx.expecting !== 'value' || (this._valueState && this._valueState.key !== ctx.key)) {
            this._valueState = null
        }

        // Only enter async _valueState flow when the column actually needs server fetch:
        // - column has autocomplete enabled AND no static values, OR
        // - column is unknown (unresolved dotted key — let onAutocomplete try)
        const _needsAsyncValue =
            ctx &&
            ctx.expecting === 'value' &&
            this.onAutocomplete &&
            (() => {
                const col = resolveColumnDef(this.columns, ctx.key)
                if (!col) return true
                if (!col.autocomplete) return false
                return !col.values || col.values.length === 0
            })()

        // Complete list: client-side filter, no server call
        if (_needsAsyncValue && this._valueState && !this._valueState.incomplete) {
            this.suggestions = prepareSuggestionValues(this._valueState.items, ctx.quoteChar, ctx.value)
            this.incomplete = false
            this.isLoading = false
            this.state.selectedIndex = 0
            return ctx
        }

        // Incomplete list refinement: keep current suggestions, debounce re-fetch
        if (_needsAsyncValue && this._valueState && this._valueState.incomplete) {
            // Don't clear suggestions — keep showing current values
            this.isLoading = true
            if (this.onLoadingChange) this.onLoadingChange(true)
            if (this.debounceMs > 0) {
                await new Promise((resolve) => {
                    this._debounceTimer = setTimeout(resolve, this.debounceMs)
                })
                if (seq !== this._suggestionSeq) return ctx
            }

            const result = await updateSuggestions(
                ctx,
                this.columns,
                this.onAutocomplete,
                this.onKeyDiscovery,
                this.keyCache,
                (loading) => {
                    if (seq !== this._suggestionSeq) return
                    this.isLoading = loading
                    if (this.onLoadingChange) this.onLoadingChange(loading)
                },
            )

            if (seq !== this._suggestionSeq) return ctx

            this._valueState = {
                key: ctx.key,
                value: ctx.value,
                items: result.rawItems || this._valueState.items,
                incomplete: result.incomplete,
            }
            this.suggestions = result.suggestions
            this.suggestionType = result.suggestionType
            this.incomplete = result.incomplete || false
            this.message = result.suggestions.length === 0 ? 'No matching values' : result.message
            this.state.selectedIndex = 0
            return ctx
        }

        // Initial value load: no debounce
        if (_needsAsyncValue && !this._valueState) {
            // Mark pending so subsequent keystrokes hit the debounced refinement branch
            this._valueState = { key: ctx.key, value: ctx.value, items: [], incomplete: true }
            this.suggestions = []
            this.incomplete = false
            this.isLoading = true
            this.state.selectedIndex = 0

            const result = await updateSuggestions(
                ctx,
                this.columns,
                this.onAutocomplete,
                this.onKeyDiscovery,
                this.keyCache,
                (loading) => {
                    if (seq !== this._suggestionSeq) return
                    this.isLoading = loading
                    if (this.onLoadingChange) this.onLoadingChange(loading)
                },
            )

            if (seq !== this._suggestionSeq) return ctx

            this._valueState = {
                key: ctx.key,
                value: ctx.value,
                items: result.rawItems || [],
                incomplete: result.incomplete,
            }
            this.suggestions = result.suggestions
            this.suggestionType = result.suggestionType
            this.incomplete = result.incomplete || false
            this.message = result.suggestions.length === 0 ? 'No matching values' : result.message
            this.state.selectedIndex = 0
            return ctx
        }

        // Non-value suggestions (columns, operators, boolOps) or value with static values
        this.suggestions = []
        this.incomplete = false
        this.isLoading = false
        this.state.selectedIndex = 0

        const result = await updateSuggestions(
            ctx,
            this.columns,
            this.onAutocomplete,
            this.onKeyDiscovery,
            this.keyCache,
            (loading) => {
                if (seq !== this._suggestionSeq) return
                this.isLoading = loading
                if (this.onLoadingChange) this.onLoadingChange(loading)
            },
        )

        if (seq !== this._suggestionSeq) return ctx

        this.suggestions = result.suggestions
        this.suggestionType = result.suggestionType
        this.incomplete = result.incomplete || false
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

        const normalized = normalizeForParser(value)
        const parser = new Parser()
        try {
            parser.parse(normalized, false, true)
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

        for (let i = 0; i < typedChars.length; i++) {
            const charType = typedChars[i][1]
            // Use original character (preserves newlines) instead of normalized space
            const ch = value[i] !== undefined ? value[i] : typedChars[i][0].value
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
            incomplete: this.incomplete,
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
        const normalized = normalizeForParser(value)
        const parser = new Parser()
        try {
            parser.parse(normalized, false, false)
        } catch (e) {
            return { valid: false, message: e.message || 'Parse error' }
        }
        if (parser.state === State.ERROR) {
            return { valid: false, message: parser.errorText || 'Parse error' }
        }
        if (
            parser.state === State.EXPECT_BOOL_OP ||
            parser.state === State.VALUE ||
            parser.state === State.KEY ||
            parser.state === State.KEY_OR_BOOL_OP
        ) {
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
     * Clear the key discovery cache (e.g., when deactivating).
     */
    clearKeyCache() {
        this.keyCache = {}
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
