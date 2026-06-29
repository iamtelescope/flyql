/**
 * Range — a half-open character-offset span [start, end) into the raw
 * input string that the parser received. Offsets are indexed per
 * code points: the parser scans the input as an array of code points
 * (Array.from(text)), so each character — ASCII or not, including astral
 * (non-BMP) characters — advances the offset by exactly one. These offsets
 * coincide with the Python (code points) and Go (code points / runes)
 * implementations for all input.
 */
export class Range {
    constructor(start, end) {
        this.start = start
        this.end = end
    }
}
