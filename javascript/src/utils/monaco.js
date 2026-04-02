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
