export function isNumeric(str) {
    if (typeof str != 'string') return false
    return !isNaN(str) && !isNaN(parseFloat(str))
}

export function tryConvertToNumber(value) {
    if (typeof value !== 'string') return value

    if (value === '') return value

    if (!isNaN(value) && !isNaN(parseFloat(value))) {
        const num = parseFloat(value)
        return num
    }

    return value
}