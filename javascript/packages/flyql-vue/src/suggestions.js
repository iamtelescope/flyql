/**
 * Suggestion generation from parser state + schema — pure JS, no framework dependencies.
 */

import { Operator, VALID_KEY_VALUE_OPERATORS, isNumeric } from 'flyql/core'
import { Type } from 'flyql'
import { defaultRegistry } from 'flyql/transformers'

const OPERATOR_NAMES = {
    [Operator.EQUALS]: 'equals',
    [Operator.NOT_EQUALS]: 'not equals',
    [Operator.REGEX]: 'regex match',
    [Operator.NOT_REGEX]: 'not regex match',
    [Operator.GREATER_THAN]: 'greater than',
    [Operator.GREATER_OR_EQUALS_THAN]: 'greater or equals',
    [Operator.LOWER_THAN]: 'lower than',
    [Operator.LOWER_OR_EQUALS_THAN]: 'lower or equals',
    [Operator.IN]: 'in list',
    [Operator.HAS]: 'has value',
    [Operator.LIKE]: 'like pattern',
    [Operator.ILIKE]: 'case-insensitive like',
}

export const STATE_LABELS = {
    column: 'column name',
    operator: 'operator',
    operatorPrefix: 'operator',
    operatorOrBool: 'operator or boolean',
    value: 'value',
    boolOp: 'boolean operator',
    transformer: 'transformer',
}

