/**
 * ColumnsEngine — framework-agnostic columns expression editor logic.
 * Pure JS class, no Vue/React/DOM dependencies.
 * Uses the columns parser (flyql/columns) instead of the core query parser.
 * One instance per columns editor component.
 */

import {
    Parser,
    parse as parseColumns,
    diagnose,
    CharType,
    State,
    TRANSFORMER_OPERATOR,
    COLUMNS_DELIMITER,
} from 'flyql/columns'
import { defaultRegistry } from 'flyql/transformers'
import { defaultRegistry as defaultRendererRegistryFn } from 'flyql/renderers'
import { EditorState } from './state.js'
import { getNestedColumnSuggestions, resolveColumnDef, getKeyDiscoverySuggestions } from './suggestions.js'
import { Column, ColumnSchema, Diagnostic, Range, CODE_UNKNOWN_COLUMN, CODE_UNKNOWN_TRANSFORMER } from 'flyql/core'
import { Type } from 'flyql'

/** Maps editor-input raw-type strings to canonical flyql.Type. */
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
    // Calendar day (Y/M/D) — ClickHouse Date / Date32.
    date: Type.Date,
    date32: Type.Date,
    // Instant-in-time — ClickHouse DateTime / DateTime64,
    // PostgreSQL timestamp / timestamptz, year.
    datetime: Type.DateTime,
    datetime64: Type.DateTime,
    timestamp: Type.DateTime,
    timestamptz: Type.DateTime,
}

const _FLYQL_TYPE_VALUES = new Set(Object.values(Type))

function _applyEditorTypeNormalization(col) {
    if (col.type && !_FLYQL_TYPE_VALUES.has(col.type)) {
        // Preserve the user-provided type string for display (shown in
        // suggestion detail column). `col.type` is then normalized to a
        // canonical flyql.Type for internal engine/validator consumption.
        if (col.rawType === undefined) col.rawType = col.type
        const mapped = EDITOR_TYPE_TO_FLYQL[col.type]
        col.type = mapped !== undefined ? mapped : Type.Unknown
    }
    if (col.children) {
        for (const child of Object.values(col.children)) {
            if (child) _applyEditorTypeNormalization(child)
        }
    }
}

const COL_CHAR_TYPE_CLASS = {
    [CharType.COLUMN]: 'flyql-col-column',
    [CharType.OPERATOR]: 'flyql-col-operator',
    [CharType.TRANSFORMER]: 'flyql-col-transformer',
    [CharType.ARGUMENT]: 'flyql-col-argument',
    [CharType.ALIAS]: 'flyql-col-alias',
    [CharType.ERROR]: 'flyql-col-error',
    [CharType.RENDERER]: 'flyql-col-renderer',
    [CharType.RENDERER_ARGUMENT]: 'flyql-col-renderer-argument',
    [CharType.RENDERER_PIPE]: 'flyql-col-renderer-pipe',
}

const STATE_LABELS = {
    column: 'column name',
    transformer: 'transformers',
    renderer: 'renderers',
    delimiter: 'next',
    alias: 'next',
    argument: 'arguments',
    next: 'column name, separator or transformer',
    none: '',
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
}

function wrapDots(escaped) {
    // escaped is already HTML-safe; dots in escaped text map 1:1 to dots in label.
    return escaped.replace(/\./g, '<span class="flyql-path-dot">.</span>')
}

// Column expression tokens that can be dotted identifier paths.
const DOT_PATH_COL_CHAR_TYPES = new Set([CharType.COLUMN])

function wrapSpan(charType, text) {
    const escaped = escapeHtml(text)
    const content = DOT_PATH_COL_CHAR_TYPES.has(charType) ? wrapDots(escaped) : escaped
    const cls = COL_CHAR_TYPE_CLASS[charType]
    if (cls) {
        return `<span class="${cls}">${content}</span>`
    }
    return content
}

/**
 * Walk backward in `text` from position `segmentStart` to find the dotted
 * identifier path that precedes a diagnostic segment (i.e., the parent path
 * for an unknown-column nested diagnostic). Returns `null` if the segment is
 * not preceded by a dot.
 */
