import { ValueType } from '../types.js'

export function isNumeric(str) {
    if (typeof str != 'string') return false
    return !isNaN(str) && !isNaN(parseFloat(str))
}

const integerPattern = /^-?\d+$/

export function convertUnquotedValue(value) {
    if (typeof value !== 'string') return [value, null]

    if (value === '') return [value, ValueType.COLUMN]

    if (integerPattern.test(value)) {
        const n = BigInt(value)
        if (n >= BigInt(Number.MIN_SAFE_INTEGER) && n <= BigInt(Number.MAX_SAFE_INTEGER)) {
            return [Number(n), ValueType.INTEGER]
        }
        return [n, ValueType.BIGINT]
    }

    // Use Number() (not parseFloat) so partial matches like "2023-01-01" are rejected
    const n = Number(value)
    if (!isNaN(n)) {
        return [n, ValueType.FLOAT]
    }

    return [value, ValueType.COLUMN]
}
