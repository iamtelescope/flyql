/**
 * EditorEngine — framework-agnostic editor logic.
 * Pure JS class, no Vue/React/DOM dependencies.
 * One instance per editor component.
 */

import {
    Parser,
    CharType,
    State,
    VALID_KEY_VALUE_OPERATORS,
    isNumeric,
    Column,
    ColumnSchema,
    Diagnostic,
    diagnose,
    CODE_UNKNOWN_COLUMN,
    CODE_UNKNOWN_TRANSFORMER,
    Range,
} from 'flyql/core'
import { Type, tokenize } from 'flyql'
import { defaultRegistry } from 'flyql/transformers'
import { EditorState } from './state.js'
import {
    updateSuggestions,
    prepareSuggestionValues,
    resolveColumnDef,
    getColumnSuggestionsForValue,
    getInsertRange,
    STATE_LABELS,
} from './suggestions.js'

/**
 * Maps editor-input raw-type strings (as appearing in user schema definitions)
 * to canonical flyql.Type values. Unknown strings fall through to Type.Unknown
 * so the validator's chain check is skipped cleanly (never leak raw strings).
 */
const EDITOR_TYPE_TO_FLYQL = {
    enum: Type.String,
    string: Type.String,
    number: Type.Int,
    int: Type.Int,
    integer: Type.Int,
    float: Type.Float,
    bool: Type.Bool,
    boolean: Type.Bool,
    array: Type.Array,
    map: Type.Map,
    struct: Type.Struct,
    json: Type.JSON,
    date: Type.Date,
}

const _FLYQL_TYPE_VALUES = new Set(Object.values(Type))

function _applyEditorTypeNormalization(col) {
    if (col.type && !_FLYQL_TYPE_VALUES.has(col.type)) {
        const mapped = EDITOR_TYPE_TO_FLYQL[col.type]
        col.type = mapped !== undefined ? mapped : Type.Unknown
    }
    if (col.children) {
        for (const child of Object.values(col.children)) {
            if (child) _applyEditorTypeNormalization(child)
        }
    }
}