function extractParentPathFromText(text, segmentStart) {
    if (segmentStart <= 0 || text[segmentStart - 1] !== '.') return null
    let start = segmentStart - 1
    while (start > 0) {
        const c = text[start - 1]
        if (/[A-Za-z0-9_.]/.test(c)) start--
        else break
    }
    return text.substring(start, segmentStart - 1)
}

export class ColumnsEngine {
    constructor(schema, options = {}) {
        this.columns = schema || new ColumnSchema({})
        for (const col of Object.values(this.columns.columns)) {
            if (col) _applyEditorTypeNormalization(col)
        }
        this.rendererRegistry = options.rendererRegistry || null
        const capDefaults = { transformers: true, renderers: this.rendererRegistry !== null }
        this.capabilities = options.capabilities ? { ...capDefaults, ...options.capabilities } : { ...capDefaults }
        // Opt-in: if no renderer registry was supplied, the parser rejects
        // post-alias '|' with errno 11 (Decision 19). If the dev explicitly
        // set capabilities.renderers=true without supplying a registry, we
        // still honor their opt-in — they'll get unknown_renderer diagnostics
        // but won't be blocked at parser level.
        if (this.rendererRegistry === null && options.capabilities && options.capabilities.renderers !== true) {
            this.capabilities.renderers = false
        }
        this.onKeyDiscovery = options.onKeyDiscovery || null
        this.onLoadingChange = options.onLoadingChange || null
        this.registry = options.registry || defaultRegistry()
        this.keyCache = {}
        this.state = new EditorState()
        this.context = null
        this.suggestions = []
        this.suggestionType = ''
        this.message = ''
        this.isLoading = false
        this.diagnostics = []
        this._seq = 0
    }

    setColumns(schema) {
        this.columns = schema || new ColumnSchema({})
        for (const col of Object.values(this.columns.columns)) {
            if (col) _applyEditorTypeNormalization(col)
        }
    }

    setRegistry(registry) {
        this.registry = registry || defaultRegistry()
    }

    setRendererRegistry(registry) {
        this.rendererRegistry = registry || null
        this.capabilities.renderers = this.rendererRegistry !== null
    }

    _transformerDetail(name) {
        const t = this.registry.get(name)
        if (!t) return ''
        const schema = t.argSchema
        if (!schema || schema.length === 0) return `${t.inputType} → ${t.outputType}`
        const parts = schema.map((a) => (a.optional ? a.type + '?' : a.type))
        return '(' + parts.join(', ') + ') ' + t.inputType + ' → ' + t.outputType
    }

    _rendererDetail(name) {
        if (!this.rendererRegistry) return ''
        const r = this.rendererRegistry.get(name)
        if (!r) return ''
        const schema = r.argSchema
        if (!schema || schema.length === 0) return ''
        const parts = schema.map((a) => (a.required === false ? a.type + '?' : a.type))
        return '(' + parts.join(', ') + ')'
    }

    setQuery(text) {
        this.state.setQuery(text)
    }

    setCursorPosition(pos) {
        this.state.setCursorPosition(pos)
    }

