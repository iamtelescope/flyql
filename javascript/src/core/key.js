import { FlyqlError } from './exceptions.js'

export class Key {
    constructor(segments, raw = null) {
        this.segments = segments
        this.isSegmented = segments.length > 1
        this.raw = raw !== null ? raw : segments.join(':')
    }
}

export class KeyParser {
    constructor() {
        this.input = ''
        this.pos = 0
        this.segments = []
        this.currentSegment = ''
    }

    peek(offset = 0) {
        const pos = this.pos + offset
        return pos < this.input.length ? this.input[pos] : null
    }

    advance() {
        const char = this.peek()
        this.pos += 1
        return char
    }

    parseEscapeSequence() {
        this.advance() // Skip backslash
        const char = this.peek()

        if (char === "'") {
            this.advance() // Skip the escaped character
            return "'"
        } else if (char === '"') {
            this.advance() // Skip the escaped character
            return '"'
        } else if (char === '\\') {
            this.advance() // Skip the escaped character
            return '\\'
        } else if (char === 'n') {
            this.advance() // Skip the escaped character
            return '\n'
        } else if (char === 't') {
            this.advance() // Skip the escaped character
            return '\t'
        } else if (char !== null) {
            const result = char
            this.advance() // Skip the escaped character
            return result // Return the character as-is for unknown escapes
        } else {
            throw new FlyqlError(`Key parsing error: Incomplete escape sequence at position ${this.pos}`)
        }
    }

    parseQuotedSegment(quoteChar) {
        this.advance() // Skip opening quote

        while (this.peek() !== null) {
            const char = this.peek()

            if (char === '\\') {
                this.currentSegment += this.parseEscapeSequence()
            } else if (char === quoteChar) {
                this.advance() // Skip closing quote
                return
            } else {
                const char = this.advance()
                if (char !== null) {
                    this.currentSegment += char
                }
            }
        }

        throw new FlyqlError(`Key parsing error: Unterminated quoted segment starting at position ${this.pos}`)
    }

    parseNormalSegment() {
        while (this.peek() !== null) {
            const char = this.peek()

            if (char === ':') {
                return
            } else if (char === "'") {
                this.parseQuotedSegment("'")
            } else if (char === '"') {
                this.parseQuotedSegment('"')
            } else if (char === '\\') {
                this.currentSegment += this.parseEscapeSequence()
            } else {
                const char = this.advance()
                if (char !== null) {
                    this.currentSegment += char
                }
            }
        }
    }

    parse(keyString) {
        this.input = keyString
        this.pos = 0
        this.segments = []
        this.currentSegment = ''

        if (!this.input) {
            return new Key([], this.input)
        }

        while (this.pos < this.input.length) {
            this.parseNormalSegment()

            this.segments.push(this.currentSegment)
            this.currentSegment = ''

            if (this.peek() === ':') {
                this.advance() // Skip colon
                // If we're at the end after a colon, add empty segment
                if (this.pos >= this.input.length) {
                    this.segments.push('')
                }
            }
        }

        return new Key(this.segments, this.input)
    }
}

export function parseKey(keyString) {
    const parser = new KeyParser()
    return parser.parse(keyString)
}
