import { Parser as QueryParser, CharType as QueryCharType } from './core/index.js'
import { Parser as ColumnsParser, CharType as ColumnsCharType } from './columns/index.js'

const NUMERIC_RE = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/

function isNumericToken(s) {
    return NUMERIC_RE.test(s)
}

function upgradeQueryValue(text) {
    if (text === 'true' || text === 'false') return QueryCharType.BOOLEAN
    if (text === 'null') return QueryCharType.NULL
    if (isNumericToken(text)) return QueryCharType.NUMBER
    if (text.length > 0 && (text[0] === "'" || text[0] === '"')) return QueryCharType.STRING
    return QueryCharType.COLUMN
}

/**
 * Pure tokenizer: groups consecutive parser typed chars of the same CharType
 * into tokens with the shape { text, type, start, end }. Applies the canonical
 * VALUE upgrade in query mode. Appends a trailing ERROR token if the parser
 * halted before consuming the full input.
 *
 * @param {string} text - FlyQL expression
 * @param {object} [options]
 * @param {'query'|'columns'} [options.mode='query']
 * @returns {Array<{text: string, type: string, start: number, end: number}>}
 */
export function tokenize(text, options = {}) {
    const mode = options.mode || 'query'
    if (!text) return []

    let typedChars
    if (mode === 'columns') {
        const parser = new ColumnsParser({ transformers: true })
        parser.parse(text, false, false)
        typedChars = parser.typedChars || []
    } else {
        const parser = new QueryParser()
        parser.parse(text, false, false)
        typedChars = parser.typedChars || []
    }

    const tokens = []
    let curText = ''
    let curType = null
    let curStart = 0

    for (const [char, charType] of typedChars) {
        if (curType === null) {
            curText = char.value
            curType = charType
            curStart = char.pos
        } else if (charType === curType) {
            curText += char.value
        } else {
            tokens.push({
                text: curText,
                type: curType,
                start: curStart,
                end: curStart + curText.length,
            })
            curText = char.value
            curType = charType
            curStart = char.pos
        }
    }
    if (curType !== null) {
        tokens.push({
            text: curText,
            type: curType,
            start: curStart,
            end: curStart + curText.length,
        })
    }

    if (mode === 'query') {
        for (const token of tokens) {
            if (token.type === QueryCharType.VALUE) {
                token.type = upgradeQueryValue(token.text)
            }
        }
    }

    const consumed = tokens.length > 0 ? tokens[tokens.length - 1].end : 0
    if (consumed < text.length) {
        tokens.push({
            text: text.slice(consumed),
            type: mode === 'columns' ? ColumnsCharType.ERROR : QueryCharType.ERROR,
            start: consumed,
            end: text.length,
        })
    }

    return tokens
}