    /**
     * Build context from text before cursor — determines what the editor expects next.
     */
    buildContext(textBeforeCursor, fullText) {
        if (!textBeforeCursor) {
            return {
                expecting: 'column',
                column: '',
                transformer: '',
                state: State.EXPECT_COLUMN,
                textBeforeCursor: '',
                existingColumns: [],
            }
        }

        const parser = new Parser(this.capabilities)
        try {
            parser.parse(textBeforeCursor, false, true)
        } catch (e) {
            return {
                expecting: 'error',
                column: '',
                transformer: '',
                state: State.ERROR,
                error: e.message || 'Parse error',
                textBeforeCursor,
                existingColumns: parser.columns ? parser.columns.map((c) => c.name) : [],
            }
        }

        if (parser.state === State.ERROR) {
            return {
                expecting: 'error',
                column: '',
                transformer: '',
                state: State.ERROR,
                error: parser.errorText || 'Parse error',
                textBeforeCursor,
                existingColumns: parser.columns ? parser.columns.map((c) => c.name) : [],
            }
        }

        const existingColumns = parser.columns ? parser.columns.map((c) => c.name) : []

        const ctx = {
            state: parser.state,
            column: parser.column || '',
            transformer: parser.transformer || '',
            expecting: 'none',
            textBeforeCursor,
            existingColumns,
        }

        if (parser.state === State.EXPECT_COLUMN || parser.state === State.COLUMN) {
            ctx.expecting = 'column'
        } else if (parser.state === State.EXPECT_TRANSFORMER || parser.state === State.TRANSFORMER) {
            ctx.expecting = 'transformer'
        } else if (parser.state === State.EXPECT_RENDERER || parser.state === State.RENDERER) {
            ctx.expecting = 'renderer'
            ctx.renderer = parser.renderer || ''
        } else if (
            parser.state === State.EXPECT_ALIAS ||
            parser.state === State.EXPECT_ALIAS_OPERATOR ||
            parser.state === State.EXPECT_ALIAS_DELIMITER
        ) {
            ctx.expecting = 'alias'
        } else if (
            parser.state === State.TRANSFORMER_ARGUMENT ||
            parser.state === State.EXPECT_TRANSFORMER_ARGUMENT ||
            parser.state === State.TRANSFORMER_ARGUMENT_DOUBLE_QUOTED ||
            parser.state === State.TRANSFORMER_ARGUMENT_SINGLE_QUOTED ||
            parser.state === State.EXPECT_TRANSFORMER_ARGUMENT_DELIMITER
        ) {
            // Peek at char after cursor: if it's ) and parser is between args
            // (waiting for comma or close), user is done — show next steps.
            // But NOT when actively typing an argument or in empty parens.
            const charAtCursor = fullText ? fullText[textBeforeCursor.length] : undefined
            if (charAtCursor === ')' && parser.state === State.EXPECT_TRANSFORMER_ARGUMENT_DELIMITER) {
                ctx.expecting = 'next'
            } else {
                ctx.expecting = 'argument'
            }
        } else if (parser.state === State.TRANSFORMER_COMPLETE) {
            ctx.expecting = 'next'
        }

        return ctx
    }

