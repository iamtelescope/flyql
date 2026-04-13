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

import { tokenize } from './tokenize.js'
import { CharType as QueryCharType } from './core/index.js'
import { CharType as ColumnsCharType } from './columns/index.js'

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
    [QueryCharType.PARAMETER]: 'flyql-parameter',
    [QueryCharType.ERROR]: 'flyql-error',
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
    const tokens = tokenize(text, { mode })
    const classMap = mode === 'columns' ? COLUMNS_CLASS : QUERY_CLASS
    return tokens.map((t) => wrapSpan(classMap[t.type], t.text)).join('')
}
