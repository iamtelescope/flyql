import { Operator, BoolOperator } from '../core/constants.js'
import { FlyqlError } from '../core/exceptions.js'
import { LiteralKind } from '../literal/literal_kind.js'
import { FunctionCall, Parameter } from '../core/expression.js'
import { parseKey } from '../core/key.js'
import { defaultRegistry } from '../transformers/index.js'

const DURATION_UNIT_MS = Object.freeze({
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
})

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

const REGEX_META = new Set('.[]{}()*+?^$|\\'.split(''))

function likeToRegex(pattern) {
    let result = '^'
    let escaped = false
    for (let i = 0; i < pattern.length; i++) {
        const ch = pattern[i]
        if (escaped) {
            escaped = false
            result += REGEX_META.has(ch) ? '\\' + ch : ch
        } else if (ch === '\\') {
            escaped = true
        } else if (ch === '%') {
            result += '.*'
        } else if (ch === '_') {
            result += '.'
        } else {
            result += REGEX_META.has(ch) ? '\\' + ch : ch
        }
    }
    if (escaped) {
        result += '\\\\'
    }
    result += '$'
    return result
}

export class Evaluator {
    constructor(registry = null, { defaultTimezone = 'UTC' } = {}) {
        this.regexCache = new Map()
        this._registry = registry || defaultRegistry()
        this._defaultTimezone = defaultTimezone
    }

