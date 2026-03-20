/**
 * Suggestion generation from parser state + schema — pure JS, no framework dependencies.
 */

import { Operator, VALID_KEY_VALUE_OPERATORS, isNumeric } from '../core/index.js'

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
}

export const STATE_LABELS = {
    column: 'column name',
    operator: 'operator',
    operatorPrefix: 'operator',
    operatorOrBool: 'operator or boolean',
    value: 'value',
    boolOp: 'boolean operator',
}

export function getKeySuggestions(columns, prefix) {
    const result = []
    const lowerPrefix = prefix.toLowerCase()
    for (const name of Object.keys(columns)) {
        const col = columns[name]
        if (!col.suggest) continue
        if (lowerPrefix && !name.toLowerCase().startsWith(lowerPrefix)) continue
        result.push({
            label: name,
            insertText: name,
            type: 'column',
            detail: col.type,
        })
    }
    return result
}

export function getOperatorSuggestions(columns, fieldName) {
    const col = columns[fieldName]
    const ops = [
        { label: Operator.EQUALS, insertText: Operator.EQUALS, sortText: 'a' },
        { label: Operator.NOT_EQUALS, insertText: Operator.NOT_EQUALS, sortText: 'b' },
        { label: Operator.GREATER_THAN, insertText: Operator.GREATER_THAN, sortText: 'e' },
        { label: Operator.GREATER_OR_EQUALS_THAN, insertText: Operator.GREATER_OR_EQUALS_THAN, sortText: 'f' },
        { label: Operator.LOWER_THAN, insertText: Operator.LOWER_THAN, sortText: 'g' },
        { label: Operator.LOWER_OR_EQUALS_THAN, insertText: Operator.LOWER_OR_EQUALS_THAN, sortText: 'h' },
        { label: Operator.IN, insertText: ' ' + Operator.IN + ' ', sortText: 'i' },
    ]
    if (!col || (col.type !== 'enum' && col.type !== 'number')) {
        ops.push({ label: Operator.REGEX, insertText: Operator.REGEX, sortText: 'c' })
        ops.push({ label: Operator.NOT_REGEX, insertText: Operator.NOT_REGEX, sortText: 'd' })
    }
    ops.sort((a, b) => a.sortText.localeCompare(b.sortText))
    return ops.map((op) => ({
        label: op.label,
        insertText: op.insertText,
        type: 'operator',
        detail: OPERATOR_NAMES[op.label] || '',
    }))
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

export async function getValueSuggestions(columns, key, value, quoteChar, onAutocomplete, valueCache, setLoading) {
    const col = columns[key]
    if (!col) return { suggestions: [], message: '' }
    if (!col.autocomplete) {
        return { suggestions: [], message: 'Autocompletion is disabled for this column' }
    }

    if (col.values && col.values.length > 0) {
        return { suggestions: prepareSuggestionValues(col.values, quoteChar, value), message: '' }
    }

    if (onAutocomplete) {
        if (valueCache[key]) {
            return { suggestions: prepareSuggestionValues(valueCache[key], quoteChar, value), message: '' }
        }
        const loadingTimer = setTimeout(() => {
            setLoading(true)
        }, 200)
        try {
            // Fetch full list (empty prefix) so cache is complete for client-side filtering
            const result = await onAutocomplete(key, '')
            if (result && result.items) {
                valueCache[key] = result.items
                return { suggestions: prepareSuggestionValues(result.items, quoteChar, value), message: '' }
            }
        } finally {
            clearTimeout(loadingTimer)
            setLoading(false)
        }
    }
    return { suggestions: [], message: '' }
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

    if (ctx.expecting === 'column') {
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
        const match = ctx.textBeforeCursor.match(/(\S*)$/)
        const wordLen = match ? match[1].length : 0
        return { start: cursorPos - wordLen, end: endPos }
    }

    return { start: cursorPos, end: cursorPos }
}

export async function updateSuggestions(ctx, columns, onAutocomplete, valueCache, setLoading) {
    let message = ''
    let suggestions = []
    let suggestionType = ''

    if (!ctx) {
        suggestions = getKeySuggestions(columns, '')
        suggestionType = 'column'
        return { suggestions, suggestionType, message }
    }

    if (ctx.state === 'ERROR') {
        return { suggestions: [], suggestionType: '', message: ctx.error }
    }

    const columnNames = Object.keys(columns)

    if (ctx.expecting === 'column') {
        if (columnNames.includes(ctx.key)) {
            suggestions = getOperatorSuggestions(columns, ctx.key)
            suggestionType = 'operator'
        } else {
            suggestions = getKeySuggestions(columns, ctx.key)
            suggestionType = 'column'
        }
    } else if (ctx.expecting === 'operatorOrBool') {
        suggestions = [...getOperatorSuggestions(columns, ctx.key), ...getBoolSuggestions()]
        suggestionType = 'operator'
    } else if (ctx.expecting === 'operatorPrefix') {
        suggestions = getOperatorSuggestions(columns, ctx.key).filter((op) => op.label.startsWith(ctx.keyValueOperator))
        suggestionType = 'operator'
    } else if (ctx.expecting === 'list') {
        suggestions = [{ label: '[]', insertText: '[]', type: 'value', detail: 'empty list', cursorOffset: -1 }]
        suggestionType = 'value'
    } else if (ctx.expecting === 'value') {
        suggestionType = 'value'
        const result = await getValueSuggestions(
            columns,
            ctx.key,
            ctx.value,
            ctx.quoteChar,
            onAutocomplete,
            valueCache,
            setLoading,
        )
        suggestions = result.suggestions
        message = result.message
    } else if (ctx.expecting === 'boolOp') {
        suggestions = getBoolSuggestions()
        suggestionType = 'boolOp'
    }

    if (suggestions.length === 0 && !suggestionType && ctx.expecting !== 'none') {
        suggestions = getKeySuggestions(columns, '')
        suggestionType = 'column'
    }

    if (suggestions.length > 0) {
        message = ''
    }

    return { suggestions, suggestionType, message }
}
