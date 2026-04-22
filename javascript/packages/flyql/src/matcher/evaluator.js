import { Operator, BoolOperator } from '../core/constants.js'
import { FlyqlError } from '../core/exceptions.js'
import { LiteralKind } from '../literal/literal_kind.js'
import { FunctionCall, Parameter } from '../core/expression.js'
import { parseKey } from '../core/key.js'
import { defaultRegistry } from '../transformers/index.js'
import { Type } from '../flyql_type.js'

const DURATION_UNIT_MS = Object.freeze({
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
})

// Detects strings carrying a time-of-day component after a T or space
// separator (HH:MM at minimum). Used by the Type.Date migration warning
// to avoid false positives on trailing whitespace / bare `T` / names
// that happen to contain a space.
const DATETIME_SHAPED_STR_RE = /\d[T ]\d{2}:\d{2}/

const TEMPORAL_ELIGIBLE_KINDS = new Set([
    LiteralKind.STRING,
    LiteralKind.FUNCTION,
    LiteralKind.INTEGER,
    LiteralKind.FLOAT,
    LiteralKind.BIGINT,
])

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

/**
 * Pack Y/M/D into a single number (Y*10000 + M*100 + D) whose numeric
 * ordering mirrors calendar ordering (Decision 27).
 */
function packDate(year, month, day) {
    return year * 10000 + month * 100 + day
}

/**
 * Matcher evaluator for parsed flyql expressions against Record data.
 *
 * @threadsafe no — construct one Evaluator per request/worker. All
 * internal caches (regexCache, _formatterCache, _exprColumnCache,
 * _migrationWarned, _invalidTzWarned) are unprotected mutable
 * Map/Set/WeakMap state.
 *
 * Warning channel (JS): invalid timezones and Date→DateTime migration
 * warnings go to `console.warn`. Python's matcher emits via both
 * `warnings.warn(UserWarning)` and `logging.getLogger("flyql")`; Go's
 * matcher uses `log.Printf` (stdlib log). Consumers needing
 * cross-language scraping must check all three channels.
 */
export class Evaluator {
    constructor(optionsOrRegistry = null, maybeOpts = {}) {
        // Backward compat: support both old `new Evaluator(registry, {defaultTimezone})`
        // and new options-bag `new Evaluator({ registry, defaultTimezone, columns })`.
        let registry
        let defaultTimezone = 'UTC'
        let columns = null
        if (optionsOrRegistry !== null && typeof optionsOrRegistry === 'object' && !optionsOrRegistry.get) {
            const opts = optionsOrRegistry
            registry = opts.registry || null
            defaultTimezone = opts.defaultTimezone || 'UTC'
            columns = opts.columns || null
        } else {
            registry = optionsOrRegistry
            defaultTimezone = maybeOpts.defaultTimezone || 'UTC'
            columns = maybeOpts.columns || null
        }
        this.regexCache = new Map()
        this._registry = registry || defaultRegistry()
        this._defaultTimezone = defaultTimezone
        this._columns = columns
        // Per Decision 25: cache Intl.DateTimeFormat keyed by `${tz}|${sig}`.
        this._formatterCache = new Map()
        // AC 25 parity assertion: set of resolved tz names touched by the cache.
        this._tzNamesSeen = new Set()
        // Per Decision 26: cache column lookups by Expression identity via WeakMap.
        this._exprColumnCache = new WeakMap()
        // Migration warning dedup by Column.matchName (F45/F59).
        this._migrationWarned = new Set()
        this._invalidTzWarned = new Set()
    }

