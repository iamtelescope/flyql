import { KeyParseError } from './exceptions.js'
import { Range } from './range.js'

/**
 * Transformer — a parsed transformer invocation from a key pipeline
 * (e.g. upper or format("YYYY")). Carries source ranges so tooling
 * can map the AST back to the raw input.
 */
export class Transformer {
    constructor(name, args, range, nameRange, argumentRanges = []) {
        this.name = name
        this.arguments = args
        this.range = range
        this.nameRange = nameRange
        this.argumentRanges = argumentRanges
    }
}

export class Key {
    constructor(segments, raw = null, transformers = [], quotedSegments = null, range = null, segmentRanges = null) {
        this.segments = segments
        this.isSegmented = segments.length > 1
        this.raw = raw !== null ? raw : segments.join('.')
        this.transformers = transformers
        this.quotedSegments = quotedSegments !== null ? quotedSegments : segments.map(() => false)
        if (range === null) {
            range = new Range(0, this.raw.length)
        }
        if (segmentRanges === null) {
            segmentRanges = []
            let off = 0
            for (const seg of segments) {
                segmentRanges.push(new Range(off, off + seg.length))
                off += seg.length + 1
            }
        }
        this.range = range
        this.segmentRanges = segmentRanges
    }
}

export class KeyParser {
    constructor() {
        this.input = ''
        this.pos = 0
        this.baseOffset = 0
        this.segments = []
        this.quotedSegments = []
        this.segmentRanges = []
        this.currentSegment = ''
        this.currentSegmentQuoted = false
        this.currentSegmentHasContent = false
        this.currentSegmentStart = -1
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
            this.advance()
            return "'"
        } else if (char === '"') {
            this.advance()
            return '"'
        } else if (char === '\\') {
            this.advance()
            return '\\'
        } else if (char === 'n') {
            this.advance()
            return '\n'
        } else if (char === 't') {
            this.advance()
            return '\t'
        } else if (char !== null) {
            const result = char
            this.advance()
            return result
        } else {
            throw new KeyParseError(
                `Key parsing error: Incomplete escape sequence at position ${this.pos}`,
                new Range(this.baseOffset + this.pos, this.baseOffset + this.pos + 1),
            )
        }
    }

    parseQuotedSegment(quoteChar) {
        if (!this.currentSegmentHasContent && this.currentSegmentStart === -1) {
            this.currentSegmentStart = this.pos
        }
        this.advance() // Skip opening quote
        this.currentSegmentQuoted = true

        while (this.peek() !== null) {
            const char = this.peek()

            if (char === '\\') {
                this.currentSegment += this.parseEscapeSequence()
            } else if (char === quoteChar) {
                this.advance()
                return
            } else {
                const c = this.advance()
                if (c !== null) {
                    this.currentSegment += c
                }
            }
        }

        throw new KeyParseError(
            `Key parsing error: Unterminated quoted segment starting at position ${this.pos}`,
            new Range(this.baseOffset + this.pos, this.baseOffset + this.pos),
        )
    }

    parseNormalSegment() {
        while (this.peek() !== null) {
            const char = this.peek()

            if (char === '.') {
                return
            } else if (char === "'") {
                this.parseQuotedSegment("'")
                this.currentSegmentHasContent = true
            } else if (char === '"') {
                this.parseQuotedSegment('"')
                this.currentSegmentHasContent = true
            } else if (char === '\\') {
                if (this.currentSegmentStart === -1) {
                    this.currentSegmentStart = this.pos
                }
                this.currentSegment += this.parseEscapeSequence()
                this.currentSegmentHasContent = true
            } else {
                if (this.currentSegmentStart === -1) {
                    this.currentSegmentStart = this.pos
                }
                const c = this.advance()
                if (c !== null) {
                    this.currentSegment += c
                }
                this.currentSegmentHasContent = true
            }
        }
    }

    parse(keyString, baseOffset = 0) {
        this.input = keyString
        this.pos = 0
        this.baseOffset = baseOffset
        this.segments = []
        this.quotedSegments = []
        this.segmentRanges = []
        this.currentSegment = ''
        this.currentSegmentQuoted = false
        this.currentSegmentHasContent = false
        this.currentSegmentStart = -1

        const keyRange = new Range(baseOffset, baseOffset + keyString.length)

        if (!this.input) {
            return new Key([], this.input, [], [], keyRange, [])
        }

        while (this.pos < this.input.length) {
            const segStartBefore = this.pos
            this.parseNormalSegment()
            const segEnd = this.pos

            let segStart
            if (this.currentSegmentStart === -1) {
                segStart = this.baseOffset + segStartBefore
            } else {
                segStart = this.baseOffset + this.currentSegmentStart
            }

            this.segments.push(this.currentSegment)
            this.quotedSegments.push(this.currentSegmentQuoted)
            this.segmentRanges.push(new Range(segStart, this.baseOffset + segEnd))
            this.currentSegment = ''
            this.currentSegmentQuoted = false
            this.currentSegmentHasContent = false
            this.currentSegmentStart = -1

            if (this.peek() === '.') {
                this.advance()
                if (this.pos >= this.input.length) {
                    this.segments.push('')
                    this.quotedSegments.push(false)
                    this.segmentRanges.push(new Range(this.baseOffset + this.pos, this.baseOffset + this.pos))
                }
            }
        }

        return new Key(this.segments, this.input, [], this.quotedSegments, keyRange, this.segmentRanges)
    }
}

