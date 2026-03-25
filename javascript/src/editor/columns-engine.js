/**
 * ColumnsEngine — framework-agnostic columns expression editor logic.
 * Pure JS class, no Vue/React/DOM dependencies.
 * Uses the columns parser (flyql/columns) instead of the core query parser.
 * One instance per columns editor component.
 */

import { Parser } from '../columns/parser.js'
import { parse as parseColumns } from '../columns/index.js'
import { State } from '../columns/state.js'
import { CharType, KNOWN_MODIFIERS, MODIFIER_INFO, MODIFIER_OPERATOR, COLUMNS_DELIMITER } from '../columns/constants.js'
import { EditorState } from './state.js'
import { getNestedColumnSuggestions, resolveColumnDef, getKeyDiscoverySuggestions } from './suggestions.js'

const COL_CHAR_TYPE_CLASS = {
    [CharType.COLUMN]: 'flyql-col-column',
    [CharType.OPERATOR]: 'flyql-col-operator',
    [CharType.MODIFIER]: 'flyql-col-modifier',
    [CharType.ARGUMENT]: 'flyql-col-argument',
    [CharType.ALIAS]: 'flyql-col-alias',
    [CharType.ERROR]: 'flyql-col-error',
}

const STATE_LABELS = {
    column: 'column name',
    modifier: 'modifiers',
    delimiter: 'next',
    alias: 'next',
    argument: 'arguments',
    next: 'column name, separator or modifier',
    none: '',
}