    /**
     * Apply the tz-fallback order from Decision 25 and return a resolved
     * (valid) IANA tz name. Empty strings fall through. Invalid names
     * warn once, are memoized to `"UTC"`, and return `"UTC"`.
     */
    _resolveTzName(colTz, fcTz) {
        let name = colTz || fcTz || this._defaultTimezone || 'UTC'
        if (this._tzNamesSeen.has(name)) return this._remapInvalidTz(name)
        // Validate by trying to format; if it throws, fall back to UTC.
        try {
            // Probing the cache side-effect-free: only call DateTimeFormat if unseen.
            // eslint-disable-next-line no-new
            new Intl.DateTimeFormat('en-US', { timeZone: name })
        } catch {
            if (!this._invalidTzWarned.has(name)) {
                this._invalidTzWarned.add(name)
                // eslint-disable-next-line no-console
                console.warn(
                    `flyql: invalid timezone '${name}' — falling back to UTC. Fix the column.tz / default_timezone / toDateTime() tz argument.`,
                )
            }
            this._invalidTzRemap = this._invalidTzRemap || new Map()
            this._invalidTzRemap.set(name, 'UTC')
            name = 'UTC'
        }
        this._tzNamesSeen.add(name)
        return name
    }

    _remapInvalidTz(name) {
        if (this._invalidTzRemap && this._invalidTzRemap.has(name)) {
            return this._invalidTzRemap.get(name)
        }
        return name
    }

    /**
     * Fetch (and cache) an Intl.DateTimeFormat keyed by (resolved tz, format signature).
     */
    _getDateTimeFormat(tzName, formatOpts) {
        const sig = Object.keys(formatOpts)
            .sort()
            .map((k) => `${k}=${formatOpts[k]}`)
            .join('|')
        const key = `${tzName}|${sig}`
        let fmt = this._formatterCache.get(key)
        if (fmt) return fmt
        fmt = new Intl.DateTimeFormat('en-US', { timeZone: tzName, ...formatOpts })
        this._formatterCache.set(key, fmt)
        this._tzNamesSeen.add(tzName)
        return fmt
    }

