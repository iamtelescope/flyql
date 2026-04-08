/**
 * FlyQL syntax highlighter — standalone, no editor/DOM dependencies.
 * Returns HTML string with <span class="flyql-*"> tokens,
 * styled by the same CSS variables as the FlyQL editor.
 *
 * Usage:
 *   import { highlight } from 'flyql/highlight'
 *   import 'flyql/editor/flyql.css'
 *
 *   // Query mode (default): status=200 and meta.region='us-east'
 *   highlight("status=200 and meta.region='us-east'")
 *
 *   // Columns mode: id, message, meta_str.region as region
 *   highlight("id, message, meta_str.region as region", { mode: 'columns' })
 */

import { Parser as QueryParser, CharType as QueryCharType, State as QueryState, isNumeric } from './core/index.js'
import { Parser as ColumnsParser, CharType as ColumnsCharType } from './columns/index.js'

const QUERY_CLASS = {
    [QueryCharType.KEY]: 'flyql-key',
    [QueryCharType.OPERATOR]: 'flyql-operator',
    [QueryCharType.VALUE]: 'flyql-value',
    [QueryCharType.NUMBER]: 'flyql-number',
    [QueryCharType.STRING]: 'flyql-string',
    [QueryCharType.BOOLEAN]: 'flyql-boolean',
    [QueryCharType.NULL]: 'flyql-null',
    [QueryCharType.SPACE]: 'flyql-space',
    [QueryCharType.PIPE]: 'flyql-pipe',
    [QueryCharType.TRANSFORMER]: 'flyql-transformer',
    [QueryCharType.ARGUMENT]: 'flyql-argument',
    [QueryCharType.WILDCARD]: 'flyql-wildcard',
    [QueryCharType.COLUMN]: 'flyql-column',
}

const COLUMNS_CLASS = {
    [ColumnsCharType.COLUMN]: 'flyql-key',
    [ColumnsCharType.ALIAS]: 'flyql-key',
    [ColumnsCharType.ALIAS_OPERATOR]: 'flyql-operator',
    [ColumnsCharType.OPERATOR]: 'flyql-operator',
    [ColumnsCharType.TRANSFORMER]: 'flyql-transformer',
    [ColumnsCharType.ARGUMENT]: 'flyql-argument',
    [ColumnsCharType.SPACE]: 'flyql-space',
    [ColumnsCharType.ERROR]: 'flyql-error',
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function wrapSpan(cls, text) {
    const escaped = escapeHtml(text)
    return cls ? `<span class="${cls}">${escaped}</span>` : escaped
}

function buildHtml(text, typedChars, classMap, resolveType) {
    let html = ''
    let currentType = null
    let currentText = ''

    const flush = () => {
        if (!currentText) return
        const spanType = resolveType ? resolveType(currentType, currentText) : currentType
        html += wrapSpan(classMap[spanType], currentText)
    }

    for (let i = 0; i < typedChars.length; i++) {
        const charType = typedChars[i][1]
        const ch = text[i] !== undefined ? text[i] : typedChars[i][0].value
        if (charType === currentType) {
            currentText += ch
        } else {
            flush()
            currentType = charType
            currentText = ch
        }
    }
    flush()
    return html
}

/**
 * Highlight a FlyQL expression string into HTML.
 * @param {string} text - FlyQL expression
 * @param {object} [options]
 * @param {'query'|'columns'} [options.mode='query'] - Parsing mode
 * @returns {string} HTML with <span class="flyql-*"> tokens
 */
export function highlight(text, options) {
    if (!text) return ''
    const mode = options?.mode || 'query'

    if (mode === 'columns') {
        const parser = new ColumnsParser({ transformers: true })
        parser.parse(text, false, false)
        const typedChars = parser.typedChars
        if (!typedChars || typedChars.length === 0) return escapeHtml(text)

        let html = buildHtml(text, typedChars, COLUMNS_CLASS)
        if (typedChars.length < text.length) {
            html += `<span class="flyql-error">${escapeHtml(text.substring(typedChars.length))}</span>`
        }
        return html
    }

    // query mode
    const parser = new QueryParser()
    parser.parse(text, false, false)
    const typedChars = parser.typedChars
    if (!typedChars || typedChars.length === 0) return escapeHtml(text)

    const resolveType = (type, val) => {
        if (type === QueryCharType.VALUE) {
            if (val === 'true' || val === 'false') return QueryCharType.BOOLEAN
            if (val === 'null') return QueryCharType.NULL
            if (isNumeric(val)) return QueryCharType.NUMBER
            if (val.length > 0 && val[0] !== "'" && val[0] !== '"') return QueryCharType.COLUMN
        }
        return type
    }

    let html = buildHtml(text, typedChars, QUERY_CLASS, resolveType)
    if (parser.state === QueryState.ERROR && typedChars.length < text.length) {
        html += `<span class="flyql-error">${escapeHtml(text.substring(typedChars.length))}</span>`
    }
    return html
}
