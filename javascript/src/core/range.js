/**
 * Range — a half-open character-offset span [start, end) into the raw
 * input string that the parser received. Offsets are indexed per
 * JavaScript's native string semantics (UTF-16 code units via s[i]). For
 * pure-ASCII input these offsets coincide with the Python (code points)
 * and Go (bytes) implementations.
 */
export class Range {
    constructor(start, end) {
        this.start = start
        this.end = end
    }
}