    _resolveColumnForExpression(expr) {
        if (!expr) return null
        const cached = this._exprColumnCache.get(expr)
        if (cached !== undefined) return cached
        let col = null
        if (this._columns && expr.key && expr.key.segments && expr.key.segments.length > 0) {
            col = this._columns.resolve(expr.key.segments) || null
        }
        this._exprColumnCache.set(expr, col)
        return col
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

    _resolveInValues(expr, record, col, isDateCol, isDateTimeCol) {
        if (!expr.valuesTypes) return expr.values
        const out = []
        for (let i = 0; i < expr.values.length; i++) {
            const v = expr.values[i]
            const vt = expr.valuesTypes[i]
            if (vt === LiteralKind.COLUMN && typeof v === 'string') {
                out.push(this._resolveColumnValue(v, record))
                continue
            }
            if ((isDateCol || isDateTimeCol) && TEMPORAL_ELIGIBLE_KINDS.has(vt)) {
                const coerced = isDateTimeCol
                    ? this._coerceLiteralToMs(v, vt, col)
                    : this._coerceLiteralToDate(v, vt, col)
                if (coerced !== null) out.push(coerced)
                continue
            }
            out.push(v)
        }
        return out
    }

    evalExpression(expr, record) {
        if (expr.valueType === LiteralKind.PARAMETER) {
            if (expr.value instanceof Parameter) {
                throw new FlyqlError(`unbound parameter '$${expr.value.name}' — call bindParams() before evaluating`)
            }
            throw new FlyqlError('unbound parameter — call bindParams() before evaluating')
        }
        if (expr.values !== null && expr.values !== undefined) {
            for (const v of expr.values) {
                if (v instanceof Parameter) {
                    throw new FlyqlError(
                        `unbound parameter '$${v.name}' in IN list — call bindParams() before evaluating`,
                    )
                }
            }
        }
        if (expr.value instanceof FunctionCall && expr.value.parameterArgs && expr.value.parameterArgs.length > 0) {
            throw new FlyqlError(
                `unbound parameter(s) in function ${expr.value.name}() — call bindParams() before evaluating`,
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
        }

        // Determine temporal context (Decision 11/20)
        const col = this._resolveColumnForExpression(expr)
        const isDateCol = col !== null && col.type === Type.Date
        const isDateTimeCol = col !== null && col.type === Type.DateTime
        const temporal = isDateCol || isDateTimeCol

        if (isDateCol && col !== null) {
            this._maybeWarnDateMigration(col, value)
        }

        let coerced = false
        if (
            temporal &&
            TEMPORAL_ELIGIBLE_KINDS.has(expr.valueType) &&
            expr.operator !== Operator.IN &&
            expr.operator !== Operator.NOT_IN
        ) {
            const recCoerced = isDateTimeCol ? this._coerceToMs(value, col) : this._coerceToDate(value, col)
            const rhsCoerced = isDateTimeCol
                ? this._coerceLiteralToMs(exprValue, expr.valueType, col)
                : this._coerceLiteralToDate(exprValue, expr.valueType, col)
            if (recCoerced === null || rhsCoerced === null) return false
            value = recCoerced
            exprValue = rhsCoerced
            coerced = true
        }

        if (
            !coerced &&
            expr.valueType === LiteralKind.FUNCTION &&
            exprValue instanceof FunctionCall &&
            expr.operator !== Operator.IN &&
            expr.operator !== Operator.NOT_IN
        ) {
            // Schema-free legacy FUNCTION path.
            exprValue = this._evaluateFunctionCall(exprValue)
            value = this._coerceToMs(value, null)
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
            case Operator.IN: {
                if (!expr.values || expr.values.length === 0) return false
                const resolvedValues = this._resolveInValues(expr, record, col, isDateCol, isDateTimeCol)
                if (temporal) {
                    value = isDateTimeCol ? this._coerceToMs(value, col) : this._coerceToDate(value, col)
                    if (value === null) return false
                }
                return valueInList(value, resolvedValues)
            }
            case Operator.NOT_IN: {
                if (!expr.values || expr.values.length === 0) return true
                if (value === null || value === undefined) return false
                const resolvedValues = this._resolveInValues(expr, record, col, isDateCol, isDateTimeCol)
                if (temporal) {
                    value = isDateTimeCol ? this._coerceToMs(value, col) : this._coerceToDate(value, col)
                    if (value === null) return false
                }
                return !valueInList(value, resolvedValues)
            }
            case Operator.HAS:
                return evalHas(value, exprValue)
            case Operator.NOT_HAS:
                if (value === null || value === undefined) return false
                return !evalHas(value, exprValue)
            default:
                throw new FlyqlError(`Unknown expression operator: ${expr.operator}`)
        }
    }

    _coerceLiteralToMs(val, vt, col) {
        if (vt === LiteralKind.FUNCTION && val instanceof FunctionCall) {
            try {
                return this._evaluateFunctionCall(val)
            } catch (err) {
                if (err instanceof FlyqlError) throw err
                return null
            }
        }
        return this._coerceToMs(val, col)
    }

    _coerceLiteralToDate(val, vt, col) {
        if (vt === LiteralKind.FUNCTION && val instanceof FunctionCall) {
            let ms
            try {
                ms = this._evaluateFunctionCall(val)
            } catch (err) {
                if (err instanceof FlyqlError) throw err
                return null
            }
            const tzName = this._resolveTzName(col ? col.tz : '', '')
            const { year, month, day } = this._getWallClockParts(tzName, ms)
            return packDate(year, month, day)
        }
        return this._coerceToDate(val, col)
    }

    _maybeWarnDateMigration(col, value) {
        const key = col.matchName || col.name
        if (this._migrationWarned.has(key)) return
        let triggered = false
        if (value instanceof Date) {
            triggered = true
        } else if (typeof value === 'string') {
            if (DATETIME_SHAPED_STR_RE.test(value)) {
                triggered = true
            }
        }
        if (!triggered) return
        this._migrationWarned.add(key)
        // eslint-disable-next-line no-console
        console.warn(
            `flyql: column '${col.name}' is declared Type.Date but received a datetime-shaped value — did you mean Type.DateTime? See migration guide: https://docs.flyql.dev/syntax/dates`,
        )
    }

    _coerceToMs(value, column) {
        if (value === null || value === undefined) return null
        // Explicit bool rejection (P11) — keeps Python/Go/JS contract
        // identical: a boolean record value on a DateTime column is
        // un-coerceable and skips the record, rather than falling into
        // the number-path as JS's type coercion rules would otherwise.
        if (typeof value === 'boolean') return null
        if (value instanceof Date) {
            const t = value.getTime()
            return Number.isNaN(t) ? null : t
        }
        if (typeof value === 'number') {
            const unit = column && column.unit ? column.unit : 'ms'
            if (unit === 'ms' || unit === '') return value
            if (unit === 's') return value * 1000
            if (unit === 'ns') {
                if (value > Number.MAX_SAFE_INTEGER) {
                    // eslint-disable-next-line no-console
                    console.warn(
                        `flyql: numeric value ${value} with unit='ns' exceeds Number.MAX_SAFE_INTEGER — precision lost. Use a unit='ms' schema or pre-convert to BigInt.`,
                    )
                    return null
                }
                return Math.floor(value / 1_000_000)
            }
            return null
        }
        if (typeof value === 'bigint') {
            // P8: all BigInt paths risk precision loss above 2^53. Check
            // the resulting ms value (in BigInt) against MAX_SAFE_INTEGER
            // and refuse rather than silently return an imprecise Number.
            const unit = column && column.unit ? column.unit : 'ms'
            const maxSafe = BigInt(Number.MAX_SAFE_INTEGER)
            const minSafe = -maxSafe
            let msBig
            if (unit === 'ms' || unit === '') msBig = value
            else if (unit === 's') msBig = value * 1000n
            else if (unit === 'ns') msBig = value / 1_000_000n
            else return null
            if (msBig > maxSafe || msBig < minSafe) {
                // eslint-disable-next-line no-console
                console.warn(
                    `flyql: BigInt value ${value} with unit='${unit}' overflows Number.MAX_SAFE_INTEGER — precision would be lost. Pre-convert the record value.`,
                )
                return null
            }
            return Number(msBig)
        }
        if (typeof value === 'string') {
            return this._parseIsoStringToMs(value, column)
        }
        return null
    }

    _coerceToDate(value, column) {
        if (value === null || value === undefined) return null
        if (value instanceof Date) {
            const tzName = this._resolveTzName(column ? column.tz : '', '')
            const { year, month, day } = this._getWallClockParts(tzName, value.getTime())
            return packDate(year, month, day)
        }
        if (typeof value === 'number' || typeof value === 'bigint') {
            const ms = this._coerceToMs(value, column)
            if (ms === null) return null
            const tzName = this._resolveTzName(column ? column.tz : '', '')
            const { year, month, day } = this._getWallClockParts(tzName, ms)
            return packDate(year, month, day)
        }
        if (typeof value === 'string') {
            // Fast path: date-only YYYY-MM-DD with calendar validation.
            // Raw packDate() without validation would happily pack
            // "2026-13-45" (P4/P10) — round-trip the components through
            // Date.UTC and reject mismatches.
            if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                const y = parseInt(value.slice(0, 4), 10)
                const m = parseInt(value.slice(5, 7), 10)
                const d = parseInt(value.slice(8, 10), 10)
                const probe = new Date(Date.UTC(y, m - 1, d))
                if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
                    return null
                }
                return packDate(y, m, d)
            }
            const ms = this._parseIsoStringToMs(value, column)
            if (ms === null) return null
            const tzName = this._resolveTzName(column ? column.tz : '', '')
            const { year, month, day } = this._getWallClockParts(tzName, ms)
            return packDate(year, month, day)
        }
        return null
    }