function parseTransformerArguments(argsStr, baseOffset) {
    const args = []
    const ranges = []
    let i = 0
    while (i < argsStr.length) {
        while (i < argsStr.length && argsStr[i] === ' ') i++
        if (i >= argsStr.length) break

        const argStart = i
        if (argsStr[i] === '"' || argsStr[i] === "'") {
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
            if (i < argsStr.length) {
                i++ // skip closing quote
            } else {
                throw new KeyParseError(
                    'unclosed string in transformer arguments',
                    new Range(baseOffset + argStart, baseOffset + i),
                )
            }
            const argEnd = i
            args.push(val)
            ranges.push(new Range(baseOffset + argStart, baseOffset + argEnd))
        } else {
            let val = ''
            while (i < argsStr.length && argsStr[i] !== ',' && argsStr[i] !== ' ') {
                val += argsStr[i]
                i++
            }
            const argEnd = i
            const num = Number(val)
            args.push(val !== '' && !isNaN(num) ? num : val)
            ranges.push(new Range(baseOffset + argStart, baseOffset + argEnd))
        }
        while (i < argsStr.length && (argsStr[i] === ' ' || argsStr[i] === ',')) i++
    }
    return { args, ranges }
}

function parseTransformerSpec(spec, baseOffset) {
    const parenIndex = spec.indexOf('(')
    if (parenIndex === -1) {
        return new Transformer(
            spec,
            [],
            new Range(baseOffset, baseOffset + spec.length),
            new Range(baseOffset, baseOffset + spec.length),
            [],
        )
    }
    const name = spec.substring(0, parenIndex)
    const closeIndex = spec.lastIndexOf(')')
    if (closeIndex === -1) {
        const partialArgsStr = spec.substring(parenIndex + 1)
        const { args, ranges } =
            partialArgsStr.length > 0
                ? parseTransformerArguments(partialArgsStr, baseOffset + parenIndex + 1)
                : { args: [], ranges: [] }
        return new Transformer(
            name,
            args,
            new Range(baseOffset, baseOffset + spec.length),
            new Range(baseOffset, baseOffset + parenIndex),
            ranges,
        )
    }
    const argsStr = spec.substring(parenIndex + 1, closeIndex)
    const { args, ranges } = parseTransformerArguments(argsStr, baseOffset + parenIndex + 1)
    return new Transformer(
        name,
        args,
        new Range(baseOffset, baseOffset + spec.length),
        new Range(baseOffset, baseOffset + parenIndex),
        ranges,
    )
}

export function parseKey(keyString, baseOffset = 0) {
    const parts = keyString.split('|')
    const baseKeyString = parts[0]
    const transformerSpecs = parts.length > 1 ? parts.slice(1) : []

    const parser = new KeyParser()
    const key = parser.parse(baseKeyString, baseOffset)

    if (transformerSpecs.length > 0) {
        let runningOffset = baseOffset + baseKeyString.length + 1
        key.transformers = transformerSpecs.map((spec) => {
            const parsed = parseTransformerSpec(spec, runningOffset)
            if (!parsed.name) {
                throw new KeyParseError(
                    'empty transformer name in key',
                    new Range(runningOffset, runningOffset + spec.length),
                )
            }
            runningOffset += spec.length + 1
            return parsed
        })
        key.raw = keyString
        key.range = new Range(baseOffset, baseOffset + keyString.length)
    }

    return key
}