    /**
     * Update suggestions based on current cursor position.
     */
    async updateSuggestions() {
        const seq = ++this._seq
        const textBeforeCursor = this.state.getTextBeforeCursor()
        const ctx = this.buildContext(textBeforeCursor, this.state.query)
        this.context = ctx
        this.message = ''
        this.isLoading = false
        this.suggestions = []
        this.suggestionType = ''
        this.state.selectedIndex = 0

        if (ctx.expecting === 'column') {
            const prefix = ctx.column.toLowerCase()
            const existing = ctx.existingColumns

            // Nested column path — delegate to shared helper
            if (prefix.includes('.')) {
                // Check if it's an exact leaf match — show next-step actions
                const resolvedCol = resolveColumnDef(this.columns, ctx.column)
                if (resolvedCol && !resolvedCol.children) {
                    const nextSteps = [
                        {
                            label: COLUMNS_DELIMITER,
                            insertText: COLUMNS_DELIMITER + ' ',
                            type: 'delimiter',
                            detail: 'next column',
                        },
                    ]
                    if (this.capabilities.transformers) {
                        nextSteps.push({
                            label: TRANSFORMER_OPERATOR,
                            insertText: TRANSFORMER_OPERATOR,
                            type: 'delimiter',
                            detail: 'add transformer',
                        })
                    }
                    const nested = getNestedColumnSuggestions(this.columns, ctx.column).filter(
                        (s) => !existing.includes(s.label) && s.label.toLowerCase() !== prefix,
                    )
                    this.suggestions = [...nextSteps, ...nested]
                    this.suggestionType = 'column'
                    return { ctx, seq }
                }

                const nested = getNestedColumnSuggestions(this.columns, ctx.column)
                if (nested.length === 0) {
                    // Try remote key discovery for schemaless object columns
                    const discovered = await getKeyDiscoverySuggestions(
                        this.columns,
                        ctx.column,
                        this.onKeyDiscovery,
                        this.keyCache,
                        (loading) => {
                            if (this.isStale(seq)) return
                            this.isLoading = loading
                            if (this.onLoadingChange) this.onLoadingChange(loading)
                        },
                    )
                    if (this.isStale(seq)) return { ctx, seq }
                    this.suggestions = discovered.filter((s) => !existing.includes(s.label))
                    this.suggestionType = 'column'
                    if (this.suggestions.length === 0 && prefix) {
                        this.message = 'No matching columns'
                    }
                    return { ctx, seq }
                }
                this.suggestions = nested.filter((s) => !existing.includes(s.label))
                this.suggestionType = 'column'
                if (this.suggestions.length === 0 && prefix) {
                    this.message = 'No matching columns'
                }
                return { ctx, seq }
            }

            const columnSuggestions = []
            let hasExactMatch = false
            for (const [name, def] of Object.entries(this.columns.columns)) {
                if (!def || def.suggest === false) continue
                if (existing.includes(name)) continue
                if (prefix && !name.toLowerCase().startsWith(prefix)) continue
                if (prefix && name.toLowerCase() === prefix) hasExactMatch = true
                const hasChildren = !!def.children
                columnSuggestions.push({
                    label: name,
                    insertText: hasChildren ? name + '.' : name,
                    type: 'column',
                    detail: def.rawType || def.type || '',
                })
            }

            if (hasExactMatch && prefix) {
                // Exact match — check if it has children (object/map column)
                const matchedDef = resolveColumnDef(this.columns, ctx.column)
                if (matchedDef && matchedDef.children && Object.keys(matchedDef.children).length > 0) {
                    // Object column with children — show nested paths
                    const nested = getNestedColumnSuggestions(this.columns, ctx.column + '.')
                    this.suggestions = nested.filter((s) => !existing.includes(s.label))
                    this.suggestionType = 'column'
                    return { ctx, seq }
                }

                // Leaf column — show next-step actions first, then remaining columns
                const nextSteps = [
                    {
                        label: COLUMNS_DELIMITER,
                        insertText: COLUMNS_DELIMITER + ' ',
                        type: 'delimiter',
                        detail: 'next column',
                    },
                ]
                if (this.capabilities.transformers) {
                    nextSteps.push({
                        label: TRANSFORMER_OPERATOR,
                        insertText: TRANSFORMER_OPERATOR,
                        type: 'transformer',
                        detail: 'transformer (pipe)',
                    })
                }
                const otherColumns = columnSuggestions.filter((s) => s.label.toLowerCase() !== prefix)
                this.suggestions = [...otherColumns, ...nextSteps]
                this.suggestionType = 'next'
            } else {
                this.suggestions = columnSuggestions
                this.suggestionType = 'column'
                if (columnSuggestions.length === 0 && prefix) {
                    this.message = 'No matching columns'
                }
            }
        } else if (ctx.expecting === 'transformer') {
            if (!this.capabilities.transformers) {
                this.message = 'transformers are not enabled'
                this.suggestionType = ''
                return { ctx, seq }
            }
            const prefix = ctx.transformer.toLowerCase()
            const names = this.registry.names()
            const hasExactMatch = prefix && names.some((m) => m.toLowerCase() === prefix)

            if (hasExactMatch) {
                const matchedName = names.find((m) => m.toLowerCase() === prefix)
                const t = matchedName ? this.registry.get(matchedName) : null
                const hasArgs = t && t.argSchema && t.argSchema.length > 0
                const nextSteps = [
                    {
                        label: COLUMNS_DELIMITER,
                        insertText: COLUMNS_DELIMITER + ' ',
                        type: 'delimiter',
                        detail: 'next column',
                    },
                ]
                if (hasArgs) {
                    nextSteps.push({
                        label: '()',
                        insertText: '()',
                        type: 'delimiter',
                        detail: this._transformerDetail(prefix),
                        cursorOffset: -1,
                    })
                }
                nextSteps.push({
                    label: TRANSFORMER_OPERATOR,
                    insertText: TRANSFORMER_OPERATOR,
                    type: 'transformer',
                    detail: 'transformer (pipe)',
                })
                const otherMods = []
                for (const mod of names) {
                    if (mod.toLowerCase() === prefix) continue
                    if (!mod.toLowerCase().startsWith(prefix)) continue
                    otherMods.push({
                        label: mod,
                        insertText: mod,
                        type: 'transformer',
                        detail: this._transformerDetail(mod),
                    })
                }
                this.suggestions = [...otherMods, ...nextSteps]
                this.suggestionType = 'next'
            } else {
                const suggestions = []
                for (const mod of names) {
                    if (prefix && !mod.toLowerCase().startsWith(prefix)) continue
                    suggestions.push({
                        label: mod,
                        insertText: mod,
                        type: 'transformer',
                        detail: this._transformerDetail(mod),
                    })
                }
                this.suggestions = suggestions
                this.suggestionType = 'transformer'
                if (suggestions.length === 0 && prefix) {
                    this.message = 'No matching transformers'
                }
            }
        } else if (ctx.expecting === 'renderer') {
            if (!this.rendererRegistry) {
                this.message = 'renderers are not enabled'
                this.suggestionType = ''
                return { ctx, seq }
            }
            const prefix = (ctx.renderer || '').toLowerCase()
            const names = this.rendererRegistry.names()
            const suggestions = []
            for (const n of names) {
                if (prefix && !n.toLowerCase().startsWith(prefix)) continue
                suggestions.push({
                    label: n,
                    insertText: n,
                    type: 'renderer',
                    detail: this._rendererDetail(n),
                })
            }
            this.suggestions = suggestions
            this.suggestionType = 'renderer'
            if (suggestions.length === 0 && prefix) {
                this.message = 'No matching renderers'
            }
        } else if (ctx.expecting === 'alias') {
            if (ctx.state === State.EXPECT_ALIAS) {
                // Inside alias value (e.g. "column as RC") — only separator is valid
                this.suggestions = [
                    {
                        label: COLUMNS_DELIMITER,
                        insertText: COLUMNS_DELIMITER + ' ',
                        type: 'delimiter',
                        detail: 'next column',
                    },
                ]
            } else {
                // After column/transformer+space, before alias operator — pipe and comma are valid
                const items = []
                if (this.capabilities.transformers) {
                    items.push({
                        label: TRANSFORMER_OPERATOR,
                        insertText: TRANSFORMER_OPERATOR,
                        type: 'transformer',
                        detail: 'transformer (pipe)',
                    })
                }
                items.push({
                    label: COLUMNS_DELIMITER,
                    insertText: COLUMNS_DELIMITER + ' ',
                    type: 'delimiter',
                    detail: 'next column',
                })
                this.suggestions = items
            }
            this.suggestionType = 'delimiter'
        } else if (ctx.expecting === 'next') {
            // After transformer with args completes — suggest comma or pipe
            const items = [
                {
                    label: COLUMNS_DELIMITER,
                    insertText: COLUMNS_DELIMITER + ' ',
                    type: 'delimiter',
                    detail: 'next column',
                },
            ]
            if (this.capabilities.transformers) {
                items.push({
                    label: TRANSFORMER_OPERATOR,
                    insertText: TRANSFORMER_OPERATOR,
                    type: 'transformer',
                    detail: 'transformer (pipe)',
                })
            }
            this.suggestions = items
            this.suggestionType = 'delimiter'
        } else if (ctx.expecting === 'error') {
            this.message = ctx.error
            this.suggestionType = ''
        }

        return { ctx, seq }
    }

