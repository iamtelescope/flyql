import { CharType } from '../core/constants.js'
import { isNumeric } from '../core/utils.js'
import { Parser } from '../core/parser.js'

class Token {
    constructor(char, charType) {
        this.start = char.pos
        this.length = char.value.length
        this.type = charType
        this.value = char.value
        this.line = char.line
        this.linePos = char.linePos
    }

    addChar(char) {
        this.value += char.value
        this.length += char.value.length
    }
}

export const tokenTypes = [
    CharType.KEY,
    CharType.VALUE,
    CharType.OPERATOR,
    CharType.NUMBER,
    CharType.STRING,
    CharType.BOOLEAN,
    CharType.NULL,
    CharType.COLUMN,
]

export function generateMonacoTokens(parser) {
    if (!parser.typedChars || parser.typedChars.length === 0) {
        return []
    }

    const tokens = []
    let token = null

    for (const [char, charType] of parser.typedChars) {
        if (token === null) {
            token = new Token(char, charType)
        } else {
            if (token.type === charType) {
                token.addChar(char)
            } else {
                tokens.push(token)
                token = new Token(char, charType)
            }
        }
    }

    if (token !== null) {
        tokens.push(token)
    }

    for (const token of tokens) {
        if (token.type === CharType.VALUE) {
            if (token.value === 'true' || token.value === 'false') {
                token.type = CharType.BOOLEAN
            } else if (token.value === 'null') {
                token.type = CharType.NULL
            } else if (isNumeric(token.value)) {
                token.type = CharType.NUMBER
            } else if (token.value.length > 0 && token.value[0] !== "'" && token.value[0] !== '"') {
                token.type = CharType.COLUMN
            } else {
                token.type = CharType.STRING
            }
        }
    }

    const data = []
    const tokenModifier = 0
    let prevToken = null

    for (const token of tokens) {
        let deltaLine = 0
        let deltaStart = token.linePos
        let tokenLength = token.length
        let typeIndex = tokenTypes.indexOf(token.type)

        if (prevToken !== null) {
            deltaLine = token.line - prevToken.line
            deltaStart = deltaLine === 0 ? token.start - prevToken.start : token.linePos
        }

        prevToken = token
        data.push(deltaLine, deltaStart, tokenLength, typeIndex, tokenModifier)
    }

    return data
}

/**
 * Convert Diagnostic[] to Monaco IMarkerData[].
 * @param {Diagnostic[]} diagnostics - from diagnose()
 * @param {string} queryText - the original (pre-normalization) query text
 * @returns {object[]} IMarkerData-compatible objects
 */
export function diagnosticsToMarkers(diagnostics, queryText) {
    if (!diagnostics || diagnostics.length === 0) return []

    const lineStarts = [0]
    for (let i = 0; i < queryText.length; i++) {
        if (queryText[i] === '\n') lineStarts.push(i + 1)
    }

    function offsetToPosition(offset) {
        const clamped = Math.min(Math.max(0, offset), queryText.length)
        let line = 0
        for (let i = lineStarts.length - 1; i >= 0; i--) {
            if (lineStarts[i] <= clamped) {
                line = i
                break
            }
        }
        return { lineNumber: line + 1, column: clamped - lineStarts[line] + 1 }
    }

    const SEVERITY = { error: 8, warning: 4 }

    return diagnostics.map((d) => {
        const start = offsetToPosition(d.range.start)
        const end = offsetToPosition(d.range.end)
        return {
            startLineNumber: start.lineNumber,
            startColumn: start.column,
            endLineNumber: end.lineNumber,
            endColumn: end.column,
            message: d.message,
            severity: SEVERITY[d.severity] || 8,
            code: d.code,
        }
    })
}

export function getMonacoTokenProvider() {
    return {
        getLegend: () => ({
            tokenTypes: tokenTypes,
            tokenModifiers: [],
        }),
        provideDocumentSemanticTokens: (model) => {
            const parser = new Parser()
            parser.parse(model.getValue(), false)
            const data = generateMonacoTokens(parser)
            return {
                data: new Uint32Array(data),
                resultId: null,
            }
        },
        releaseDocumentSemanticTokens: () => {},
    }
}