const COLUMN_TYPE_TO_FLYQL = {
    string: Type.String,
    text: Type.String,
    enum: Type.String,
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

export function getTransformerSuggestions(schema, ctx, registry = null) {
    if (!registry) registry = defaultRegistry()
    const names = registry.names()

    // Determine the expected input type for filtering
    let inputType = null
    if (ctx.transformerChain) {
        // Chained: compute output type of the last transformer in the chain
        const chainParts = ctx.transformerChain.split('|')
        for (const tName of chainParts) {
            const t = registry.get(tName)
            if (t) {
                inputType = t.outputType
            } else {
                inputType = null
                break
            }
        }
    } else {
        // First transformer: resolve column type
        const colDef = ctx.transformerBaseKey ? schema.resolve(ctx.transformerBaseKey.split('.')) : null
        if (colDef && colDef.type) {
            if (_FLYQL_TYPE_VALUES.has(colDef.type)) {
                inputType = colDef.type
            } else {
                inputType = COLUMN_TYPE_TO_FLYQL[String(colDef.type).toLowerCase()] || null
            }
        }
    }

    const prefix = (ctx.transformerPrefix || '').toLowerCase()
    const results = []
    for (const name of names) {
        const t = registry.get(name)
        if (!t) continue
        if (inputType && t.inputType !== inputType) continue
        if (prefix && !name.toLowerCase().startsWith(prefix)) continue
        results.push({
            label: name,
            insertText: name,
            type: 'transformer',
            detail: `${t.inputType} → ${t.outputType}`,
        })
    }
    return results
}

/**
 * Get nested column suggestions when prefix contains a dot.
 * Traverses children via ColumnSchema to suggest at the appropriate depth.
 */
export function getNestedColumnSuggestions(schema, prefix) {
    const dotIndex = prefix.lastIndexOf('.')
    const rawParentPath = prefix.substring(0, dotIndex)
    const childPrefix = prefix.substring(dotIndex + 1).toLowerCase()

    const segments = rawParentPath.split('.')
    const resolved = schema.resolveWithPath(segments)
    if (!resolved || !resolved.column.children) return []

    // Check that all intermediate nodes along the path have suggest !== false
    let check = schema.get(segments[0])
    if (!check || check.suggest === false) return []
    for (let i = 1; i < segments.length; i++) {
        if (!check.children) return []
        check = check.children[segments[i].toLowerCase()]
        if (!check || check.suggest === false) return []
    }

    const parentPath = resolved.parentPath

    const result = []
    for (const [lowerKey, def] of Object.entries(resolved.column.children)) {
        if (!def || def.suggest === false) continue
        const displayName = def.name || lowerKey
        if (childPrefix && !displayName.toLowerCase().startsWith(childPrefix)) continue
        const fullPath = parentPath + '.' + displayName
        const hasChildren = !!def.children
        result.push({
            label: fullPath,
            displayLabel: '\u2026' + displayName + (hasChildren ? '.' : ''),
            insertText: hasChildren ? fullPath + '.' : fullPath,
            type: 'column',
            detail: def.rawType || def.type || '',
        })
    }
    return result
}

/**
 * Resolve a column definition by name, supporting dot-separated nested paths.
 * Returns the Column or null if not found.
 */
export function resolveColumnDef(schema, fieldName) {
    if (!fieldName) return null
    return schema.resolve(fieldName.split('.'))
}

export function getKeySuggestions(schema, prefix) {
    // If prefix contains a dot, delegate to nested traversal
    if (prefix.includes('.')) {
        const nested = getNestedColumnSuggestions(schema, prefix)
        if (nested.length > 0) return nested
        // Check if this is a schemaless object column (no children) — signal async needed.
        // After the unify-column-type-system refactor, "object" can be either
        // the raw editor-input string 'object' OR the canonical Type.Unknown
        // (since 'object' isn't a flyql.Type, it gets normalized to Unknown).
        const dotIndex = prefix.lastIndexOf('.')
        const rawParentPath = prefix.substring(0, dotIndex)
        const segments = rawParentPath.split('.')
        const rootCol = schema.get(segments[0])
        const isObjectLike = (col) => col && (col.type === 'object' || col.type === Type.Unknown)
        if (isObjectLike(rootCol)) {
            if (!rootCol.children) {
                return null // root is schemaless object — signal async
            }
            const fullResolved = schema.resolve(segments)
            if (fullResolved && !fullResolved.children && isObjectLike(fullResolved)) {
                return null // reached a schemaless object deeper in static tree
            }
        }
        return []
    }

    const result = []
    const lowerPrefix = prefix.toLowerCase()
    for (const [name, col] of Object.entries(schema.columns)) {
        if (!col || col.suggest === false) continue
        if (lowerPrefix && !name.toLowerCase().startsWith(lowerPrefix)) continue
        const hasChildren = !!col.children
        result.push({
            label: name,
            insertText: hasChildren ? name + '.' : name,
            type: 'column',
            detail: col.rawType || col.type || '',
        })
    }
    return result
}

export function getOperatorSuggestions(schema, fieldName, registry = null) {
    const col = resolveColumnDef(schema, fieldName)
    const result = []

    if (!registry) registry = defaultRegistry()

    const ops = [
        { label: Operator.EQUALS, insertText: Operator.EQUALS, sortText: 'a' },
        { label: Operator.NOT_EQUALS, insertText: Operator.NOT_EQUALS, sortText: 'b' },
        { label: Operator.GREATER_THAN, insertText: Operator.GREATER_THAN, sortText: 'e' },
        { label: Operator.GREATER_OR_EQUALS_THAN, insertText: Operator.GREATER_OR_EQUALS_THAN, sortText: 'f' },
        { label: Operator.LOWER_THAN, insertText: Operator.LOWER_THAN, sortText: 'g' },
        { label: Operator.LOWER_OR_EQUALS_THAN, insertText: Operator.LOWER_OR_EQUALS_THAN, sortText: 'h' },
        { label: Operator.IN, insertText: ' ' + Operator.IN + ' ', sortText: 'i' },
        { label: Operator.HAS, insertText: ' ' + Operator.HAS + ' ', sortText: 'j' },
        { label: Operator.LIKE, insertText: ' ' + Operator.LIKE + ' ', sortText: 'k' },
        { label: Operator.ILIKE, insertText: ' ' + Operator.ILIKE + ' ', sortText: 'l' },
    ]
    // After the unify-column-type-system refactor, col.type holds a
    // canonical flyql.Type value. Numeric columns (Int/Float) get
    // HAS/LIKE/ILIKE removed. Enum-like columns (Type.String with a
    // bounded `values` list) get regex operators removed for UX. The
    // helpers also accept raw editor-input strings ('number', 'enum')
    // for callers that bypass the editor engine's normalization step.
    const colTypeNormalized =
        col && col.type
            ? _FLYQL_TYPE_VALUES.has(col.type)
                ? col.type
                : COLUMN_TYPE_TO_FLYQL[String(col.type).toLowerCase()] || col.type
            : null
    const rawType = col && col.type ? String(col.type).toLowerCase() : null
    const isNumeric = colTypeNormalized === Type.Int || colTypeNormalized === Type.Float || rawType === 'number'
    const isEnumLike =
        (colTypeNormalized === Type.String && Array.isArray(col && col.values) && col.values.length > 0) ||
        rawType === 'enum'
    if (isNumeric) {
        ops.splice(
            ops.findIndex((o) => o.label === Operator.HAS),
            1,
        )
        ops.splice(
            ops.findIndex((o) => o.label === Operator.LIKE),
            1,
        )
        ops.splice(
            ops.findIndex((o) => o.label === Operator.ILIKE),
            1,
        )
    }
    if (!col || (!isEnumLike && !isNumeric)) {
        ops.push({ label: Operator.REGEX, insertText: Operator.REGEX, sortText: 'c' })
        ops.push({ label: Operator.NOT_REGEX, insertText: Operator.NOT_REGEX, sortText: 'd' })
    }
    ops.sort((a, b) => a.sortText.localeCompare(b.sortText))
    const mapped = ops.map((op) => ({
        label: op.label,
        insertText: op.insertText,
        type: 'operator',
        detail: OPERATOR_NAMES[op.label] || '',
    }))

    // Insert pipe after equals and not-equals (3rd position)
    let colType = null
    if (col && col.type) {
        if (_FLYQL_TYPE_VALUES.has(col.type)) {
            colType = col.type
        } else {
            colType = COLUMN_TYPE_TO_FLYQL[String(col.type).toLowerCase()] || null
        }
    }
    const hasTransformers = registry.names().some((name) => {
        const t = registry.get(name)
        return !colType || t.inputType === colType
    })
    if (hasTransformers) {
        mapped.splice(2, 0, { label: '|', insertText: '|', type: 'transformer', detail: 'transformer (pipe)' })
    }

    result.push(...mapped)
    return result
}

export function getBoolSuggestions() {
    return [
        { label: 'and', insertText: 'and ', type: 'boolOp', detail: '' },
        { label: 'or', insertText: 'or ', type: 'boolOp', detail: '' },
        { label: 'and not', insertText: 'and not ', type: 'boolOp', detail: 'negate' },
        { label: 'or not', insertText: 'or not ', type: 'boolOp', detail: 'negate' },
    ]
}

const TEMPORAL_TYPES = new Set([
    'datetime',
    'timestamp',
    'date',
    'time',
    'datetime64',
    'timestamptz',
    'timestamp without time zone',
    'timestamp with time zone',
])

const TEMPORAL_FUNCTION_SUGGESTIONS = [
    { label: 'ago(1h)', insertText: 'ago(1h)', type: 'function', detail: 'Last 1 hour' },
    { label: 'ago(30m)', insertText: 'ago(30m)', type: 'function', detail: 'Last 30 minutes' },
    { label: 'ago(1d)', insertText: 'ago(1d)', type: 'function', detail: 'Last 1 day' },
    { label: 'ago(7d)', insertText: 'ago(7d)', type: 'function', detail: 'Last 7 days' },
    { label: 'ago(2w)', insertText: 'ago(2w)', type: 'function', detail: 'Last 2 weeks' },
    { label: 'now()', insertText: 'now()', type: 'function', detail: 'Current time' },
    { label: 'today()', insertText: 'today()', type: 'function', detail: 'Today' },
    { label: "startOf('day')", insertText: "startOf('day')", type: 'function', detail: 'Start of day' },
    { label: "startOf('week')", insertText: "startOf('week')", type: 'function', detail: 'Start of week' },
    { label: "startOf('month')", insertText: "startOf('month')", type: 'function', detail: 'Start of month' },
]

function getTemporalFunctionSuggestions(col, filterPrefix) {
    if (!col.type || !TEMPORAL_TYPES.has(col.type.toLowerCase())) {
        return []
    }
    const lowerPrefix = filterPrefix ? filterPrefix.toLowerCase() : ''
    return TEMPORAL_FUNCTION_SUGGESTIONS.filter((s) => {
        if (!lowerPrefix) return true
        return s.label.toLowerCase().startsWith(lowerPrefix)
    })
}

export function prepareSuggestionValues(items, quoteChar, filterPrefix) {
    const quoted = !!quoteChar
    const defaultQuote = quoteChar || '"'
    const lowerPrefix = filterPrefix ? filterPrefix.toLowerCase() : ''
    return items
        .filter((item) => {
            if (!lowerPrefix) return true
            return String(item).toLowerCase().startsWith(lowerPrefix)
        })
        .map((item) => {
            if (isNumeric(item)) {
                return { label: item, insertText: item, type: 'value', detail: '' }
            }
            let text = ''
            if (!quoted) text += defaultQuote
            for (const ch of item) {
                text += ch === defaultQuote ? `\\${defaultQuote}` : ch
            }
            text += defaultQuote
            return { label: item, insertText: text, type: 'value', detail: '' }
        })
}

function getParameterSuggestions(parameters, value) {
    const prefix = value.startsWith('$') ? value.slice(1).toLowerCase() : ''
    const results = []
    for (const name of parameters) {
        if (prefix && !name.toLowerCase().startsWith(prefix)) continue
        results.push({
            label: '$' + name,
            insertText: '$' + name,
            type: 'value',
            detail: 'parameter',
        })
    }
    return results
}

export async function getValueSuggestions(schema, key, value, quoteChar, onAutocomplete, setLoading, parameters = []) {
    // Parameter autocomplete: if current value starts with $, suggest parameters
    if (value && value.startsWith('$')) {
        return {
            suggestions: getParameterSuggestions(parameters, value),
            incomplete: false,
            message: '',
        }
    }
    const col = resolveColumnDef(schema, key)
    if (!col) {
        // For unresolved dotted keys (e.g., discovered paths like request.method),
        // fall through to onAutocomplete so the host app can provide value suggestions.
        if (key && key.includes('.') && onAutocomplete) {
            const loadingTimer = setTimeout(() => {
                setLoading(true)
            }, 200)
            try {
                const result = await onAutocomplete(key, value)
                if (result && result.items) {
                    return {
                        suggestions: prepareSuggestionValues(result.items, quoteChar, value),
                        rawItems: result.items,
                        incomplete: !!result.incomplete,
                        message: '',
                    }
                }
            } finally {
                clearTimeout(loadingTimer)
                setLoading(false)
            }
        }
        return { suggestions: [], incomplete: false, message: '' }
    }
    if (!col.autocomplete) {
        return { suggestions: [], incomplete: false, message: 'Autocompletion is disabled for this column' }
    }

    const temporalSuggestions = getTemporalFunctionSuggestions(col, value)

    if (col.values && col.values.length > 0) {
        const valueSuggestions = prepareSuggestionValues(col.values, quoteChar, value)
        return { suggestions: [...temporalSuggestions, ...valueSuggestions], incomplete: false, message: '' }
    }

    if (onAutocomplete) {
        const loadingTimer = setTimeout(() => {
            setLoading(true)
        }, 200)
        try {
            const result = await onAutocomplete(key, value)
            if (result && result.items) {
                const valueSuggestions = prepareSuggestionValues(result.items, quoteChar, value)
                return {
                    suggestions: [...temporalSuggestions, ...valueSuggestions],
                    rawItems: result.items,
                    incomplete: !!result.incomplete,
                    message: '',
                }
            }
        } finally {
            clearTimeout(loadingTimer)
            setLoading(false)
        }
    }
    if (temporalSuggestions.length > 0) {
        return { suggestions: temporalSuggestions, incomplete: false, message: '' }
    }
    return { suggestions: [], incomplete: false, message: '' }
}

export function getColumnSuggestionsForValue(schema, filterPrefix, excludeKey = '') {
    const result = getKeySuggestions(schema, filterPrefix)
    if (result === null) return [] // schemaless async — not supported in Columns tab
    const excludeLower = excludeKey.toLowerCase()
    return result
        .filter((item) => !excludeLower || item.label.toLowerCase() !== excludeLower)
        .map((item) => ({
            ...item,
            type: 'columnRef',
            insertText: item.insertText.endsWith('.') ? item.insertText.slice(0, -1) : item.insertText,
        }))
}

export async function getKeyDiscoverySuggestions(schema, prefix, onKeyDiscovery, keyCache, setLoading) {
    if (!onKeyDiscovery) return []

    const dotIndex = prefix.lastIndexOf('.')
    const rawParentPath = prefix.substring(0, dotIndex)
    const childPrefix = prefix.substring(dotIndex + 1).toLowerCase()
    const segments = rawParentPath.split('.')

    // Resolve the root column
    const rootCol = schema.get(segments[0])
    if (!rootCol || rootCol.suggest === false) return []

    // After the unify-column-type-system refactor, "object" can be either
    // the raw editor-input string 'object' OR canonical Type.Unknown.
    const isObjectLike = (col) => col && (col.type === 'object' || col.type === Type.Unknown)
    // If root node has children, check if the full path resolves through static children
    if (rootCol.children) {
        const fullResolved = schema.resolve(segments)
        if (fullResolved && fullResolved.children) return [] // fully static path
        if (fullResolved && !isObjectLike(fullResolved)) return [] // leaf node
        if (!fullResolved) return []
    }
    if (!isObjectLike(rootCol)) return []

    const parentPath = segments.join('.')
    const rootColumnName = segments[0]
    const cacheKey = segments.join('|')

    // Cache check
    if (keyCache[cacheKey]) {
        return filterDiscoveredKeys(keyCache[cacheKey], parentPath, childPrefix)
    }

    const loadingTimer = setTimeout(() => {
        setLoading(true)
    }, 200)
    try {
        const keys = await onKeyDiscovery(rootColumnName, segments)
        if (keys && Array.isArray(keys)) {
            keyCache[cacheKey] = keys
            return filterDiscoveredKeys(keys, parentPath, childPrefix)
        }
    } catch {
        // Error: return empty suggestions, editor remains functional
    } finally {
        clearTimeout(loadingTimer)
        setLoading(false)
    }
    return []
}

function filterDiscoveredKeys(keys, parentPath, childPrefix) {
    return keys
        .filter((k) => {
            if (!childPrefix) return true
            return k.name.toLowerCase().startsWith(childPrefix)
        })
        .map((k) => {
            const fullPath = parentPath + '.' + k.name
            return {
                label: fullPath,
                displayLabel: '\u2026' + k.name,
                insertText: k.hasChildren ? fullPath + '.' : fullPath,
                type: 'column',
                detail: k.type || 'unknown',
            }
        })
}

export function getInsertRange(ctx, fullText, suggestionType) {
    if (!ctx) return { start: 0, end: 0 }

    const cursorPos = ctx.textBeforeCursor.length

    let endPos = cursorPos
    if (fullText) {
        const afterCursor = fullText.substring(cursorPos)
        let trailingLen = 0
        for (let i = 0; i < afterCursor.length; i++) {
            const c = afterCursor[i]
            if (
                c === ' ' ||
                c === '\t' ||
                c === '\n' ||
                c === '\r' ||
                c === '=' ||
                c === '!' ||
                c === '<' ||
                c === '>' ||
                c === '~' ||
                c === '&' ||
                c === '|' ||
                c === '(' ||
                c === ')' ||
                c === "'" ||
                c === '"'
            )
                break
            trailingLen++
        }
        if (trailingLen > 0) {
            endPos = cursorPos + trailingLen
        }
    }

    if (ctx.expecting === 'transformer') {
        const prefixLen = (ctx.transformerPrefix || '').length
        return { start: cursorPos - prefixLen, end: endPos }
    } else if (ctx.expecting === 'column') {
        if (suggestionType === 'operator') {
            return { start: cursorPos, end: endPos }
        }
        const keyLen = (ctx.key || '').length
        return { start: cursorPos - keyLen, end: endPos }
    } else if (ctx.expecting === 'operatorPrefix') {
        const opLen = (ctx.keyValueOperator || '').length
        return { start: cursorPos - opLen, end: endPos }
    } else if (ctx.expecting === 'operatorOrBool' || ctx.expecting === 'list') {
        return { start: cursorPos, end: endPos }
    } else if (ctx.expecting === 'value') {
        const valLen = (ctx.value || '').length
        let valueEnd = endPos
        if (fullText && ctx.quoteChar && fullText[endPos] === ctx.quoteChar) {
            valueEnd = endPos + 1
        }
        return { start: cursorPos - valLen, end: valueEnd }
    } else if (ctx.expecting === 'boolOp') {
        const text = ctx.textBeforeCursor
        let wordLen = 0
        for (let i = text.length - 1; i >= 0; i--) {
            if (text[i] === ' ' || text[i] === '\t' || text[i] === '\n' || text[i] === '\r') break
            wordLen++
        }
        return { start: cursorPos - wordLen, end: endPos }
    }

    return { start: cursorPos, end: cursorPos }
}

export async function updateSuggestions(
    ctx,
    schema,
    onAutocomplete,
    onKeyDiscovery,
    keyCache,
    setLoading,
    registry = null,
    parameters = [],
) {
    let message = ''
    let suggestions = []
    let suggestionType = ''
    let incomplete = false
    let rawItems

    if (!ctx) {
        suggestions = getKeySuggestions(schema, '')
        suggestionType = 'column'
        return { suggestions, suggestionType, incomplete, message }
    }

    if (ctx.state === 'ERROR') {
        return { suggestions: [], suggestionType: '', incomplete, message: ctx.error }
    }

    if (ctx.expecting === 'column') {
        // Check for exact match: top-level key or resolved nested leaf
        const resolvedCol = resolveColumnDef(schema, ctx.key)
        const isExactLeaf = resolvedCol && !resolvedCol.children
        if (isExactLeaf) {
            suggestions = getOperatorSuggestions(schema, ctx.key, registry)
            suggestionType = 'operator'
        } else {
            const keySuggestions = getKeySuggestions(schema, ctx.key)
            if (keySuggestions === null) {
                // Async key discovery needed
                suggestionType = 'column'
                suggestions = await getKeyDiscoverySuggestions(schema, ctx.key, onKeyDiscovery, keyCache, setLoading)
            } else {
                suggestions = keySuggestions
                suggestionType = 'column'
            }
        }
    } else if (ctx.expecting === 'operatorOrBool') {
        suggestions = [...getOperatorSuggestions(schema, ctx.key, registry), ...getBoolSuggestions()]
        suggestionType = 'operator'
    } else if (ctx.expecting === 'operatorPrefix') {
        suggestions = getOperatorSuggestions(schema, ctx.key, registry).filter((op) =>
            op.label.startsWith(ctx.keyValueOperator),
        )
        suggestionType = 'operator'
    } else if (ctx.expecting === 'list') {
        suggestions = [{ label: '[]', insertText: '[]', type: 'value', detail: 'empty list', cursorOffset: -1 }]
        suggestionType = 'value'
    } else if (ctx.expecting === 'value') {
        suggestionType = 'value'
        const result = await getValueSuggestions(
            schema,
            ctx.key,
            ctx.value,
            ctx.quoteChar,
            onAutocomplete,
            setLoading,
            parameters,
        )
        suggestions = result.suggestions
        incomplete = result.incomplete
        rawItems = result.rawItems
        message = result.message
    } else if (ctx.expecting === 'boolOp') {
        suggestions = getBoolSuggestions()
        suggestionType = 'boolOp'
    } else if (ctx.expecting === 'transformer') {
        const _registry = registry || defaultRegistry()
        const exactMatch = ctx.transformerPrefix && _registry.get(ctx.transformerPrefix)
        if (ctx.transformerInArgs && exactMatch) {
            // Inside transformer arguments — no suggestions, diagnostics handle validation
            suggestionType = 'transformer'
        } else if (exactMatch) {
            // Check type compatibility with chain before showing operators
            let typeError = false
            if (ctx.transformerChain) {
                const chainParts = ctx.transformerChain.split('|')
                const lastInChain = chainParts[chainParts.length - 1]
                const lastT = _registry.get(lastInChain)
                if (lastT && lastT.outputType !== exactMatch.inputType) {
                    suggestionType = 'transformer'
                    typeError = true
                }
            }
            if (!typeError) {
                // Complete transformer — show operators and pipe for chaining
                ctx.expecting = 'operatorOrBool'
                const outputType = exactMatch.outputType
                const hasChainable = _registry.names().some((name) => {
                    const tr = _registry.get(name)
                    return tr && tr.inputType === outputType
                })
                if (hasChainable) {
                    suggestions.push({ label: '|', insertText: '|', type: 'transformer', detail: 'chain transformer' })
                }
                suggestions.push(
                    ...getOperatorSuggestions(schema, ctx.transformerBaseKey, registry)
                        .filter((s) => s.label !== '|')
                        .map((s) => ({
                            ...s,
                            insertText: s.insertText.startsWith(' ') ? s.insertText : ' ' + s.insertText,
                        })),
                )
                suggestionType = 'operator'
            }
        } else {
            suggestions = getTransformerSuggestions(schema, ctx, registry)
            suggestionType = 'transformer'
            if (suggestions.length === 0) {
                message = 'No matching transformers'
            }
        }
    }

    if (suggestions.length === 0 && !suggestionType && ctx.expecting !== 'none') {
        suggestions = getKeySuggestions(schema, '')
        suggestionType = 'column'
    }

    if (suggestions.length > 0) {
        message = ''
    }

    return { suggestions, suggestionType, incomplete, rawItems, message }
}