    isStale(seq) {
        return seq !== this._seq
    }

    /**
     * Generate highlight tokens as HTML string.
     */
    getHighlightTokens(query, diagnostics = null, highlightDiagIndex = -1) {
        const value = query !== undefined ? query : this.state.query
        if (!value) return ''

        const parser = new Parser(this.capabilities)
        try {
            parser.parse(value, false, true)
        } catch {
            return escapeHtml(value)
        }

        const typedChars = parser.typedChars
        if (!typedChars || typedChars.length === 0) {
            return escapeHtml(value)
        }

        // Build per-position diagnostic map
        let diagMap = null
        let highlightSet = null
        if (diagnostics && diagnostics.length > 0) {
            diagMap = {}
            for (let di = 0; di < diagnostics.length; di++) {
                const d = diagnostics[di]
                for (let j = d.range.start; j < d.range.end && j < value.length; j++) {
                    if (!diagMap[j]) {
                        diagMap[j] = { diag: d, index: di }
                    }
                }
            }
            if (highlightDiagIndex >= 0 && highlightDiagIndex < diagnostics.length) {
                highlightSet = new Set()
                const hd = diagnostics[highlightDiagIndex]
                for (let j = hd.range.start; j < hd.range.end && j < value.length; j++) {
                    highlightSet.add(j)
                }
            }
        }

        // Build highlight using char positions — columns parser skips spaces
        // in some states, so typedChars count != value length. Use pos to align.
        let html = ''
        let currentType = null
        let currentText = ''
        let currentDiag = null
        let currentHighlight = false
        let lastPos = -1

        const flushSpan = () => {
            if (!currentText) return
            const inner = wrapSpan(currentType, currentText)
            if (currentDiag || currentHighlight) {
                const classes = ['flyql-diagnostic']
                if (currentDiag) {
                    classes.push('flyql-diagnostic--' + (currentDiag.diag.severity === 'warning' ? 'warning' : 'error'))
                }
                if (currentHighlight) {
                    classes.push('flyql-diagnostic--highlight')
                }
                const title = currentDiag ? ` title="${escapeHtml(currentDiag.diag.message)}"` : ''
                html += `<span class="${classes.join(' ')}"${title}>${inner}</span>`
            } else {
                html += inner
            }
        }

        for (let i = 0; i < typedChars.length; i++) {
            const char = typedChars[i][0]
            const charType = typedChars[i][1]
            const pos = char.pos

            // Fill any gap (untracked chars like spaces) as plain text
            if (pos > lastPos + 1) {
                flushSpan()
                currentText = ''
                currentType = null
                currentDiag = null
                currentHighlight = false
                // Render gap characters with diagnostic overlay
                for (let gapPos = lastPos + 1; gapPos < pos; gapPos++) {
                    const gapDiag = diagMap ? diagMap[gapPos] || null : null
                    const gapHighlight = highlightSet ? highlightSet.has(gapPos) : false
                    const gapCh = value[gapPos]
                    if (gapDiag || gapHighlight) {
                        const classes = ['flyql-diagnostic']
                        if (gapDiag)
                            classes.push(
                                'flyql-diagnostic--' + (gapDiag.diag.severity === 'warning' ? 'warning' : 'error'),
                            )
                        if (gapHighlight) classes.push('flyql-diagnostic--highlight')
                        const title = gapDiag ? ` title="${escapeHtml(gapDiag.diag.message)}"` : ''
                        html += `<span class="${classes.join(' ')}"${title}>${escapeHtml(gapCh)}</span>`
                    } else {
                        html += escapeHtml(gapCh)
                    }
                }
            }

            const ch = value[pos] !== undefined ? value[pos] : char.value
            const newDiag = diagMap ? diagMap[pos] || null : null
            const newHighlight = highlightSet ? highlightSet.has(pos) : false
            if (
                charType === currentType &&
                newDiag === currentDiag &&
                newHighlight === currentHighlight &&
                ch !== '\n'
            ) {
                currentText += ch
            } else {
                flushSpan()
                currentType = charType
                currentDiag = newDiag
                currentHighlight = newHighlight
                currentText = ch
            }
            lastPos = pos
        }
        flushSpan()

        // Render any remaining untracked characters after last typed char
        if (lastPos + 1 < value.length && parser.state !== State.ERROR) {
            html += escapeHtml(value.substring(lastPos + 1))
        }

        if (parser.state === State.ERROR && lastPos + 1 < value.length) {
            const remaining = value.substring(lastPos + 1)
            html += `<span class="flyql-col-error">${escapeHtml(remaining)}</span>`
        }

        return html
    }

