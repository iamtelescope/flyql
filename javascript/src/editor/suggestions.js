/**
 * Suggestion generation from parser state + schema — pure JS, no framework dependencies.
 */

import { Operator, VALID_KEY_VALUE_OPERATORS, isNumeric } from '../core/index.js'
import { defaultRegistry, TransformerType } from '../transformers/index.js'

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

const COLUMN_TYPE_TO_TRANSFORMER_TYPE = {
    string: TransformerType.STRING,
    text: TransformerType.STRING,
    enum: TransformerType.STRING,
    number: TransformerType.INT,
    int: TransformerType.INT,
    integer: TransformerType.INT,
    float: TransformerType.FLOAT,
}

export function getTransformerSuggestions(columns, ctx, registry = null) {
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
        const colDef = resolveColumnDef(columns, ctx.transformerBaseKey)
        if (colDef && colDef.type) {
            inputType = COLUMN_TYPE_TO_TRANSFORMER_TYPE[colDef.type.toLowerCase()] || null
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
 * Traverse a column schema's children by dot-separated segments.
 * Returns { node, parentPath } where node is the schema node at the resolved path,
 * or null if the path doesn't resolve.
 */
function resolveNestedNode(columns, segments) {
    // Case-insensitive lookup: find matching key regardless of case
    const findKey = (obj, target) => {
        const lower = target.toLowerCase()
        for (const key of Object.keys(obj)) {
            if (key.toLowerCase() === lower) return key
        }
        return null
    }

    const rootKey = findKey(columns, segments[0])
    if (!rootKey) return null
    let node = columns[rootKey]
    if (!node || node.suggest === false) return null
    let parentPath = rootKey

    for (let i = 1; i < segments.length; i++) {
        if (!node.children) return null
        const childKey = findKey(node.children, segments[i])
        if (!childKey) return null
        node = node.children[childKey]
        if (!node || node.suggest === false) return null
        parentPath += '.' + childKey
    }
    return { node, parentPath }
}

/**
 * Get nested column suggestions when prefix contains a dot.
 * Traverses children to suggest at the appropriate depth.
 */
export function getNestedColumnSuggestions(columns, prefix) {
    const dotIndex = prefix.lastIndexOf('.')
    const rawParentPath = prefix.substring(0, dotIndex)
    const childPrefix = prefix.substring(dotIndex + 1).toLowerCase()

    // Split parent path into segments and traverse
    const segments = rawParentPath.split('.')
    const resolved = resolveNestedNode(columns, segments)
    if (!resolved || !resolved.node.children) return []

    // Use schema-normalized parentPath from resolveNestedNode (canonical casing)
    const parentPath = resolved.parentPath

    const result = []
    for (const [name, def] of Object.entries(resolved.node.children)) {
        if (!def || def.suggest === false) continue
        if (childPrefix && !name.toLowerCase().startsWith(childPrefix)) continue
        const fullPath = parentPath + '.' + name
        const hasChildren = !!def.children
        result.push({
            label: fullPath,
            insertText: hasChildren ? fullPath + '.' : fullPath,
            type: 'column',
            detail: def.type || '',
        })
    }
    return result
}

/**
 * Resolve a column definition by name, supporting dot-separated nested paths.
 * Returns the schema node for the column, or undefined if not found.
 */
export function resolveColumnDef(columns, fieldName) {
    if (!fieldName) return undefined
    // Case-insensitive lookup for both flat and nested columns
    const lower = fieldName.toLowerCase()
    for (const key of Object.keys(columns)) {
        if (key.toLowerCase() === lower) return columns[key]
    }
    if (!fieldName.includes('.')) return undefined
    const segments = fieldName.split('.')
    const resolved = resolveNestedNode(columns, segments)
    return resolved ? resolved.node : undefined
}

export function getKeySuggestions(columns, prefix) {
    // If prefix contains a dot, delegate to nested traversal
    if (prefix.includes('.')) {
        const nested = getNestedColumnSuggestions(columns, prefix)
        if (nested.length > 0) return nested
        // Check if this is a schemaless object column (no children) — signal async needed
        const dotIndex = prefix.lastIndexOf('.')
        const rawParentPath = prefix.substring(0, dotIndex)
        const segments = rawParentPath.split('.')
        // Check root column first — for multi-level discovery, intermediate nodes
        // are discovered keys (not in schema), so only root needs to be resolvable
        const rootResolved = resolveNestedNode(columns, [segments[0]])
        if (rootResolved && rootResolved.node.type === 'object') {
            if (!rootResolved.node.children) {
                return null // root is schemaless object — signal async
            }
            // Root has children — check if full path resolves through static children
            const fullResolved = resolveNestedNode(columns, segments)
            if (fullResolved && !fullResolved.node.children && fullResolved.node.type === 'object') {
                return null // reached a schemaless object deeper in static tree
            }
        }
        return []
    }

    const result = []
    const lowerPrefix = prefix.toLowerCase()
    for (const name of Object.keys(columns)) {
        const col = columns[name]
        if (!col || col.suggest === false) continue
        if (lowerPrefix && !name.toLowerCase().startsWith(lowerPrefix)) continue
        const hasChildren = !!col.children
        result.push({
            label: name,
            insertText: hasChildren ? name + '.' : name,
            type: 'column',
            detail: col.type || '',
        })
    }
    return result
}

export function getOperatorSuggestions(columns, fieldName, registry = null) {
    const col = resolveColumnDef(columns, fieldName)
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
    if (col && col.type === 'number') {
        // remove HAS, LIKE, ILIKE — not supported for number columns
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
    if (!col || (col.type !== 'enum' && col.type !== 'number')) {
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
    const colType = col && col.type ? COLUMN_TYPE_TO_TRANSFORMER_TYPE[col.type.toLowerCase()] : null
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

export async function getValueSuggestions(columns, key, value, quoteChar, onAutocomplete, setLoading) {
    const col = resolveColumnDef(columns, key)
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

    if (col.values && col.values.length > 0) {
        return { suggestions: prepareSuggestionValues(col.values, quoteChar, value), incomplete: false, message: '' }
    }

    if (onAutocomplete) {
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

export function getColumnSuggestionsForValue(columns, filterPrefix, excludeKey = '') {
    const result = getKeySuggestions(columns, filterPrefix)
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

export async function getKeyDiscoverySuggestions(columns, prefix, onKeyDiscovery, keyCache, setLoading) {
    if (!onKeyDiscovery) return []

    const dotIndex = prefix.lastIndexOf('.')
    const rawParentPath = prefix.substring(0, dotIndex)
    const childPrefix = prefix.substring(dotIndex + 1).toLowerCase()
    const segments = rawParentPath.split('.')

    // Resolve the root column — for multi-level discovery, we only need the root
    // to be a schemaless object. Intermediate segments are discovered keys, not schema nodes.
    const resolved = resolveNestedNode(columns, [segments[0]])
    if (!resolved) return []

    // If root node has children, check if the full path resolves through static children
    if (resolved.node.children) {
        const fullResolved = resolveNestedNode(columns, segments)
        if (fullResolved && fullResolved.node.children) return [] // fully static path
        if (fullResolved && fullResolved.node.type !== 'object') return [] // leaf node
        // If fullResolved exists but has no children and is object type, proceed with discovery
        // If fullResolved is null, segments go beyond static children — not discoverable from here
        if (!fullResolved) return []
    }
    if (resolved.node.type !== 'object') return []

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
        const trailingMatch = afterCursor.match(/^[^\s=!<>~&|()'"]+/)
        if (trailingMatch) {
            endPos = cursorPos + trailingMatch[0].length
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
    columns,
    onAutocomplete,
    onKeyDiscovery,
    keyCache,
    setLoading,
    registry = null,
) {
    let message = ''
    let suggestions = []
    let suggestionType = ''
    let incomplete = false
    let rawItems

    if (!ctx) {
        suggestions = getKeySuggestions(columns, '')
        suggestionType = 'column'
        return { suggestions, suggestionType, incomplete, message }
    }

    if (ctx.state === 'ERROR') {
        return { suggestions: [], suggestionType: '', incomplete, message: ctx.error }
    }

    if (ctx.expecting === 'column') {
        // Check for exact match: top-level key or resolved nested leaf
        const resolvedCol = resolveColumnDef(columns, ctx.key)
        const isExactLeaf = resolvedCol && !resolvedCol.children
        if (isExactLeaf) {
            suggestions = getOperatorSuggestions(columns, ctx.key, registry)
            suggestionType = 'operator'
        } else {
            const keySuggestions = getKeySuggestions(columns, ctx.key)
            if (keySuggestions === null) {
                // Async key discovery needed
                suggestionType = 'column'
                suggestions = await getKeyDiscoverySuggestions(columns, ctx.key, onKeyDiscovery, keyCache, setLoading)
            } else {
                suggestions = keySuggestions
                suggestionType = 'column'
            }
        }
    } else if (ctx.expecting === 'operatorOrBool') {
        suggestions = [...getOperatorSuggestions(columns, ctx.key, registry), ...getBoolSuggestions()]
        suggestionType = 'operator'
    } else if (ctx.expecting === 'operatorPrefix') {
        suggestions = getOperatorSuggestions(columns, ctx.key, registry).filter((op) =>
            op.label.startsWith(ctx.keyValueOperator),
        )
        suggestionType = 'operator'
    } else if (ctx.expecting === 'list') {
        suggestions = [{ label: '[]', insertText: '[]', type: 'value', detail: 'empty list', cursorOffset: -1 }]
        suggestionType = 'value'
    } else if (ctx.expecting === 'value') {
        suggestionType = 'value'
        const result = await getValueSuggestions(columns, ctx.key, ctx.value, ctx.quoteChar, onAutocomplete, setLoading)
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
                    ...getOperatorSuggestions(columns, ctx.transformerBaseKey, registry)
                        .filter((s) => s.label !== '|')
                        .map((s) => ({
                            ...s,
                            insertText: s.insertText.startsWith(' ') ? s.insertText : ' ' + s.insertText,
                        })),
                )
                suggestionType = 'operator'
            }
        } else {
            suggestions = getTransformerSuggestions(columns, ctx, registry)
            suggestionType = 'transformer'
            if (suggestions.length === 0) {
                message = 'No matching transformers'
            }
        }
    }

    if (suggestions.length === 0 && !suggestionType && ctx.expecting !== 'none') {
        suggestions = getKeySuggestions(columns, '')
        suggestionType = 'column'
    }

    if (suggestions.length > 0) {
        message = ''
    }

    return { suggestions, suggestionType, incomplete, rawItems, message }
}
