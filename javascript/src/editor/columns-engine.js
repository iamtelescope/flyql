/**
 * ColumnsEngine — framework-agnostic columns expression editor logic.
 * Pure JS class, no Vue/React/DOM dependencies.
 * Uses the columns parser (flyql/columns) instead of the core query parser.
 * One instance per columns editor component.
 */

import { Parser } from '../columns/parser.js'
import { parse as parseColumns, diagnose } from '../columns/index.js'
import { State } from '../columns/state.js'
import { CharType, TRANSFORMER_OPERATOR, COLUMNS_DELIMITER } from '../columns/constants.js'
import { defaultRegistry } from '../transformers/index.js'
import { EditorState } from './state.js'
import { getNestedColumnSuggestions, resolveColumnDef, getKeyDiscoverySuggestions } from './suggestions.js'
import { Column } from '../core/column.js'
import { Diagnostic } from '../core/validator.js'
import { Range } from '../core/range.js'
import { TransformerType } from '../transformers/base.js'
import { CODE_UNKNOWN_COLUMN, CODE_UNKNOWN_TRANSFORMER } from '../core/validator.js'

const EDITOR_TYPE_TO_NORMALIZED = {
    enum: TransformerType.STRING,
    string: TransformerType.STRING,
    number: TransformerType.INT,
    float: TransformerType.FLOAT,
    boolean: TransformerType.BOOL,
    array: TransformerType.ARRAY,
}

const COL_CHAR_TYPE_CLASS = {
    [CharType.COLUMN]: 'flyql-col-column',
    [CharType.OPERATOR]: 'flyql-col-operator',
    [CharType.TRANSFORMER]: 'flyql-col-transformer',
    [CharType.ARGUMENT]: 'flyql-col-argument',
    [CharType.ALIAS]: 'flyql-col-alias',
    [CharType.ERROR]: 'flyql-col-error',
}

const STATE_LABELS = {
    column: 'column name',
    transformer: 'transformers',
    delimiter: 'next',
    alias: 'next',
    argument: 'arguments',
    next: 'column name, separator or transformer',
    none: '',
}

const _colRegistry = defaultRegistry()
const _colTransformerNames = _colRegistry.names()

function transformerDetail(name) {
    const t = _colRegistry.get(name)
    if (!t) return ''
    const schema = t.argSchema
    if (!schema || schema.length === 0) return `${t.inputType} → ${t.outputType}`
    const parts = schema.map((a) => (a.optional ? a.type + '?' : a.type))
    return '(' + parts.join(', ') + ') ' + t.inputType + ' → ' + t.outputType
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
}

function wrapSpan(charType, text) {
    const escaped = escapeHtml(text)
    const cls = COL_CHAR_TYPE_CLASS[charType]
    if (cls) {
        return `<span class="${cls}">${escaped}</span>`
    }
    return escaped
}

export class ColumnsEngine {
    constructor(columns, options = {}) {
        this.columns = columns || {}
        const capDefaults = { transformers: true }
        this.capabilities = options.capabilities ? { ...capDefaults, ...options.capabilities } : { ...capDefaults }
        this.onKeyDiscovery = options.onKeyDiscovery || null
        this.onLoadingChange = options.onLoadingChange || null
        this.registry = options.registry || null
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
            for (const [name, def] of Object.entries(this.columns)) {
                if (!def || def.suggest === false) continue
                if (existing.includes(name)) continue
                if (prefix && !name.toLowerCase().startsWith(prefix)) continue
                if (prefix && name.toLowerCase() === prefix) hasExactMatch = true
                const hasChildren = !!def.children
                columnSuggestions.push({
                    label: name,
                    insertText: hasChildren ? name + '.' : name,
                    type: 'column',
                    detail: def.type || '',
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
            const hasExactMatch = prefix && _colTransformerNames.some((m) => m.toLowerCase() === prefix)

            if (hasExactMatch) {
                // Exact transformer match — show next steps, then other matching transformers
                const matchedName = _colTransformerNames.find((m) => m.toLowerCase() === prefix)
                const t = matchedName ? _colRegistry.get(matchedName) : null
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
                        detail: transformerDetail(prefix),
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
                for (const mod of _colTransformerNames) {
                    if (mod.toLowerCase() === prefix) continue
                    if (!mod.toLowerCase().startsWith(prefix)) continue
                    otherMods.push({ label: mod, insertText: mod, type: 'transformer', detail: transformerDetail(mod) })
                }
                this.suggestions = [...otherMods, ...nextSteps]
                this.suggestionType = 'next'
            } else {
                const suggestions = []
                for (const mod of _colTransformerNames) {
                    if (prefix && !mod.toLowerCase().startsWith(prefix)) continue
                    suggestions.push({
                        label: mod,
                        insertText: mod,
                        type: 'transformer',
                        detail: transformerDetail(mod),
                    })
                }
                this.suggestions = suggestions
                this.suggestionType = 'transformer'
                if (suggestions.length === 0 && prefix) {
                    this.message = 'No matching transformers'
                }
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
        return Object.entries(this.columns).map(([name, def]) => {
            const d = def || {}
            const normalizedType = EDITOR_TYPE_TO_NORMALIZED[d.type] || d.type || null
            return new Column(name, false, d.type || '', normalizedType, { matchName: name })
        })
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
        const reg = this.registry || _colRegistry

        try {
            this.diagnostics = diagnose(parsedColumns, validatorColumns, reg)
        } catch {
            this.diagnostics = []
        }

        // Smart suppression at end of input
        if (this.diagnostics.length > 0) {
            const queryLen = value.trimEnd().length
            const transformerNames = reg.names()
            const columnNames = Object.keys(this.columns).map((n) => n.toLowerCase())
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
        if (def) {
            return { column: col, type: def.type || '' }
        }
        return { column: col, type: '' }
    }

    clearKeyCache() {
        this.keyCache = {}
    }

    getFilterPrefix() {
        if (!this.context) return ''
        if (this.context.expecting === 'column') return this.context.column || ''
        if (this.context.expecting === 'transformer') return this.context.transformer || ''
        return ''
    }

    highlightMatch(label) {
        const prefix = this.getFilterPrefix()
        if (!prefix) return escapeHtml(label)
        if (!label.toLowerCase().startsWith(prefix.toLowerCase())) return escapeHtml(label)
        const matched = escapeHtml(label.substring(0, prefix.length))
        const rest = escapeHtml(label.substring(prefix.length))
        return `<span class="flyql-panel__match">${matched}</span>${rest}`
    }
}