    /**
     * Parse the full expression and return ParsedColumn array.
     */
    getParsedColumns() {
        const value = this.state.query
        if (!value) return []
        try {
            return parseColumns(value, this.capabilities)
        } catch {
            return []
        }
    }

    /**
     * Validate the expression and return status.
     */
    getQueryStatus() {
        const value = this.state.query
        if (!value) return { valid: true, message: 'Empty' }
        const parser = new Parser(this.capabilities)
        try {
            parser.parse(value, false, false)
        } catch (e) {
            return { valid: false, message: e.message || 'Parse error' }
        }
        if (parser.state === State.ERROR) {
            return { valid: false, message: parser.errorText || 'Parse error' }
        }
        if (
            parser.state === State.COLUMN ||
            parser.state === State.EXPECT_COLUMN ||
            parser.state === State.EXPECT_ALIAS_OPERATOR ||
            parser.state === State.EXPECT_ALIAS ||
            parser.state === State.TRANSFORMER ||
            parser.state === State.TRANSFORMER_COMPLETE
        ) {
            return { valid: true, message: 'Valid columns expression' }
        }
        return { valid: false, message: 'Incomplete expression' }
    }

    _buildValidatorColumns() {
        return this.columns
    }

    getDiagnostics() {
        const value = this.state.query
        if (!value) {
            this.diagnostics = []
            return this.diagnostics
        }

        const parser = new Parser(this.capabilities)
        let typedChars
        try {
            parser.parse(value, false, false)
            typedChars = parser.typedChars
        } catch (e) {
            typedChars = parser.typedChars
            const start = typedChars && typedChars.length > 0 ? typedChars[typedChars.length - 1][0].pos + 1 : 0
            // Suppress syntax errors at end of input
            if (start >= value.length - 1) {
                this.diagnostics = []
                return this.diagnostics
            }
            this.diagnostics = [
                new Diagnostic(new Range(start, value.length), e.message || 'Parse error', 'error', 'syntax'),
            ]
            return this.diagnostics
        }

        if (parser.state === State.ERROR) {
            const start = typedChars && typedChars.length > 0 ? typedChars[typedChars.length - 1][0].pos + 1 : 0
            if (start >= value.length - 1) {
                this.diagnostics = []
                return this.diagnostics
            }
            this.diagnostics = [
                new Diagnostic(new Range(start, value.length), parser.errorText || 'Parse error', 'error', 'syntax'),
            ]
            return this.diagnostics
        }

        let parsedColumns
        try {
            parsedColumns = parseColumns(value, this.capabilities)
        } catch {
            this.diagnostics = []
            return this.diagnostics
        }

        if (!parsedColumns || parsedColumns.length === 0) {
            this.diagnostics = []
            return this.diagnostics
        }

        const validatorColumns = this._buildValidatorColumns()
        const reg = this.registry
        const rReg = this.rendererRegistry

        try {
            this.diagnostics = diagnose(parsedColumns, validatorColumns, reg, rReg)
        } catch {
            this.diagnostics = []
        }

        // Smart suppression at end of input
        if (this.diagnostics.length > 0) {
            const queryLen = value.trimEnd().length
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
                    if (columnNames.some((n) => n.startsWith(partial) && n !== partial)) return false
                    const parentPath = extractParentPathFromText(value, d.range.start)
                    if (parentPath) {
                        const parentSegments = parentPath.toLowerCase().split('.')
                        let cur = this.columns.columns
                        let reached = true
                        for (const seg of parentSegments) {
                            const keys = Object.keys(cur)
                            const k = keys.find((kk) => kk.toLowerCase() === seg)
                            if (!k || !cur[k] || !cur[k].children) {
                                reached = false
                                break
                            }
                            cur = cur[k].children
                        }
                        if (reached) {
                            const childNames = Object.keys(cur).map((n) => n.toLowerCase())
                            if (childNames.some((n) => n.startsWith(partial) && n !== partial)) return false
                        }
                    }
                    return true
                }
                return true
            })
        }

        return this.diagnostics
    }

    getParseError() {
        if (this.context && this.context.expecting === 'error') {
            return this.context.error
        }
        return null
    }

    /**
     * Get the text range to replace when accepting a suggestion.
     * If suggestion is an operator type, insert at cursor without replacing prefix.
     */
    getInsertRange(ctx, fullText, suggestion) {
        const context = ctx || this.context
        if (!context) return { start: 0, end: 0 }

        const cursor = context.textBeforeCursor.length

        // Calculate end position: include trailing word chars after cursor
        let endPos = cursor
        if (fullText) {
            const afterCursor = fullText.substring(cursor)
            const trailingMatch = afterCursor.match(/^[^\s,|()]+/)
            if (trailingMatch) {
                endPos = cursor + trailingMatch[0].length
            }
        }

        // Delimiter and pipe suggestions insert at cursor, don't replace prefix
        if (suggestion && (suggestion.type === 'delimiter' || suggestion.label === '|' || suggestion.label === '()')) {
            return { start: cursor, end: cursor }
        }

        if (context.expecting === 'column') {
            const prefix = context.column || ''
            return { start: cursor - prefix.length, end: endPos }
        }
        if (context.expecting === 'transformer') {
            const prefix = context.transformer || ''
            return { start: cursor - prefix.length, end: endPos }
        }
        return { start: cursor, end: endPos }
    }

    navigateUp() {
        if (this.suggestions.length === 0) return
        this.state.selectedIndex =
            this.state.selectedIndex <= 0 ? this.suggestions.length - 1 : this.state.selectedIndex - 1
    }

    navigateDown() {
        if (this.suggestions.length === 0) return
        this.state.selectedIndex =
            this.state.selectedIndex >= this.suggestions.length - 1 ? 0 : this.state.selectedIndex + 1
    }

    selectSuggestion(index) {
        return this.suggestions[index] || null
    }

    getStateLabel() {
        return STATE_LABELS[this.suggestionType] || ''
    }

    getFooterInfo() {
        if (!this.context) return null
        const col = this.context.column || ''
        if (!col) return null
        const def = resolveColumnDef(this.columns, col)
        if (!def) return null
        return { column: col, type: def.rawType || def.type || '' }
    }

    clearKeyCache() {
        this.keyCache = {}
    }

    /**
     * Info-box data for the current selection. Mirrors EditorEngine.getSelectedInfo.
     */
    getSelectedInfo() {
        if (!this.context) return null
        const selected = this.suggestions[this.state.selectedIndex]
        let targetKey = null
        if (selected && selected.type === 'column') {
            targetKey = selected.label
        } else if (this.context.column) {
            targetKey = this.context.column
        }
        if (!targetKey) return null
        const def = resolveColumnDef(this.columns, targetKey)
        const type = def ? def.rawType || def.type || '' : (selected && selected.detail) || ''
        return {
            label: targetKey,
            type,
            description: def && def.description ? def.description : '',
            hasChildren: def ? !!def.children : false,
        }
    }

    getFilterPrefix() {
        if (!this.context) return ''
        if (this.context.expecting === 'column') return this.context.column || ''
        if (this.context.expecting === 'transformer') return this.context.transformer || ''
        return ''
    }

    /**
     * Highlight the matching portion of a suggestion label.
     * When `originalLabel` is provided and `label` is a truncated form (leading
     * U+2026 ellipsis) of the original, and the user's typed prefix extends
     * into the kept suffix, the visible overlap is wrapped in
     * `.flyql-panel__match` so the user sees where their typed prefix ends up
     * inside the stripped label.
     */
    highlightMatch(label, originalLabel = null) {
        const prefix = this.getFilterPrefix()
        if (!prefix) return wrapDots(escapeHtml(label))
        const lowerLabel = label.toLowerCase()
        const lowerPrefix = prefix.toLowerCase()
        if (lowerLabel.startsWith(lowerPrefix)) {
            const matched = wrapDots(escapeHtml(label.substring(0, prefix.length)))
            const rest = wrapDots(escapeHtml(label.substring(prefix.length)))
            return `<span class="flyql-panel__match">${matched}</span>${rest}`
        }
        if (
            originalLabel &&
            label !== originalLabel &&
            label.startsWith('\u2026') &&
            originalLabel.toLowerCase().startsWith(lowerPrefix)
        ) {
            const kept = label.substring(1)
            const strippedLen = originalLabel.length - kept.length
            if (prefix.length > strippedLen) {
                const visibleMatchLen = Math.min(prefix.length - strippedLen, kept.length)
                const matched = wrapDots(escapeHtml(kept.substring(0, visibleMatchLen)))
                const rest = wrapDots(escapeHtml(kept.substring(visibleMatchLen)))
                return `\u2026<span class="flyql-panel__match">${matched}</span>${rest}`
            }
        }
        return wrapDots(escapeHtml(label))
    }
}