    getRegex(pattern) {
        if (this.regexCache.has(pattern)) return this.regexCache.get(pattern)
        try {
            const flagMatch = pattern.match(/^\(\?([imsu]+)\)/)
            let flags = ''
            let cleanPattern = pattern
            if (flagMatch) {
                flags = flagMatch[1]
                cleanPattern = pattern.slice(flagMatch[0].length)
            }
            const regex = new RegExp(cleanPattern, flags)
            this.regexCache.set(pattern, regex)
            return regex
        } catch (err) {
            throw new FlyqlError(`invalid regex given: ${pattern} -> ${err.message}`)
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
                    throw new FlyqlError(`Unknown boolean operator: ${node.boolOperator}`)
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

    _resolveColumnValue(rawValue, record) {
        try {
            const key = parseKey(String(rawValue))
            const rootKey = key.segments[0]
            if (record.data[rootKey] !== undefined) {
                return record.getValue(String(rawValue))
            }
        } catch {
            // not a valid key, fall through
        }
        return rawValue
    }

    _resolveInValues(expr, record) {
        if (!expr.valuesTypes) return expr.values
        return expr.values.map((v, i) => {
            if (i < expr.valuesTypes.length && expr.valuesTypes[i] === LiteralKind.COLUMN && typeof v === 'string') {
                return this._resolveColumnValue(v, record)
            }
            return v
        })
    }

    evalExpression(expr, record) {
        if (expr.valueType === LiteralKind.PARAMETER) {
            if (expr.value instanceof Parameter) {
                throw new FlyqlError(
                    `unbound parameter '$${expr.value.name}' \u2014 call bindParams() before evaluating`,
                )
            }
            throw new FlyqlError('unbound parameter \u2014 call bindParams() before evaluating')
        }
        if (expr.values !== null && expr.values !== undefined) {
            for (const v of expr.values) {
                if (v instanceof Parameter) {
                    throw new FlyqlError(
                        `unbound parameter '$${v.name}' in IN list \u2014 call bindParams() before evaluating`,
                    )
                }
            }
        }
        if (expr.value instanceof FunctionCall && expr.value.parameterArgs && expr.value.parameterArgs.length > 0) {
            throw new FlyqlError(
                `unbound parameter(s) in function ${expr.value.name}() \u2014 call bindParams() before evaluating`,
            )
        }
        let value = record.getValue(expr.key.raw)

        if (expr.key.transformers && expr.key.transformers.length) {
            for (const tDict of expr.key.transformers) {
                const transformer = this._registry.get(tDict.name)
                if (!transformer) throw new Error(`unknown transformer: ${tDict.name}`)
                value = transformer.apply(value, tDict.arguments || [])
            }
        }

        // Resolve COLUMN-typed RHS values from the record
        let exprValue = expr.value
        if (expr.valueType === LiteralKind.COLUMN && typeof exprValue === 'string') {
            exprValue = this._resolveColumnValue(exprValue, record)
        } else if (expr.valueType === LiteralKind.FUNCTION && exprValue instanceof FunctionCall) {
            exprValue = this._evaluateFunctionCall(exprValue, this._defaultTimezone)
            value = this._coerceToMs(value)
            if (value === null) return false
        }

        switch (expr.operator) {
            case Operator.TRUTHY:
                return isTruthy(value)
            case Operator.EQUALS:
                return compareEqual(value, exprValue)
            case Operator.NOT_EQUALS:
                if (exprValue === null) return !compareEqual(value, exprValue)
                if (value === null || value === undefined) return false
                return !compareEqual(value, exprValue)
            case Operator.REGEX: {
                const regex = this.getRegex(toString(exprValue))
                return regex.test(toString(value))
            }
            case Operator.NOT_REGEX: {
                if (value === null || value === undefined) return false
                const regex = this.getRegex(toString(exprValue))
                return !regex.test(toString(value))
            }
            case Operator.LIKE: {
                const regex = this.getRegex(likeToRegex(toString(exprValue)))
                return regex.test(toString(value))
            }
            case Operator.NOT_LIKE: {
                if (value === null || value === undefined) return false
                const regex = this.getRegex(likeToRegex(toString(exprValue)))
                return !regex.test(toString(value))
            }
            case Operator.ILIKE: {
                const regex = this.getRegex('(?i)' + likeToRegex(toString(exprValue)))
                return regex.test(toString(value))
            }
            case Operator.NOT_ILIKE: {
                if (value === null || value === undefined) return false
                const regex = this.getRegex('(?i)' + likeToRegex(toString(exprValue)))
                return !regex.test(toString(value))
            }
            case Operator.GREATER_THAN:
                return compareGreater(value, exprValue)
            case Operator.LOWER_THAN:
                return compareLess(value, exprValue)
            case Operator.GREATER_OR_EQUALS_THAN:
                return compareGreater(value, exprValue) || compareEqual(value, exprValue)
            case Operator.LOWER_OR_EQUALS_THAN:
                return compareLess(value, exprValue) || compareEqual(value, exprValue)
            case Operator.IN:
                if (!expr.values || expr.values.length === 0) return false
                return valueInList(value, this._resolveInValues(expr, record))
            case Operator.NOT_IN:
                if (!expr.values || expr.values.length === 0) return true
                if (value === null || value === undefined) return false
                return !valueInList(value, this._resolveInValues(expr, record))
            case Operator.HAS:
                return evalHas(value, exprValue)
            case Operator.NOT_HAS:
                if (value === null || value === undefined) return false
                return !evalHas(value, exprValue)
            default:
                throw new FlyqlError(`Unknown expression operator: ${expr.operator}`)
        }
    }

    _coerceToMs(value) {
        if (typeof value === 'number') return value
        if (typeof value === 'string') {
            const ms = new Date(value).getTime()
            return Number.isNaN(ms) ? null : ms
        }
        return null
    }

    _sumDurations(durations) {
        let total = 0
        for (const dur of durations) {
            const factor = DURATION_UNIT_MS[dur.unit]
            if (!factor) throw new FlyqlError(`unknown duration unit: ${dur.unit}`)
            total += dur.value * factor
        }
        return total
    }

    _midnightInTz(tz) {
        const fmt = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        })
        const parts = {}
        for (const p of fmt.formatToParts(new Date())) {
            parts[p.type] = p.value
        }
        const iso = `${parts.year}-${parts.month}-${parts.day}T00:00:00`
        // Build a Date that represents midnight in the given timezone
        // by computing the offset between UTC and the tz at that date.
        const utcGuess = new Date(iso + 'Z')
        const fmtFull = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        })
        // Iteratively find the UTC ms that corresponds to midnight in tz
        const targetParts = {}
        for (const p of fmtFull.formatToParts(utcGuess)) {
            targetParts[p.type] = p.value
        }
        const hourInTz = parseInt(targetParts.hour === '24' ? '0' : targetParts.hour, 10)
        const minuteInTz = parseInt(targetParts.minute, 10)
        const secondInTz = parseInt(targetParts.second, 10)
        const offsetMs = (hourInTz * 3600 + minuteInTz * 60 + secondInTz) * 1000
        let midnight = utcGuess.getTime() - offsetMs
        // Verify the date didn't shift (DST edge case)
        const checkFmt = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        })
        const checkParts = {}
        for (const p of checkFmt.formatToParts(new Date(midnight))) {
            checkParts[p.type] = p.value
        }
        if (checkParts.day !== parts.day) {
            midnight += 86_400_000
        }
        return midnight
    }

    _midnightOfDateInTz(tz, year, month, day) {
        const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`
        const utcGuess = new Date(iso + 'Z')
        const fmtFull = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        })
        const targetParts = {}
        for (const p of fmtFull.formatToParts(utcGuess)) {
            targetParts[p.type] = p.value
        }
        const hourInTz = parseInt(targetParts.hour === '24' ? '0' : targetParts.hour, 10)
        const minuteInTz = parseInt(targetParts.minute, 10)
        const secondInTz = parseInt(targetParts.second, 10)
        const offsetMs = (hourInTz * 3600 + minuteInTz * 60 + secondInTz) * 1000
        let midnight = utcGuess.getTime() - offsetMs
        const checkFmt = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            day: '2-digit',
        })
        const checkParts = {}
        for (const p of checkFmt.formatToParts(new Date(midnight))) {
            checkParts[p.type] = p.value
        }
        if (parseInt(checkParts.day, 10) !== day) {
            midnight += 86_400_000
        }
        return midnight
    }

    _startOfWeekInTz(tz) {
        const fmt = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            weekday: 'short',
        })
        const parts = {}
        for (const p of fmt.formatToParts(new Date())) {
            parts[p.type] = p.value
        }
        const dayMap = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
        const dayOffset = dayMap[parts.weekday] ?? 0
        // Use calendar-aware date subtraction to avoid DST issues
        const d = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`)
        d.setUTCDate(d.getUTCDate() - dayOffset)
        return this._midnightOfDateInTz(tz, d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
    }

    _startOfMonthInTz(tz) {
        const fmt = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
        })
        const parts = {}
        for (const p of fmt.formatToParts(new Date())) {
            parts[p.type] = p.value
        }
        return this._midnightOfDateInTz(tz, parseInt(parts.year, 10), parseInt(parts.month, 10), 1)
    }

    _evaluateFunctionCall(fc, defaultTz) {
        const tz = fc.timezone || defaultTz || 'UTC'
        const name = fc.name.toLowerCase()

        switch (name) {
            case 'now':
                return Date.now()

            case 'ago': {
                if (!fc.durationArgs || fc.durationArgs.length === 0) {
                    throw new FlyqlError('ago() requires at least one duration argument')
                }
                return Date.now() - this._sumDurations(fc.durationArgs)
            }

            case 'today':
                return this._midnightInTz(tz)

            case 'startof': {
                const unit = fc.unit.toLowerCase()
                if (unit === 'day') return this._midnightInTz(tz)
                if (unit === 'week') return this._startOfWeekInTz(tz)
                if (unit === 'month') return this._startOfMonthInTz(tz)
                throw new FlyqlError(`unsupported startOf unit: ${fc.unit}`)
            }

            default:
                throw new FlyqlError(`unknown temporal function: ${fc.name}`)
        }
    }
}