const CHAR_TYPE_CLASS = {
    [CharType.KEY]: 'flyql-key',
    [CharType.OPERATOR]: 'flyql-operator',
    [CharType.VALUE]: 'flyql-value',
    [CharType.NUMBER]: 'flyql-number',
    [CharType.STRING]: 'flyql-string',
    [CharType.BOOLEAN]: 'flyql-boolean',
    [CharType.NULL]: 'flyql-null',
    [CharType.SPACE]: 'flyql-space',
    [CharType.PIPE]: 'flyql-transformer',
    [CharType.TRANSFORMER]: 'flyql-transformer',
    [CharType.FUNCTION]: 'flyql-function',
    [CharType.ARGUMENT]: 'flyql-argument',
    [CharType.ARGUMENT_STRING]: 'flyql-argument-string',
    [CharType.ARGUMENT_NUMBER]: 'flyql-argument-number',
    [CharType.WILDCARD]: 'flyql-wildcard',
    [CharType.COLUMN]: 'flyql-column',
    [CharType.PARAMETER]: 'flyql-parameter',
    [CharType.ERROR]: 'flyql-error',
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
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
    constructor(schema, options = {}) {
        this.columns = schema || new ColumnSchema({})
        for (const col of Object.values(this.columns.columns)) {
            if (col) _applyEditorTypeNormalization(col)
        }
        this.onAutocomplete = options.onAutocomplete || null
        this.onKeyDiscovery = options.onKeyDiscovery || null
        this.onLoadingChange = options.onLoadingChange || null
        this.registry = options.registry || defaultRegistry()
        this.parameters = options.parameters || []
        this.debounceMs = options.debounceMs ?? 300
        this.state = new EditorState()
        this.context = null
        this.suggestions = []
        this.suggestionType = ''
        this.incomplete = false
        this.message = ''

        this.activeTab = 'values'
        this.valueSuggestions = []
        this.columnSuggestions = []
        this.valueMessage = ''

        this.isLoading = false
        this.keyCache = {}
        this._suggestionSeq = 0
        this._debounceTimer = null
        this._valueState = null
        this._lastValueKey = null
        this._validatorColumns = null
        this.diagnostics = []
    }

    setTab(tab) {
        if (tab === this.activeTab) return
        this.activeTab = tab
        this.suggestions = tab === 'values' ? this.valueSuggestions : this.columnSuggestions
        this.message = tab === 'values' ? this.valueMessage : ''
        this.state.selectedIndex = 0
    }

    cycleTab() {
        this.setTab(this.activeTab === 'values' ? 'columns' : 'values')
    }

    _resetTabState() {
        this.activeTab = 'values'
        this.valueSuggestions = []
        this.columnSuggestions = []
        this.valueMessage = ''
    }

    /**
     * Set columns and invalidate the validator column cache.
     */
    setColumns(schema) {
        this.columns = schema || new ColumnSchema({})
        for (const col of Object.values(this.columns.columns)) {
            if (col) _applyEditorTypeNormalization(col)
        }
        this._validatorColumns = null
    }

    /**
     * Set the list of available parameter names (without `$` prefix).
     */
    setParameters(params) {
        this.parameters = params || []
    }

    setRegistry(registry) {
        this.registry = registry || defaultRegistry()
    }

    _buildValidatorColumns() {
        // ColumnSchema is already typed — return it directly for the validator
        this._validatorColumns = this.columns
        return this._validatorColumns
    }

    /**
     * Run the validator on the current query and return diagnostics.
     * Includes parser syntax errors and semantic validation errors.
     */
    getDiagnostics() {
        const value = this.state.query
        if (!value) {
            this.diagnostics = []
            return this.diagnostics
        }
        const normalized = normalizeForParser(value)
        const parser = new Parser()
        try {
            parser.parse(normalized, false, false)
        } catch (e) {
            const range = e.range || new Range(parser.typedChars ? parser.typedChars.length : 0, normalized.length)
            // Suppress syntax errors at the end of query — user is still typing
            if (range.end >= normalized.length) {
                this.diagnostics = []
                return this.diagnostics
            }
            this.diagnostics = [new Diagnostic(range, e.message || 'Parse error', 'error', 'syntax')]
            return this.diagnostics
        }
        if (parser.state === State.ERROR) {
            const start = parser.typedChars ? parser.typedChars.length : 0
            // Suppress if error is at the end of query
            if (start >= normalized.length - 1) {
                this.diagnostics = []
                return this.diagnostics
            }
            this.diagnostics = [
                new Diagnostic(
                    new Range(start, normalized.length),
                    parser.errorText || 'Parse error',
                    'error',
                    'syntax',
                ),
            ]
            return this.diagnostics
        }
        if (
            parser.state !== State.EXPECT_BOOL_OP &&
            parser.state !== State.VALUE &&
            parser.state !== State.KEY &&
            parser.state !== State.KEY_OR_BOOL_OP
        ) {
            this.diagnostics = []
            return this.diagnostics
        }
        if (!parser.root) {
            this.diagnostics = []
            return this.diagnostics
        }
        const columns = this._validatorColumns || this._buildValidatorColumns()
        const reg = this.registry
        try {
            this.diagnostics = diagnose(parser.root, columns, reg)
        } catch {
            this.diagnostics = []
        }
        // Suppress unknown_transformer/unknown_column at query end when name is a prefix of a known one
        if (this.diagnostics.length > 0) {
            const queryLen = normalized.length
            const transformerNames = reg.names()
            const columnNames = Object.keys(this.columns.columns).map((n) => n.toLowerCase())
            this.diagnostics = this.diagnostics.filter((d) => {
                if (d.range.end < queryLen) return true
                if (d.code === CODE_UNKNOWN_TRANSFORMER) {
                    const match = d.message.match(/^unknown transformer: '(.+)'$/)
                    if (!match) return true
                    const partial = match[1]
                    return !transformerNames.some((n) => n.startsWith(partial) && n !== partial)
                }
                if (d.code === CODE_UNKNOWN_COLUMN) {
                    const match = d.message.match(/^column '(.+)' is not defined$/)
                    if (!match) return true
                    const partial = match[1].toLowerCase()
                    return !columnNames.some((n) => n.startsWith(partial) && n !== partial)
                }
                return true
            })
        }
        return this.diagnostics
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
            let rawPrefix = keyStr.substring(lastPipeIndex + 1)
            ctx.transformerChain = pipeIndex < lastPipeIndex ? keyStr.substring(pipeIndex + 1, lastPipeIndex) : ''
            // Strip argument portion from prefix: "upper(1,2" → "upper"
            const parenIdx = rawPrefix.indexOf('(')
            if (parenIdx >= 0 && !rawPrefix.endsWith(')')) {
                ctx.transformerPrefix = rawPrefix.substring(0, parenIdx)
                ctx.transformerInArgs = true
            } else if (parenIdx >= 0) {
                ctx.transformerPrefix = rawPrefix.substring(0, parenIdx)
                ctx.transformerInArgs = false
            } else {
                ctx.transformerPrefix = rawPrefix
                ctx.transformerInArgs = false
            }
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
        } else if (parser.state === State.EXPECT_LIKE_KEYWORD) {
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

        // Reset tab state when leaving value context or changing key
        if (!ctx || ctx.expecting !== 'value') {
            this._resetTabState()
        } else if (this._lastValueKey && this._lastValueKey !== ctx.key) {
            this._resetTabState()
        }
        if (ctx && ctx.expecting === 'value') {
            this._lastValueKey = ctx.key
            this.columnSuggestions = getColumnSuggestionsForValue(this.columns, ctx.value || '', ctx.key || '')
        }

        // Parameter autocomplete short-circuit: when value starts with `$`, show
        // parameter suggestions regardless of column async state.
        if (ctx && ctx.expecting === 'value' && ctx.value && ctx.value.startsWith('$')) {
            const prefix = ctx.value.slice(1).toLowerCase()
            const paramSuggestions = (this.parameters || [])
                .filter((n) => !prefix || n.toLowerCase().startsWith(prefix))
                .map((n) => ({
                    label: '$' + n,
                    insertText: '$' + n,
                    type: 'value',
                    detail: 'parameter',
                }))
            this.valueSuggestions = paramSuggestions
            this.valueMessage = paramSuggestions.length === 0 ? 'No matching parameters' : ''
            this.suggestionType = 'value'
            this.incomplete = false
            this.isLoading = false
            if (this.onLoadingChange) this.onLoadingChange(false)
            this.suggestions = this.activeTab === 'values' ? this.valueSuggestions : this.columnSuggestions
            this.message = this.activeTab === 'values' ? this.valueMessage : ''
            this.state.selectedIndex = 0
            return ctx
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
            this.valueSuggestions = prepareSuggestionValues(this._valueState.items, ctx.quoteChar, ctx.value)
            this.suggestions = this.activeTab === 'values' ? this.valueSuggestions : this.columnSuggestions
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
                this.registry,
                this.parameters,
            )

            if (seq !== this._suggestionSeq) return ctx

            this._valueState = {
                key: ctx.key,
                value: ctx.value,
                items: result.rawItems || this._valueState.items,
                incomplete: result.incomplete,
            }
            this.valueSuggestions = result.suggestions
            this.valueMessage = result.suggestions.length === 0 ? 'No matching values' : result.message
            this.suggestionType = result.suggestionType
            this.incomplete = result.incomplete || false
            if (this.activeTab === 'values') {
                this.suggestions = this.valueSuggestions
                this.message = this.valueMessage
            }

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
                this.registry,
                this.parameters,
            )

            if (seq !== this._suggestionSeq) return ctx

            this._valueState = {
                key: ctx.key,
                value: ctx.value,
                items: result.rawItems || [],
                incomplete: result.incomplete,
            }
            this.valueSuggestions = result.suggestions
            this.valueMessage = result.suggestions.length === 0 ? 'No matching values' : result.message
            this.suggestionType = result.suggestionType
            this.incomplete = result.incomplete || false
            if (this.activeTab === 'values') {
                this.suggestions = this.valueSuggestions
                this.message = this.valueMessage
            }

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
            this.registry,
        )

        if (seq !== this._suggestionSeq) return ctx

        if (ctx && ctx.expecting === 'value') {
            this.valueSuggestions = result.suggestions
            this.valueMessage = result.suggestions.length === 0 && !result.message ? 'No suggestions' : result.message
            this.suggestions = this.activeTab === 'values' ? this.valueSuggestions : this.columnSuggestions
            this.message = this.activeTab === 'values' ? this.valueMessage : ''
        } else {
            this.suggestions = result.suggestions
            this.message = result.message
        }
        this.suggestionType = result.suggestionType
        this.incomplete = result.incomplete || false
        this.messageIsError = result.messageIsError || false
        this.state.selectedIndex = 0

        return ctx
    }

    /**
     * Generate highlight tokens as HTML string.
     *
     * Backed by the canonical `tokenize()` primitive from the core flyql
     * package (query mode). Tokens are wrapped in `<span class="flyql-*">`
     * via `CHAR_TYPE_CLASS`. The parser's trailing-error-tail is emitted as
     * a `flyqlError` token by `tokenize()` itself and rendered as a
     * `flyql-error` span through the class map.
     *
     * When diagnostics are provided, each token is subdivided at per-character
     * granularity: any position where `diagMap[i]` or `highlightSet.has(i)`
     * changes produces a span boundary, so diagnostic underlines and hover
     * highlights align exactly with the affected characters and never expand
     * to the whole token. Newlines (`\n`/`\r`) also force a span boundary so
     * multi-line rendering stays visually coherent when the raw string flows
     * through the DOM.
     *
     * Accepts an optional `query` argument to avoid mutating engine state.
     *
     * @param {string} [query] - expression to highlight (defaults to `state.query`)
     * @param {Array<Diagnostic>} [diagnostics=null]
     * @param {number} [highlightDiagIndex=-1] - index of a diagnostic to mark
     *   with `flyql-diagnostic--highlight` (typically the hovered one)
     * @returns {string} HTML string
     */
    getHighlightTokens(query, diagnostics = null, highlightDiagIndex = -1) {
        const value = query !== undefined ? query : this.state.query
        if (!value) return ''

        const normalized = normalizeForParser(value)
        let tokens
        try {
            tokens = tokenize(normalized)
        } catch (err) {
            // tokenize() is designed not to throw — the parser runs with
            // raiseError=false and a trailing ERROR token is appended for
            // unconsumed input. If we ever land here it means a future
            // tokenize regression, so surface it rather than silently
            // falling back to plain text.
            // eslint-disable-next-line no-console
            console.warn('flyql: tokenize() threw inside getHighlightTokens', err)
            return escapeHtml(value)
        }
        if (!tokens || tokens.length === 0) {
            return escapeHtml(value)
        }

        // Build per-character diagnostic map: diagMap[i] is the first
        // diagnostic covering position i (earlier diagnostics win on overlap).
        // Stored as { diag, index } so the inner loop can compare by index
        // instead of object identity — each diagMap slot is a distinct object
        // even when the underlying diagnostic is the same.
        let diagMap = null
        let highlightSet = null
        if (diagnostics && diagnostics.length > 0) {
            diagMap = new Array(value.length).fill(null)
            for (let di = 0; di < diagnostics.length; di++) {
                const d = diagnostics[di]
                for (let j = d.range.start; j < d.range.end && j < value.length; j++) {
                    if (!diagMap[j]) {
                        diagMap[j] = { diag: d, index: di }
                    }
                }
            }
            // Separate highlight set for the hover-highlighted diagnostic so
            // it can layer independently of the persistent diagnostic state.
            if (highlightDiagIndex >= 0 && highlightDiagIndex < diagnostics.length) {
                highlightSet = new Set()
                const hd = diagnostics[highlightDiagIndex]
                for (let j = hd.range.start; j < hd.range.end && j < value.length; j++) {
                    highlightSet.add(j)
                }
            }
        }

        const diagIndexAt = (i) => {
            if (!diagMap || i < 0 || i >= value.length) return -1
            const entry = diagMap[i]
            return entry ? entry.index : -1
        }

        const emitSegment = (tokenType, segText, segDiag, segHighlight) => {
            const inner = wrapSpan(tokenType, segText)
            if (segDiag || segHighlight) {
                const classes = ['flyql-diagnostic']
                if (segDiag) {
                    classes.push('flyql-diagnostic--' + (segDiag.diag.severity === 'warning' ? 'warning' : 'error'))
                }
                if (segHighlight) {
                    classes.push('flyql-diagnostic--highlight')
                }
                const title = segDiag ? ` title="${escapeHtml(segDiag.diag.message)}"` : ''
                return `<span class="${classes.join(' ')}"${title}>${inner}</span>`
            }
            return inner
        }

        let html = ''
        let lastEnd = 0
        // Defensive: tokens from tokenize() should be contiguous and sorted,
        // but don't drop characters if a future regression breaks that.
        // Clamp overlapping tokens forward and emit any leading/interior gap
        // as a best-effort raw-text span so the rendered length always equals
        // the input length.
        for (const token of tokens) {
            let start = token.start
            const end = token.end
            if (end <= start) continue
            if (start > lastEnd) {
                // Gap: emit the missing characters as unstyled text so they
                // stay visible even if tokenize misbehaves.
                html += escapeHtml(value.substring(lastEnd, start))
            } else if (start < lastEnd) {
                // Overlap: clamp start forward to preserve the invariant.
                start = lastEnd
                if (start >= end) continue
            }
            lastEnd = end

            let segStart = start
            let segDiag = diagMap ? diagMap[start] : null
            let segDiagIdx = diagIndexAt(start)
            let segHighlight = highlightSet ? highlightSet.has(start) : false

            for (let i = start + 1; i <= end; i++) {
                const atEnd = i === end
                const curDiagIdx = atEnd ? -1 : diagIndexAt(i)
                const curHighlight = !atEnd && highlightSet ? highlightSet.has(i) : false
                const prevIsNewline = value[i - 1] === '\n' || value[i - 1] === '\r'
                const curIsNewline = !atEnd && (value[i] === '\n' || value[i] === '\r')
                const diagChanged = curDiagIdx !== segDiagIdx
                const highlightChanged = curHighlight !== segHighlight

                if (atEnd || diagChanged || highlightChanged || prevIsNewline || curIsNewline) {
                    const segText = value.substring(segStart, i)
                    html += emitSegment(token.type, segText, segDiag, segHighlight)
                    if (atEnd) break
                    segStart = i
                    segDiag = curDiagIdx >= 0 ? diagMap[i] : null
                    segDiagIdx = curDiagIdx
                    segHighlight = curHighlight
                }
            }
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
