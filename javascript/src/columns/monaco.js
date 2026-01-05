import { CharType, tokenTypes } from './constants.js'
import { Parser } from './parser.js'

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

export { tokenTypes }

export function getMonacoTokenProvider() {
    return {
        getLegend: () => ({
            tokenTypes: tokenTypes,
            tokenModifiers: [],
        }),
        provideDocumentSemanticTokens: (model) => {
            const parser = new Parser()
            parser.parse(model.getValue(), false, true)
            const data = parser.generateMonacoTokens()
            return {
                data: new Uint32Array(data),
                resultId: null,
            }
        },
        releaseDocumentSemanticTokens: () => {},
    }
}

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
