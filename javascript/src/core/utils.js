export function isNumeric(str) {
    if (typeof str != 'string') return false
    return !isNaN(str) && !isNaN(parseFloat(str))
}

const integerPattern = /^-?\d+$/

export function tryConvertToNumber(value) {
    if (typeof value !== 'string') return value

    if (value === '') return value

    if (integerPattern.test(value)) {
        const n = BigInt(value)
        if (n >= BigInt(Number.MIN_SAFE_INTEGER) && n <= BigInt(Number.MAX_SAFE_INTEGER)) {
            return Number(n)
        }
        return n
    }

    // Use Number() (not parseFloat) so partial matches like "2023-01-01" are rejected
    const n = Number(value)
    if (!isNaN(n)) {
        return n
    }

    return value
}