    _parseIsoStringToMs(value, column) {
        if (!value) return null
        // Fast-path: reject obvious non-date strings.
        if (!/[-T:/]/.test(value)) return null
        // Normalise space separator (Risk 4): JS Date.parse is engine-flaky
        // for "YYYY-MM-DD HH:MM:SS" strings — pre-replace only when followed
        // by a digit (avoids clobbering a trailing tz-name separator).
        const normalised = value.replace(/^(\d{4}-\d{2}-\d{2}) (\d)/, '$1T$2')

        // Explicit offset or Z → use Date.parse directly.
        if (/[zZ]$/.test(normalised) || /[+-]\d{2}:?\d{2}$/.test(normalised)) {
            const t = Date.parse(normalised)
            return Number.isNaN(t) ? null : t
        }
        // Date-only YYYY-MM-DD: treat as midnight in column tz (Task 18 AC 7).
        if (/^\d{4}-\d{2}-\d{2}$/.test(normalised)) {
            return this._parseNaiveInTz(normalised + 'T00:00:00', column ? column.tz : '')
        }
        // Naive YYYY-MM-DDTHH:MM:SS(.ffffff)? → apply column.tz / default
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(normalised)) {
            return this._parseNaiveInTz(normalised, column ? column.tz : '')
        }
        // Unknown shape — last-chance Date.parse.
        const t = Date.parse(normalised)
        return Number.isNaN(t) ? null : t
    }

    /**
     * Parse a naive ISO-like string (YYYY-MM-DDTHH:MM:SS[.ffffff]) as wall
     * clock in `tzHint` (falling back to Evaluator defaults per Decision 25),
     * returning UTC ms or null for DST-gap inputs (Decision 19).
     *
     * Algorithm (exhaustive candidate collection — earliest-pick guaranteed
     * regardless of which candidate the offset probe lands on):
     *   1. Parse Y/M/D/h/m/s/µs from the input.
     *   2. First guess: utcGuess = Date.UTC(parts) — treats wall as UTC.
     *   3. offsetGuess = tz's offset AT utcGuess (minutes).
     *   4. Build a candidate SET: candidate, candidate-1h, candidate+1h.
     *      (Covers fall-back ambiguity AND edge cases where the offset
     *      probe lands on standard time in a DST-active zone.)
     *   5. Keep only candidates whose tz wall-clock round-trips to the
     *      input. If empty → spring-forward gap → return null.
     *   6. Return Math.min (earliest, per Decision 19).
     */
    _parseNaiveInTz(isoLike, tzHint) {
        const tzName = this._resolveTzName(tzHint, '')
        const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(isoLike)
        if (!m) return null
        const year = parseInt(m[1], 10)
        const month = parseInt(m[2], 10)
        const day = parseInt(m[3], 10)
        const hour = parseInt(m[4], 10)
        const minute = parseInt(m[5], 10)
        const second = parseInt(m[6], 10)
        const fracStr = m[7] || ''
        const ms = fracStr ? parseInt(fracStr.padEnd(3, '0').slice(0, 3), 10) : 0

        const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, ms)
        const inputMatch = { year, month, day, hour, minute, second }

        const offsetGuessMs = this._getTzOffsetMsAt(tzName, utcGuess)
        const baseCandidate = utcGuess - offsetGuessMs

        // Collect all UTC instants whose wall-clock in tzName matches the
        // input. Even when baseCandidate already matches, we still probe
        // ±1h so fall-back ambiguity reliably surfaces both occurrences —
        // picking earliest below.
        const probeDeltas = [0, -3_600_000, 3_600_000]
        const matching = []
        for (const delta of probeDeltas) {
            const c = baseCandidate + delta
            const wall = this._getWallClockParts(tzName, c)
            if (wallClockEquals(wall, inputMatch)) matching.push(c)
        }
        if (matching.length === 0) {
            // Spring-forward gap (Decision 19).
            return null
        }
        return Math.min(...matching)
    }

    _getTzOffsetMsAt(tzName, utcMs) {
        // Use longOffset (ECMA-402 2021, Node 18+) to parse GMT±HH:MM.
        const fmt = this._getDateTimeFormat(tzName, {
            timeZoneName: 'longOffset',
            hour: '2-digit',
            hour12: false,
        })
        const parts = fmt.formatToParts(new Date(utcMs))
        for (const p of parts) {
            if (p.type === 'timeZoneName') {
                const m = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(p.value)
                if (!m) {
                    if (p.value === 'GMT') return 0
                    return 0
                }
                const sign = m[1] === '+' ? 1 : -1
                const h = parseInt(m[2], 10)
                const mm = m[3] ? parseInt(m[3], 10) : 0
                return sign * (h * 3_600_000 + mm * 60_000)
            }
        }
        return 0
    }

    _getWallClockParts(tzName, utcMs) {
        const fmt = this._getDateTimeFormat(tzName, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        })
        const parts = {}
        for (const p of fmt.formatToParts(new Date(utcMs))) {
            parts[p.type] = p.value
        }
        const hour = parts.hour === '24' ? 0 : parseInt(parts.hour, 10)
        return {
            year: parseInt(parts.year, 10),
            month: parseInt(parts.month, 10),
            day: parseInt(parts.day, 10),
            hour,
            minute: parseInt(parts.minute, 10),
            second: parseInt(parts.second, 10),
        }
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

    _midnightInTz(tzName) {
        const resolved = this._resolveTzName(tzName || '', '')
        const wall = this._getWallClockParts(resolved, Date.now())
        return this._midnightOfDateInTz(resolved, wall.year, wall.month, wall.day)
    }

    _midnightOfDateInTz(tzName, year, month, day) {
        const resolved = this._resolveTzName(tzName || '', '')
        const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`
        const ms = this._parseNaiveInTz(iso, resolved)
        if (ms !== null) return ms
        // DST-nonexistent midnight — fall forward by an hour as a best-effort.
        const fallback = this._parseNaiveInTz(
            `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T01:00:00`,
            resolved,
        )
        return fallback === null ? Date.UTC(year, month - 1, day) : fallback
    }

    _startOfWeekInTz(tzName) {
        const resolved = this._resolveTzName(tzName || '', '')
        const fmt = this._getDateTimeFormat(resolved, {
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
        // Calendar-aware subtraction to avoid DST landmines.
        const d = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`)
        d.setUTCDate(d.getUTCDate() - dayOffset)
        return this._midnightOfDateInTz(resolved, d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
    }

    _startOfMonthInTz(tzName) {
        const resolved = this._resolveTzName(tzName || '', '')
        const fmt = this._getDateTimeFormat(resolved, {
            year: 'numeric',
            month: '2-digit',
        })
        const parts = {}
        for (const p of fmt.formatToParts(new Date())) {
            parts[p.type] = p.value
        }
        return this._midnightOfDateInTz(resolved, parseInt(parts.year, 10), parseInt(parts.month, 10), 1)
    }

    _evaluateFunctionCall(fc, _defaultTzIgnored) {
        const tzName = this._resolveTzName('', fc.timezone || '')
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
                return this._midnightInTz(tzName)

            case 'startof': {
                const unit = fc.unit.toLowerCase()
                if (unit === 'day') return this._midnightInTz(tzName)
                if (unit === 'week') return this._startOfWeekInTz(tzName)
                if (unit === 'month') return this._startOfMonthInTz(tzName)
                throw new FlyqlError(`unsupported startOf unit: ${fc.unit}`)
            }

            default:
                throw new FlyqlError(`unknown temporal function: ${fc.name}`)
        }
    }
}

function wallClockEquals(a, b) {
    return (
        a.year === b.year &&
        a.month === b.month &&
        a.day === b.day &&
        a.hour === b.hour &&
        a.minute === b.minute &&
        a.second === b.second
    )
}
