import { FlyqlError } from './exceptions.js'

export class Key {
    constructor(segments, raw = null, transformers = [], quotedSegments = null) {
        this.segments = segments
        this.isSegmented = segments.length > 1
        this.raw = raw !== null ? raw : segments.join('.')
        this.transformers = transformers
        this.quotedSegments = quotedSegments !== null ? quotedSegments : segments.map(() => false)
    }
}

export class KeyParser {
    constructor() {
        this.input = ''
        this.pos = 0
        this.segments = []
        this.quotedSegments = []
        this.currentSegment = ''
        this.currentSegmentQuoted = false
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
        this.currentSegmentQuoted = true

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

            if (char === '.') {
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
        this.quotedSegments = []
        this.currentSegment = ''
        this.currentSegmentQuoted = false

        if (!this.input) {
            return new Key([], this.input)
        }

        while (this.pos < this.input.length) {
            this.parseNormalSegment()

            this.segments.push(this.currentSegment)
            this.quotedSegments.push(this.currentSegmentQuoted)
            this.currentSegment = ''
            this.currentSegmentQuoted = false

            if (this.peek() === '.') {
                this.advance() // Skip dot
                // If we're at the end after a dot, add empty segment
                if (this.pos >= this.input.length) {
                    this.segments.push('')
                    this.quotedSegments.push(false)
                }
            }
        }

        return new Key(this.segments, this.input, [], this.quotedSegments)
    }
}

function parseTransformerArguments(argsStr) {
    const args = []
    let i = 0
    while (i < argsStr.length) {
        // Skip whitespace
        while (i < argsStr.length && argsStr[i] === ' ') i++
        if (i >= argsStr.length) break

        if (argsStr[i] === '"' || argsStr[i] === "'") {
            // Quoted string argument
            const quote = argsStr[i]
            i++
            let val = ''
            while (i < argsStr.length && argsStr[i] !== quote) {
                if (argsStr[i] === '\\' && i + 1 < argsStr.length) {
                    i++
                    if (argsStr[i] === 't') val += '\t'
                    else if (argsStr[i] === 'n') val += '\n'
                    else val += argsStr[i]
                } else {
                    val += argsStr[i]
                }
                i++
            }
            if (i < argsStr.length) i++ // skip closing quote
            args.push(val)
        } else {
            // Unquoted argument (number or bare string)
            let val = ''
            while (i < argsStr.length && argsStr[i] !== ',' && argsStr[i] !== ' ') {
                val += argsStr[i]
                i++
            }
            const num = Number(val)
            args.push(isNaN(num) ? val : num)
        }
        // Skip whitespace and comma
        while (i < argsStr.length && (argsStr[i] === ' ' || argsStr[i] === ',')) i++
    }
    return args
}

function parseTransformerSpec(spec) {
    const parenIndex = spec.indexOf('(')
    if (parenIndex === -1) {
        return { name: spec, arguments: [] }
    }
    const name = spec.substring(0, parenIndex)
    const closeIndex = spec.lastIndexOf(')')
    if (closeIndex === -1) {
        return { name: spec, arguments: [] }
    }
    const argsStr = spec.substring(parenIndex + 1, closeIndex)
    return { name, arguments: parseTransformerArguments(argsStr) }
}

export function parseKey(keyString) {
    const parts = keyString.split('|')
    const baseKeyString = parts[0]
    const transformerSpecs = parts.length > 1 ? parts.slice(1) : []

    const parser = new KeyParser()
    const key = parser.parse(baseKeyString)

    if (transformerSpecs.length > 0) {
        key.transformers = transformerSpecs.map((spec) => {
            const parsed = parseTransformerSpec(spec)
            if (!parsed.name) {
                throw new FlyqlError('empty transformer name in key')
            }
            return parsed
        })
        key.raw = keyString
    }

    return key
}