function modifierDetail(name) {
    const info = MODIFIER_INFO[name]
    if (!info || info.args.length === 0) return 'no args'
    const parts = info.args.map((a) => (a.optional ? a.type + '?' : a.type))
    return '(' + parts.join(', ') + ')'
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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
        this.onKeyDiscovery = options.onKeyDiscovery || null
        this.onLoadingChange = options.onLoadingChange || null
        this.keyCache = {}
        this.state = new EditorState()
        this.context = null
        this.suggestions = []
        this.suggestionType = ''
        this.message = ''
        this.isLoading = false
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
                modifier: '',
                state: State.EXPECT_COLUMN,
                textBeforeCursor: '',
                existingColumns: [],
            }
        }

        const parser = new Parser()
        try {
            parser.parse(textBeforeCursor, false, true)
        } catch (e) {
            return {
                expecting: 'error',
                column: '',
                modifier: '',
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
                modifier: '',
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
            modifier: parser.modifier || '',
            expecting: 'none',
            textBeforeCursor,
            existingColumns,
        }

        if (parser.state === State.EXPECT_COLUMN || parser.state === State.COLUMN) {
            ctx.expecting = 'column'
        } else if (parser.state === State.EXPECT_MODIFIER || parser.state === State.MODIFIER) {
            ctx.expecting = 'modifier'
        } else if (
            parser.state === State.EXPECT_ALIAS ||
            parser.state === State.EXPECT_ALIAS_OPERATOR ||
            parser.state === State.EXPECT_ALIAS_DELIMITER
        ) {
            ctx.expecting = 'alias'
        } else if (
            parser.state === State.MODIFIER_ARGUMENT ||
            parser.state === State.EXPECT_MODIFIER_ARGUMENT ||
            parser.state === State.MODIFIER_ARGUMENT_DOUBLE_QUOTED ||
            parser.state === State.MODIFIER_ARGUMENT_SINGLE_QUOTED ||
            parser.state === State.EXPECT_MODIFIER_ARGUMENT_DELIMITER
        ) {
            // Peek at char after cursor: if it's ) and parser is between args
            // (waiting for comma or close), user is done — show next steps.
            // But NOT when actively typing an argument or in empty parens.
            const charAtCursor = fullText ? fullText[textBeforeCursor.length] : undefined
            if (charAtCursor === ')' && parser.state === State.EXPECT_MODIFIER_ARGUMENT_DELIMITER) {
                ctx.expecting = 'next'
            } else {
                ctx.expecting = 'argument'
            }
        } else if (parser.state === State.MODIFIER_COMPLETE) {
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
                        {
                            label: MODIFIER_OPERATOR,
                            insertText: MODIFIER_OPERATOR,
                            type: 'delimiter',
                            detail: 'add modifier',
                        },
                    ]
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
                // Exact match — show next-step actions first, then remaining columns
                const nextSteps = [
                    {
                        label: COLUMNS_DELIMITER,
                        insertText: COLUMNS_DELIMITER + ' ',
                        type: 'delimiter',
                        detail: 'next column',
                    },
                    {
                        label: MODIFIER_OPERATOR,
                        insertText: MODIFIER_OPERATOR,
                        type: 'delimiter',
                        detail: 'add modifier',
                    },
                ]
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
        } else if (ctx.expecting === 'modifier') {
            const prefix = ctx.modifier.toLowerCase()
            const hasExactMatch = prefix && KNOWN_MODIFIERS.some((m) => m.toLowerCase() === prefix)

            if (hasExactMatch) {
                // Exact modifier match — show next steps, then other matching modifiers
                const info =
                    MODIFIER_INFO[prefix] || MODIFIER_INFO[KNOWN_MODIFIERS.find((m) => m.toLowerCase() === prefix)]
                const hasArgs = info && info.args.length > 0
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
                        detail: modifierDetail(prefix),
                        cursorOffset: -1,
                    })
                }
                nextSteps.push({
                    label: MODIFIER_OPERATOR,
                    insertText: MODIFIER_OPERATOR,
                    type: 'delimiter',
                    detail: 'chain modifier',
                })
                const otherMods = []
                for (const mod of KNOWN_MODIFIERS) {
                    if (mod.toLowerCase() === prefix) continue
                    if (!mod.toLowerCase().startsWith(prefix)) continue
                    otherMods.push({ label: mod, insertText: mod, type: 'modifier', detail: modifierDetail(mod) })
                }
                this.suggestions = [...otherMods, ...nextSteps]
                this.suggestionType = 'next'
            } else {
                const suggestions = []
                for (const mod of KNOWN_MODIFIERS) {
                    if (prefix && !mod.toLowerCase().startsWith(prefix)) continue
                    suggestions.push({ label: mod, insertText: mod, type: 'modifier', detail: modifierDetail(mod) })
                }
                this.suggestions = suggestions
                this.suggestionType = 'modifier'
                if (suggestions.length === 0 && prefix) {
                    this.message = 'No matching modifiers'
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
                // After column/modifier+space, before alias operator — pipe and comma are valid
                this.suggestions = [
                    {
                        label: MODIFIER_OPERATOR,
                        insertText: MODIFIER_OPERATOR,
                        type: 'delimiter',
                        detail: 'add modifier',
                    },
                    {
                        label: COLUMNS_DELIMITER,
                        insertText: COLUMNS_DELIMITER + ' ',
                        type: 'delimiter',
                        detail: 'next column',
                    },
                ]
            }
            this.suggestionType = 'delimiter'
        } else if (ctx.expecting === 'next') {
            // After modifier with args completes — suggest comma or pipe
            this.suggestions = [
                {
                    label: COLUMNS_DELIMITER,
                    insertText: COLUMNS_DELIMITER + ' ',
                    type: 'delimiter',
                    detail: 'next column',
                },
                {
                    label: MODIFIER_OPERATOR,
                    insertText: MODIFIER_OPERATOR,
                    type: 'delimiter',
                    detail: 'chain modifier',
                },
            ]
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

        // Build highlight using char positions — columns parser skips spaces
        // in some states, so typedChars count != value length. Use pos to align.
        let html = ''
        let currentType = null
        let currentText = ''
        let lastPos = -1

        for (let i = 0; i < typedChars.length; i++) {
            const char = typedChars[i][0]
            const charType = typedChars[i][1]
            const pos = char.pos

            // Fill any gap (untracked chars like spaces) as plain text
            if (pos > lastPos + 1) {
                if (currentText) {
                    html += wrapSpan(currentType, currentText)
                    currentText = ''
                    currentType = null
                }
                const gap = value.substring(lastPos + 1, pos)
                html += escapeHtml(gap)
            }

            const ch = value[pos] !== undefined ? value[pos] : char.value
            if (charType === currentType && ch !== '\n') {
                currentText += ch
            } else {
                if (currentText) {
                    html += wrapSpan(currentType, currentText)
                }
                currentType = charType
                currentText = ch
            }
            lastPos = pos
        }
        if (currentText) {
            html += wrapSpan(currentType, currentText)
        }

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
            return parseColumns(value)
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
        const parser = new Parser()
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
            parser.state === State.MODIFIER ||
            parser.state === State.MODIFIER_COMPLETE
        ) {
            return { valid: true, message: 'Valid columns expression' }
        }
        return { valid: false, message: 'Incomplete expression' }
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

        // Delimiter suggestions (, and |) insert at cursor, don't replace prefix
        if (suggestion && suggestion.type === 'delimiter') {
            return { start: cursor, end: cursor }
        }

        if (context.expecting === 'column') {
            const prefix = context.column || ''
            return { start: cursor - prefix.length, end: cursor }
        }
        if (context.expecting === 'modifier') {
            const prefix = context.modifier || ''
            return { start: cursor - prefix.length, end: cursor }
        }
        return { start: cursor, end: cursor }
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

    clearKeyCache() {
        this.keyCache = {}
    }

    getFilterPrefix() {
        if (!this.context) return ''
        if (this.context.expecting === 'column') return this.context.column || ''
        if (this.context.expecting === 'modifier') return this.context.modifier || ''
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
