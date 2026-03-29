import { Operator, BoolOperator } from '../core/constants.js'
import { defaultRegistry } from '../transformers/index.js'

function isFalsy(value) {
    if (value === null || value === undefined) return true
    if (typeof value === 'boolean') return !value
    if (typeof value === 'number') return value === 0
    if (typeof value === 'bigint') return value === 0n
    if (typeof value === 'string') return value === ''
    if (Array.isArray(value)) return value.length === 0
    if (typeof value === 'object') return Object.keys(value).length === 0
    return false
}

function isTruthy(value) {
    return !isFalsy(value)
}

function toFloat(v) {
    if (typeof v === 'number') return v
    if (typeof v === 'bigint') return Number(v)
    if (typeof v === 'string') {
        const n = Number(v)
        if (!isNaN(n)) return n
    }
    return null
}

function toString(v) {
    if (v === null || v === undefined) return ''
    if (typeof v === 'string') return v
    return String(v)
}

function compareEqual(a, b) {
    if (a === null && b === null) return true
    if (a === null || b === null) return false
    if (a === undefined && b === undefined) return true
    if (a === undefined || b === undefined) return false
    if (typeof a === 'number' && typeof b === 'number') return a === b
    if (typeof a === 'bigint' || typeof b === 'bigint') {
        if (typeof a === 'boolean' || typeof b === 'boolean') return false
        try {
            return BigInt(a) === BigInt(b)
        } catch {
            return false
        }
    }
    return a === b
}

function toBigInt(v) {
    if (typeof v === 'bigint') return v
    if (typeof v === 'number' && Number.isInteger(v)) return BigInt(v)
    return null
}

function compareGreater(a, b) {
    if (typeof a === 'bigint' || typeof b === 'bigint') {
        const aBig = toBigInt(a)
        const bBig = toBigInt(b)
        if (aBig !== null && bBig !== null) return aBig > bBig
    }
    const aNum = toFloat(a)
    const bNum = toFloat(b)
    if (aNum !== null && bNum !== null) return aNum > bNum
    // String comparison fallback (for dates, etc.)
    if (typeof a === 'string' && typeof b === 'string') return a > b
    return false
}

function compareLess(a, b) {
    if (typeof a === 'bigint' || typeof b === 'bigint') {
        const aBig = toBigInt(a)
        const bBig = toBigInt(b)
        if (aBig !== null && bBig !== null) return aBig < bBig
    }
    const aNum = toFloat(a)
    const bNum = toFloat(b)
    if (aNum !== null && bNum !== null) return aNum < bNum
    // String comparison fallback (for dates, etc.)
    if (typeof a === 'string' && typeof b === 'string') return a < b
    return false
}

function evalHas(value, exprValue) {
    if (value === null || value === undefined) return false
    if (typeof value === 'string') return value.includes(toString(exprValue))
    if (Array.isArray(value)) {
        for (const item of value) {
            if (compareEqual(item, exprValue)) return true
        }
        return false
    }
    if (typeof value === 'object') return toString(exprValue) in value
    return false
}

function valueInList(value, list) {
    for (const item of list) {
        if (compareEqual(value, item)) return true
    }
    return false
}

export class Evaluator {
    constructor(registry = null) {
        this.regexCache = new Map()
        this._registry = registry || defaultRegistry()
    }

    getRegex(pattern) {
        if (this.regexCache.has(pattern)) return this.regexCache.get(pattern)
        try {
            const regex = new RegExp(pattern)
            this.regexCache.set(pattern, regex)
            return regex
        } catch {
            return null
        }
    }

    evaluate(node, record) {
        if (!node) return false

        let result

        if (node.expression) {
            result = this.evalExpression(node.expression, record)
        } else {
            let left = null
            let right = null

            if (node.left) left = this.evaluate(node.left, record)
            if (node.right) right = this.evaluate(node.right, record)

            if (left !== null && right !== null) {
                if (node.boolOperator === BoolOperator.AND) {
                    result = left && right
                } else if (node.boolOperator === BoolOperator.OR) {
                    result = left || right
                } else {
                    result = false
                }
            } else if (left !== null) {
                result = left
            } else if (right !== null) {
                result = right
            } else {
                result = false
            }
        }

        if (node.negated) result = !result
        return result
    }

    evalExpression(expr, record) {
        let value = record.getValue(expr.key.raw)

        if (expr.key.transformers && expr.key.transformers.length) {
            for (const tDict of expr.key.transformers) {
                const transformer = this._registry.get(tDict.name)
                if (!transformer) throw new Error(`unknown transformer: ${tDict.name}`)
                value = transformer.apply(value, tDict.arguments || [])
            }
        }

        switch (expr.operator) {
            case Operator.TRUTHY:
                return isTruthy(value)
            case Operator.EQUALS:
                return compareEqual(value, expr.value)
            case Operator.NOT_EQUALS:
                return !compareEqual(value, expr.value)
            case Operator.REGEX: {
                const regex = this.getRegex(toString(expr.value))
                if (!regex) return false
                return regex.test(toString(value))
            }
            case Operator.NOT_REGEX: {
                const regex = this.getRegex(toString(expr.value))
                if (!regex) return true
                return !regex.test(toString(value))
            }
            case Operator.GREATER_THAN:
                return compareGreater(value, expr.value)
            case Operator.LOWER_THAN:
                return compareLess(value, expr.value)
            case Operator.GREATER_OR_EQUALS_THAN:
                return compareGreater(value, expr.value) || compareEqual(value, expr.value)
            case Operator.LOWER_OR_EQUALS_THAN:
                return compareLess(value, expr.value) || compareEqual(value, expr.value)
            case Operator.IN:
                if (!expr.values || expr.values.length === 0) return false
                return valueInList(value, expr.values)
            case Operator.NOT_IN:
                if (!expr.values || expr.values.length === 0) return true
                return !valueInList(value, expr.values)
            case Operator.HAS:
                return evalHas(value, expr.value)
            case Operator.NOT_HAS:
                if (value === null || value === undefined) return true
                return !evalHas(value, expr.value)
            default:
                return false
        }
    }
}
