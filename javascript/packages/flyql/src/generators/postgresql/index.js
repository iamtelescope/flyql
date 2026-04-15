import { Operator, BoolOperator, VALID_KEY_VALUE_OPERATORS, VALID_BOOL_OPERATORS } from '../../core/constants.js'
import { Type } from '../../flyql_type.js'
import { LiteralKind } from '../../literal/literal_kind.js'
import { FunctionCall, Parameter } from '../../core/expression.js'
import { FlyqlError } from '../../core/exceptions.js'
import { parseKey } from '../../core/key.js'
import { validateOperation, validateInListTypes } from './helpers.js'
import { applyTransformerSQL, validateTransformerChain } from '../transformerHelpers.js'
import { defaultRegistry } from '../../transformers/index.js'
import { Column, newColumn, normalizePostgreSQLType } from './column.js'
import { Column as FCol, ColumnSchema } from '../../core/column.js'

export { Column, newColumn, normalizePostgreSQLType }

/** Bridge dialect Columns to canonical flyql.ColumnSchema. Tech Decision #13. */
export function toFlyQLSchema(cols) {
    const m = {}
    for (const c of cols) {
        m[c.name] = new FCol(c.name, c.flyqlType(), { matchName: c.matchName })
    }
    return new ColumnSchema(m)
}

const boolOpToSQL = {
    [BoolOperator.AND]: 'AND',
    [BoolOperator.OR]: 'OR',
}

const jsonKeyPattern = /^[a-zA-Z_][.a-zA-Z0-9_-]*$/

const escapeCharsMap = {
    '\b': '\\b',
    '\f': '\\f',
    '\r': '\\r',
    '\n': '\\n',
    '\t': '\\t',
    '\0': '\\0',
    '\x07': '\\a',
    '\v': '\\v',
    '\\': '\\\\',
    "'": "\\'",
}

// Extract which segments were quoted from the raw key string.
// The JS Key class doesn't expose quotedSegments like Go does,
// so we derive it by walking the raw key.
function extractQuotedSegments(raw) {
    const quoted = []
    let i = 0
    while (i < raw.length) {
        const c = raw[i]
        if (c === "'" || c === '"') {
            quoted.push(true)
            i++ // skip open quote
            while (i < raw.length && raw[i] !== c) {
                if (raw[i] === '\\') i++ // skip escape
                i++
            }
            i++ // skip close quote
            // skip until dot or end
            while (i < raw.length && raw[i] !== '.') i++
            if (i < raw.length) i++ // skip dot
        } else {
            quoted.push(false)
            while (i < raw.length && raw[i] !== '.') {
                if (raw[i] === '\\') i++
                i++
            }
            if (i < raw.length) i++ // skip dot
        }
    }
    return quoted
}

function validateJSONPathPart(part, quoted) {
    if (quoted) {
        return
    }
    if (!part) {
        throw new Error('Invalid JSON path part')
    }
    const idx = parseInt(part, 10)
    if (!isNaN(idx) && idx >= 0 && String(idx) === part) {
        return
    }
    if (!jsonKeyPattern.test(part)) {
        throw new Error('Invalid JSON path part')
    }
}

const durationUnitMap = {
    s: 'seconds',
    m: 'minutes',
    h: 'hours',
    d: 'days',
}

function functionCallToSQL(fc, tz) {
    const resolveTz = (explicit) => explicit || tz || 'UTC'

    switch (fc.name) {
        case 'now':
            return 'NOW()'
        case 'today': {
            const timezone = resolveTz(fc.timezone)
            return `(NOW() AT TIME ZONE ${escapeParam(timezone)})::date`
        }
        case 'startOf': {
            const timezone = resolveTz(fc.timezone)
            const escapedTz = escapeParam(timezone)
            switch (fc.unit) {
                case 'day':
                    return `date_trunc('day', NOW() AT TIME ZONE ${escapedTz}) AT TIME ZONE ${escapedTz}`
                case 'week':
                    return `date_trunc('week', NOW() AT TIME ZONE ${escapedTz}) AT TIME ZONE ${escapedTz}`
                case 'month':
                    return `date_trunc('month', NOW() AT TIME ZONE ${escapedTz}) AT TIME ZONE ${escapedTz}`
                default:
                    throw new Error(`unsupported startOf unit: ${fc.unit}`)
            }
        }
        case 'ago': {
            if (!fc.durationArgs || fc.durationArgs.length === 0) {
                throw new Error('ago() requires at least one duration argument')
            }
            const intervals = []
            for (const dur of fc.durationArgs) {
                let value = dur.value
                let unit = dur.unit
                if (unit === 'w') {
                    value = value * 7
                    unit = 'd'
                }
                const sqlUnit = durationUnitMap[unit]
                if (!sqlUnit) {
                    throw new Error(`unsupported duration unit: ${unit}`)
                }
                intervals.push(`INTERVAL '${value} ${sqlUnit}'`)
            }
            return `(NOW() - ${intervals.join(' - ')})`
        }
        default:
            throw new Error(`unsupported function: ${fc.name}`)
    }
}

function escapeLikeParam(value) {
    const str = String(value)
    let likeEscaped = ''
    for (let i = 0; i < str.length; i++) {
        const c = str[i]
        if (c === '\\') {
            const next = str[i + 1]
            if (next === '%' || next === '_') {
                likeEscaped += c + next
                i++
            } else {
                likeEscaped += '\\\\'
            }
        } else {
            likeEscaped += c
        }
    }
    return escapeParam(likeEscaped)
}

export function escapeParam(item) {
    if (item === null || item === undefined) {
        return 'NULL'
    }

    if (typeof item === 'string') {
        let result = "'"
        for (const c of item) {
            if (escapeCharsMap[c] !== undefined) {
                result += escapeCharsMap[c]
            } else {
                result += c
            }
        }
        result += "'"
        return result
    }

    if (typeof item === 'boolean') {
        return item ? 'true' : 'false'
    }

    if (typeof item === 'bigint') {
        return String(item)
    }

    if (typeof item === 'number') {
        if (!Number.isFinite(item)) {
            throw new Error(`unsupported numeric value for escapeParam: ${item}`)
        }
        return String(item)
    }

    throw new Error(`unsupported type for escapeParam: ${typeof item}`)
}

export function escapeIdentifier(name) {
    const escaped = name.replace(/"/g, '""')
    return `"${escaped}"`
}

function getIdentifier(column) {
    if (column.rawIdentifier) {
        return column.rawIdentifier
    }
    return escapeIdentifier(column.name)
}

function buildJSONBPath(identifier, pathParts, quoted) {
    if (pathParts.length === 0) {
        return identifier
    }
    let result = identifier
    for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i]
        const isQuoted = i < quoted.length && quoted[i]
        const isLast = i === pathParts.length - 1
        if (!isQuoted) {
            const idx = parseInt(part, 10)
            if (!isNaN(idx) && idx >= 0 && String(idx) === part) {
                result += isLast ? `->>${idx}` : `->${idx}`
                continue
            }
        }
        const escaped = escapeParam(part)
        result += isLast ? `->>${escaped}` : `->${escaped}`
    }
    return result
}

function resolveRhsColumnRef(value, columns) {
    try {
        const key = parseKey(value)
        const resolved = resolveColumn(key, columns)
        const { column, path, pathQuoted } = resolved
        return buildSelectExpr(getIdentifier(column), column, path, pathQuoted)
    } catch {
        return null
    }
}

function buildJSONBPathRaw(identifier, pathParts, quoted) {
    if (pathParts.length === 0) {
        return identifier
    }
    let result = identifier
    for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i]
        const isQuoted = i < quoted.length && quoted[i]
        if (!isQuoted) {
            const idx = parseInt(part, 10)
            if (!isNaN(idx) && idx >= 0 && String(idx) === part) {
                result += `->${idx}`
                continue
            }
        }
        const escaped = escapeParam(part)
        result += `->${escaped}`
    }
    return result
}

function expressionToSQLSimple(expr, columns, registry = null, options = {}) {
    const columnName = expr.key.segments[0]
    const column = columns[columnName]
    if (!column) {
        throw new Error(`unknown column: ${columnName}`)
    }

    if (expr.valueType === LiteralKind.FUNCTION) {
        if (expr.key.isSegmented) {
            throw new Error('temporal functions are not supported with segmented keys')
        }
        if (column.flyqlType() && column.flyqlType() !== Type.Date) {
            throw new Error(
                `temporal function '${expr.value.name}' is not valid for column '${columnName}' of type '${column.flyqlType()}'`,
            )
        }
        const fc = expr.value
        const sqlValue = functionCallToSQL(fc, options.defaultTimezone)
        let colRef = getIdentifier(column)
        if (expr.key.transformers.length) {
            validateTransformerChain(expr.key.transformers, registry)
            colRef = applyTransformerSQL(colRef, expr.key.transformers, 'postgresql', registry)
        }
        return `${colRef} ${expr.operator} ${sqlValue}`
    }

    let rhsRef = null
    if (expr.valueType === LiteralKind.COLUMN) {
        rhsRef = resolveRhsColumnRef(String(expr.value), columns)
    }

    if (rhsRef !== null) {
        let identifier = getIdentifier(column)
        if (expr.key.transformers.length) {
            validateTransformerChain(expr.key.transformers, registry)
            identifier = applyTransformerSQL(identifier, expr.key.transformers, 'postgresql', registry)
        }
        switch (expr.operator) {
            case Operator.REGEX:
                return `${identifier} ~ ${rhsRef}`
            case Operator.NOT_REGEX:
                return `${identifier} !~ ${rhsRef}`
            case Operator.LIKE:
                return `${identifier} LIKE ${rhsRef}`
            case Operator.NOT_LIKE:
                return `${identifier} NOT LIKE ${rhsRef}`
            case Operator.ILIKE:
                return `${identifier} ILIKE ${rhsRef}`
            case Operator.NOT_ILIKE:
                return `${identifier} NOT ILIKE ${rhsRef}`
            default:
                return `${identifier} ${expr.operator} ${rhsRef}`
        }
    }

    if (column.values && column.values.length > 0) {
        const valueStr = String(expr.value)
        if (!column.values.includes(valueStr)) {
            throw new Error(`unknown value: ${expr.value}`)
        }
    }

    if (column.flyqlType() && !expr.key.transformers.length) {
        validateOperation(expr.value, column.flyqlType(), expr.operator)
    }

    let identifier = getIdentifier(column)
    if (expr.key.transformers.length) {
        validateTransformerChain(expr.key.transformers, registry)
        identifier = applyTransformerSQL(identifier, expr.key.transformers, 'postgresql', registry)
    }

    switch (expr.operator) {
        case Operator.REGEX: {
            const value = escapeParam(String(expr.value))
            return `${identifier} ~ ${value}`
        }
        case Operator.NOT_REGEX: {
            const value = escapeParam(String(expr.value))
            return `${identifier} !~ ${value}`
        }
        case Operator.LIKE: {
            const value = escapeLikeParam(expr.value)
            return `${identifier} LIKE ${value}`
        }
        case Operator.NOT_LIKE: {
            const value = escapeLikeParam(expr.value)
            return `${identifier} NOT LIKE ${value}`
        }
        case Operator.ILIKE: {
            const value = escapeLikeParam(expr.value)
            return `${identifier} ILIKE ${value}`
        }
        case Operator.NOT_ILIKE: {
            const value = escapeLikeParam(expr.value)
            return `${identifier} NOT ILIKE ${value}`
        }
        case Operator.EQUALS:
        case Operator.NOT_EQUALS: {
            if (expr.valueType === LiteralKind.NULL) {
                return expr.operator === Operator.EQUALS ? `${identifier} IS NULL` : `${identifier} IS NOT NULL`
            }
            if (expr.valueType === LiteralKind.BOOLEAN) {
                const boolLiteral = expr.value ? 'TRUE' : 'FALSE'
                return `${identifier} ${expr.operator} ${boolLiteral}`
            }
            const escapedValue = escapeParam(expr.value)
            return `${identifier} ${expr.operator} ${escapedValue}`
        }
        default: {
            const value = escapeParam(expr.value)
            return `${identifier} ${expr.operator} ${value}`
        }
    }
}

const _LIKE_OPS_PG = new Set([Operator.LIKE, Operator.NOT_LIKE, Operator.ILIKE, Operator.NOT_ILIKE])

function expressionToSQLSegmented(expr, columns) {
    const columnName = expr.key.segments[0]
    const column = columns[columnName]
    if (!column) {
        throw new Error(`unknown column: ${columnName}`)
    }

    if (column.flyqlType() && column.flyqlType() !== Type.JSONString && !expr.key.transformers.length) {
        validateOperation(expr.value, column.flyqlType(), expr.operator)
    }

    const identifier = getIdentifier(column)
    const hasTransformers = expr.key.transformers && expr.key.transformers.length

    const escapeValue = (v) => (_LIKE_OPS_PG.has(expr.operator) ? escapeLikeParam(v) : escapeParam(v))

    if (column.flyqlType() === Type.JSON || column.flyqlType() === Type.JSONString) {
        const castIdentifier = column.flyqlType() === Type.JSONString ? `(${identifier}::jsonb)` : identifier
        const jsonPath = expr.key.segments.slice(1)
        const allQuoted = extractQuotedSegments(expr.key.raw)
        const jsonPathQuoted = allQuoted.slice(1)
        for (let i = 0; i < jsonPath.length; i++) {
            validateJSONPathPart(jsonPath[i], jsonPathQuoted[i])
        }

        let pathExpr = buildJSONBPath(castIdentifier, jsonPath, jsonPathQuoted)
        if (hasTransformers) {
            pathExpr = applyTransformerSQL(pathExpr, expr.key.transformers, 'postgresql')
        }

        let rhsRef = null
        if (expr.valueType === LiteralKind.COLUMN) {
            rhsRef = resolveRhsColumnRef(String(expr.value), columns)
        }

        if (rhsRef !== null) {
            if (expr.operator === Operator.REGEX) return `${pathExpr} ~ ${rhsRef}`
            if (expr.operator === Operator.NOT_REGEX) return `${pathExpr} !~ ${rhsRef}`
            return `${pathExpr} ${expr.operator} ${rhsRef}`
        }

        const value = escapeValue(expr.value)

        switch (true) {
            case expr.operator === Operator.REGEX:
                return `${pathExpr} ~ ${value}`
            case expr.operator === Operator.NOT_REGEX:
                return `${pathExpr} !~ ${value}`
            case typeof expr.value === 'number' || typeof expr.value === 'bigint': {
                const jsonbRaw = buildJSONBPathRaw(castIdentifier, jsonPath, jsonPathQuoted)
                return `(jsonb_typeof(${jsonbRaw}) = 'number' AND (${pathExpr})::numeric ${expr.operator} ${value})`
            }
            case typeof expr.value === 'string': {
                const jsonbRaw = buildJSONBPathRaw(castIdentifier, jsonPath, jsonPathQuoted)
                return `(jsonb_typeof(${jsonbRaw}) = 'string' AND ${pathExpr} ${expr.operator} ${value})`
            }
            default:
                return `${pathExpr} ${expr.operator} ${value}`
        }
    } else if (column.flyqlType() === Type.Map) {
        const mapKey = expr.key.segments.slice(1).join('.')
        const escapedMapKey = escapeParam(mapKey)
        let rhsRef = null
        if (expr.valueType === LiteralKind.COLUMN) {
            rhsRef = resolveRhsColumnRef(String(expr.value), columns)
        }
        const value = rhsRef !== null ? rhsRef : escapeValue(expr.value)
        let accessExpr = `${identifier}->${escapedMapKey}`
        if (hasTransformers) {
            accessExpr = applyTransformerSQL(accessExpr, expr.key.transformers, 'postgresql')
        }

        switch (expr.operator) {
            case Operator.REGEX:
                return `${accessExpr} ~ ${value}`
            case Operator.NOT_REGEX:
                return `${accessExpr} !~ ${value}`
            default:
                return `${accessExpr} ${expr.operator} ${value}`
        }
    } else if (column.flyqlType() === Type.Array) {
        const arrayIndexStr = expr.key.segments.slice(1).join('.')
        const arrayIndex = parseInt(arrayIndexStr, 10)
        if (isNaN(arrayIndex)) {
            throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
        }
        let rhsRef = null
        if (expr.valueType === LiteralKind.COLUMN) {
            rhsRef = resolveRhsColumnRef(String(expr.value), columns)
        }
        const value = rhsRef !== null ? rhsRef : escapeValue(expr.value)
        const pgIndex = arrayIndex + 1
        let accessExpr = `${identifier}[${pgIndex}]`
        if (hasTransformers) {
            accessExpr = applyTransformerSQL(accessExpr, expr.key.transformers, 'postgresql')
        }

        switch (expr.operator) {
            case Operator.REGEX:
                return `${accessExpr} ~ ${value}`
            case Operator.NOT_REGEX:
                return `${accessExpr} !~ ${value}`
            default:
                return `${accessExpr} ${expr.operator} ${value}`
        }
    } else {
        throw new Error('path search for unsupported column type')
    }
}

function inExpressionToSQL(expr, columns) {
    const isNotIn = expr.operator === Operator.NOT_IN

    if (!expr.values || expr.values.length === 0) {
        return isNotIn ? 'TRUE' : 'FALSE'
    }

    const columnName = expr.key.segments[0]
    const column = columns[columnName]
    if (!column) {
        throw new Error(`unknown column: ${columnName}`)
    }

    const isHeterogeneous = expr.valuesTypes && new Set(expr.valuesTypes).size > 1
    if (column.flyqlType() && !expr.key.isSegmented && !isHeterogeneous) {
        validateInListTypes(expr.values, column.flyqlType())
    }

    const valueParts = []
    for (let i = 0; i < expr.values.length; i++) {
        let rhsRef = null
        if (expr.valuesTypes && i < expr.valuesTypes.length && expr.valuesTypes[i] === LiteralKind.COLUMN) {
            rhsRef = resolveRhsColumnRef(String(expr.values[i]), columns)
        }
        valueParts.push(rhsRef !== null ? rhsRef : escapeParam(expr.values[i]))
    }
    const valuesSQL = valueParts.join(', ')

    const sqlOp = isNotIn ? 'NOT IN' : 'IN'

    let identifier = getIdentifier(column)

    const hasTransformers = expr.key.transformers && expr.key.transformers.length

    if (expr.key.isSegmented) {
        if (column.flyqlType() === Type.JSON || column.flyqlType() === Type.JSONString) {
            const castIdentifier = column.flyqlType() === Type.JSONString ? `(${identifier}::jsonb)` : identifier
            const jsonPath = expr.key.segments.slice(1)
            const allQuoted = extractQuotedSegments(expr.key.raw)
            const jsonPathQuoted = allQuoted.slice(1)
            for (let i = 0; i < jsonPath.length; i++) {
                validateJSONPathPart(jsonPath[i], jsonPathQuoted[i])
            }
            let pathExpr = buildJSONBPath(castIdentifier, jsonPath, jsonPathQuoted)
            if (hasTransformers) {
                pathExpr = applyTransformerSQL(pathExpr, expr.key.transformers, 'postgresql')
            }
            return `${pathExpr} ${sqlOp} (${valuesSQL})`
        } else if (column.flyqlType() === Type.Map) {
            const mapKey = expr.key.segments.slice(1).join('.')
            const escapedMapKey = escapeParam(mapKey)
            let leafExpr = `${identifier}->${escapedMapKey}`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'postgresql')
            }
            return `${leafExpr} ${sqlOp} (${valuesSQL})`
        } else if (column.flyqlType() === Type.Array) {
            const arrayIndexStr = expr.key.segments.slice(1).join('.')
            const arrayIndex = parseInt(arrayIndexStr, 10)
            if (isNaN(arrayIndex)) {
                throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
            }
            let leafExpr = `${identifier}[${arrayIndex + 1}]`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'postgresql')
            }
            return `${leafExpr} ${sqlOp} (${valuesSQL})`
        } else {
            throw new Error('path search for unsupported column type')
        }
    }

    if (hasTransformers) {
        identifier = applyTransformerSQL(identifier, expr.key.transformers, 'postgresql')
    }

    return `${identifier} ${sqlOp} (${valuesSQL})`
}

function truthyExpressionToSQL(expr, columns) {
    const columnName = expr.key.segments[0]
    const column = columns[columnName]
    if (!column) {
        throw new Error(`unknown column: ${columnName}`)
    }

    const identifier = getIdentifier(column)

    const hasTransformers = expr.key.transformers && expr.key.transformers.length

    if (expr.key.isSegmented) {
        if (column.flyqlType() === Type.JSON || column.flyqlType() === Type.JSONString) {
            const castIdentifier = column.flyqlType() === Type.JSONString ? `(${identifier}::jsonb)` : identifier
            const jsonPath = expr.key.segments.slice(1)
            const allQuoted = extractQuotedSegments(expr.key.raw)
            const jsonPathQuoted = allQuoted.slice(1)
            for (let i = 0; i < jsonPath.length; i++) {
                validateJSONPathPart(jsonPath[i], jsonPathQuoted[i])
            }
            let pathExpr = buildJSONBPath(castIdentifier, jsonPath, jsonPathQuoted)
            if (hasTransformers) {
                pathExpr = applyTransformerSQL(pathExpr, expr.key.transformers, 'postgresql')
            }
            return `(${pathExpr} IS NOT NULL AND ${pathExpr} != '')`
        } else if (column.flyqlType() === Type.Map) {
            const mapKey = expr.key.segments.slice(1).join('.')
            const escapedMapKey = escapeParam(mapKey)
            let leafExpr = `${identifier}->${escapedMapKey}`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'postgresql')
            }
            return `(${identifier} ? ${escapedMapKey} AND ${leafExpr} != '')`
        } else if (column.flyqlType() === Type.Array) {
            const arrayIndexStr = expr.key.segments.slice(1).join('.')
            const arrayIndex = parseInt(arrayIndexStr, 10)
            if (isNaN(arrayIndex)) {
                throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
            }
            const pgIndex = arrayIndex + 1
            let leafExpr = `${identifier}[${pgIndex}]`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'postgresql')
            }
            return `(array_length(${identifier}, 1) >= ${pgIndex} AND ${leafExpr} != '')`
        } else {
            throw new Error('path search for unsupported column type')
        }
    }

    if (hasTransformers) {
        const colRef = applyTransformerSQL(identifier, expr.key.transformers, 'postgresql')
        return `(${colRef} IS NOT NULL AND ${colRef} != '')`
    }

    if (column.flyqlType() === Type.JSONString) {
        return `(${identifier} IS NOT NULL AND ${identifier} != '' AND CASE jsonb_typeof(${identifier}::jsonb) WHEN 'array' THEN jsonb_array_length(${identifier}::jsonb) > 0 WHEN 'object' THEN ${identifier}::jsonb != '{}'::jsonb ELSE false END)`
    }

    switch (column.flyqlType()) {
        case Type.Bool:
            return identifier
        case Type.String:
            return `(${identifier} IS NOT NULL AND ${identifier} != '')`
        case Type.Int:
        case Type.Float:
            return `(${identifier} IS NOT NULL AND ${identifier} != 0)`
        case Type.Date:
            return `(${identifier} IS NOT NULL)`
        default:
            return `(${identifier} IS NOT NULL)`
    }
}

function falsyExpressionToSQL(expr, columns) {
    const columnName = expr.key.segments[0]
    const column = columns[columnName]
    if (!column) {
        throw new Error(`unknown column: ${columnName}`)
    }

    const identifier = getIdentifier(column)

    const hasTransformers = expr.key.transformers && expr.key.transformers.length

    if (expr.key.isSegmented) {
        if (column.flyqlType() === Type.JSON || column.flyqlType() === Type.JSONString) {
            const castIdentifier = column.flyqlType() === Type.JSONString ? `(${identifier}::jsonb)` : identifier
            const jsonPath = expr.key.segments.slice(1)
            const allQuoted = extractQuotedSegments(expr.key.raw)
            const jsonPathQuoted = allQuoted.slice(1)
            for (let i = 0; i < jsonPath.length; i++) {
                validateJSONPathPart(jsonPath[i], jsonPathQuoted[i])
            }
            let pathExpr = buildJSONBPath(castIdentifier, jsonPath, jsonPathQuoted)
            if (hasTransformers) {
                pathExpr = applyTransformerSQL(pathExpr, expr.key.transformers, 'postgresql')
            }
            return `(${pathExpr} IS NULL OR ${pathExpr} = '')`
        } else if (column.flyqlType() === Type.Map) {
            const mapKey = expr.key.segments.slice(1).join('.')
            const escapedMapKey = escapeParam(mapKey)
            let leafExpr = `${identifier}->${escapedMapKey}`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'postgresql')
            }
            return `(NOT (${identifier} ? ${escapedMapKey}) OR ${leafExpr} = '')`
        } else if (column.flyqlType() === Type.Array) {
            const arrayIndexStr = expr.key.segments.slice(1).join('.')
            const arrayIndex = parseInt(arrayIndexStr, 10)
            if (isNaN(arrayIndex)) {
                throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
            }
            const pgIndex = arrayIndex + 1
            let leafExpr = `${identifier}[${pgIndex}]`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'postgresql')
            }
            return `(array_length(${identifier}, 1) < ${pgIndex} OR ${leafExpr} = '')`
        } else {
            throw new Error('path search for unsupported column type')
        }
    }

    if (hasTransformers) {
        const colRef = applyTransformerSQL(identifier, expr.key.transformers, 'postgresql')
        return `(${colRef} IS NULL OR ${colRef} = '')`
    }

    if (column.flyqlType() === Type.JSONString) {
        return `(${identifier} IS NULL OR ${identifier} = '' OR CASE jsonb_typeof(${identifier}::jsonb) WHEN 'array' THEN jsonb_array_length(${identifier}::jsonb) = 0 WHEN 'object' THEN ${identifier}::jsonb = '{}'::jsonb ELSE true END)`
    }

    switch (column.flyqlType()) {
        case Type.Bool:
            return `NOT ${identifier}`
        case Type.String:
            return `(${identifier} IS NULL OR ${identifier} = '')`
        case Type.Int:
        case Type.Float:
            return `(${identifier} IS NULL OR ${identifier} = 0)`
        case Type.Date:
            return `(${identifier} IS NULL)`
        default:
            return `(${identifier} IS NULL)`
    }
}

function hasExpressionToSQL(expr, columns) {
    const isNotHas = expr.operator === Operator.NOT_HAS
    const columnName = expr.key.segments[0]
    const column = columns[columnName]
    if (!column) {
        throw new Error(`unknown column: ${columnName}`)
    }

    let identifier = getIdentifier(column)
    let rhsRef = null
    if (expr.valueType === LiteralKind.COLUMN) {
        rhsRef = resolveRhsColumnRef(String(expr.value), columns)
    }
    const value = rhsRef !== null ? rhsRef : escapeParam(expr.value)

    const hasTransformers = expr.key.transformers && expr.key.transformers.length

    if (expr.key.isSegmented) {
        if (column.flyqlType() === Type.JSON || column.flyqlType() === Type.JSONString) {
            const castIdentifier = column.flyqlType() === Type.JSONString ? `(${identifier}::jsonb)` : identifier
            const jsonPath = expr.key.segments.slice(1)
            const allQuoted = extractQuotedSegments(expr.key.raw)
            const jsonPathQuoted = allQuoted.slice(1)
            for (let i = 0; i < jsonPath.length; i++) {
                validateJSONPathPart(jsonPath[i], jsonPathQuoted[i])
            }
            let pathExpr = buildJSONBPath(castIdentifier, jsonPath, jsonPathQuoted)
            if (hasTransformers) {
                pathExpr = applyTransformerSQL(pathExpr, expr.key.transformers, 'postgresql')
            }
            if (isNotHas) {
                return `position(${value} in ${pathExpr}) = 0`
            }
            return `position(${value} in ${pathExpr}) > 0`
        } else if (column.flyqlType() === Type.Map) {
            const mapKey = expr.key.segments.slice(1).join('.')
            const escapedMapKey = escapeParam(mapKey)
            let accessExpr = `${identifier}->${escapedMapKey}`
            if (hasTransformers) {
                accessExpr = applyTransformerSQL(accessExpr, expr.key.transformers, 'postgresql')
            }
            if (isNotHas) {
                return `position(${value} in ${accessExpr}) = 0`
            }
            return `position(${value} in ${accessExpr}) > 0`
        } else if (column.flyqlType() === Type.Array) {
            const arrayIndexStr = expr.key.segments.slice(1).join('.')
            const arrayIndex = parseInt(arrayIndexStr, 10)
            if (isNaN(arrayIndex)) {
                throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
            }
            const pgIndex = arrayIndex + 1
            let accessExpr = `${identifier}[${pgIndex}]`
            if (hasTransformers) {
                accessExpr = applyTransformerSQL(accessExpr, expr.key.transformers, 'postgresql')
            }
            if (isNotHas) {
                return `position(${value} in ${accessExpr}) = 0`
            }
            return `position(${value} in ${accessExpr}) > 0`
        } else {
            throw new Error('path search for unsupported column type')
        }
    }

    if (hasTransformers) {
        identifier = applyTransformerSQL(identifier, expr.key.transformers, 'postgresql')
    }

    let isArrayResult = column.flyqlType() === Type.Array
    if (expr.key.transformers && expr.key.transformers.length) {
        const reg = defaultRegistry()
        const lastT = reg.get(expr.key.transformers[expr.key.transformers.length - 1].name)
        if (lastT && lastT.outputType === 'array') isArrayResult = true
    }

    if (isArrayResult) {
        if (isNotHas) {
            return `NOT (${value} = ANY(${identifier}))`
        }
        return `${value} = ANY(${identifier})`
    }

    if (column.flyqlType() === Type.JSON || column.flyqlType() === Type.JSONString) {
        const castIdentifier = column.flyqlType() === Type.JSONString ? `(${identifier}::jsonb)` : identifier
        if (isNotHas) {
            return `NOT (${castIdentifier} ? ${value})`
        }
        return `${castIdentifier} ? ${value}`
    }

    if (column.flyqlType() === Type.Map) {
        if (isNotHas) {
            return `NOT (${identifier} ? ${value})`
        }
        return `${identifier} ? ${value}`
    }

    if (column.flyqlType() === Type.String) {
        if (isNotHas) {
            return `(${identifier} IS NULL OR position(${value} in ${identifier}) = 0)`
        }
        return `position(${value} in ${identifier}) > 0`
    }

    throw new Error(`has operator is not supported for column type: ${column.flyqlType()}`)
}

function validateOperator(op) {
    if (!VALID_KEY_VALUE_OPERATORS.includes(op) && op !== Operator.TRUTHY) {
        throw new Error(`invalid operator: ${op}`)
    }
}

function validateBoolOperator(op) {
    if (!VALID_BOOL_OPERATORS.includes(op)) {
        throw new Error(`invalid bool operator: ${op}`)
    }
}

function expressionToSQL(expr, columns, registry = null, options = {}) {
    if (expr.valueType === LiteralKind.PARAMETER) {
        if (expr.value instanceof Parameter) {
            throw new FlyqlError(
                `unbound parameter '$${expr.value.name}' \u2014 call bindParams() before generating SQL`,
            )
        }
        throw new FlyqlError('unbound parameter \u2014 call bindParams() before generating SQL')
    }
    if (expr.values !== null && expr.values !== undefined) {
        for (const v of expr.values) {
            if (v instanceof Parameter) {
                throw new FlyqlError(
                    `unbound parameter '$${v.name}' in IN list \u2014 call bindParams() before generating SQL`,
                )
            }
        }
    }
    if (expr.value instanceof FunctionCall && expr.value.parameterArgs && expr.value.parameterArgs.length > 0) {
        throw new FlyqlError(
            `unbound parameter(s) in function ${expr.value.name}() \u2014 call bindParams() before generating SQL`,
        )
    }
    validateOperator(expr.operator)
    if (expr.operator === Operator.TRUTHY) {
        return truthyExpressionToSQL(expr, columns)
    }
    if (expr.operator === Operator.IN || expr.operator === Operator.NOT_IN) {
        return inExpressionToSQL(expr, columns)
    }
    if (expr.operator === Operator.HAS || expr.operator === Operator.NOT_HAS) {
        return hasExpressionToSQL(expr, columns)
    }
    if (expr.key.isSegmented) {
        return expressionToSQLSegmented(expr, columns)
    }
    return expressionToSQLSimple(expr, columns, registry, options)
}

function findSingleLeafExpression(node) {
    if (!node) return null
    if (node.negated) return null
    if (node.expression) return node.expression
    if (node.left && !node.right) return findSingleLeafExpression(node.left)
    if (node.right && !node.left) return findSingleLeafExpression(node.right)
    return null
}

export function generateWhere(root, columns, registry = null, options = {}) {
    if (!root) {
        return ''
    }

    let text = ''
    let isNegated = root.negated

    if (root.expression) {
        if (isNegated && root.expression.operator === Operator.TRUTHY) {
            text = falsyExpressionToSQL(root.expression, columns)
            isNegated = false
        } else {
            text = expressionToSQL(root.expression, columns, registry, options)
        }
    } else if (isNegated && !root.expression && !(root.left && root.right)) {
        const child = root.left || root.right
        const leafExpr = findSingleLeafExpression(child)
        if (leafExpr && leafExpr.operator === Operator.TRUTHY) {
            return falsyExpressionToSQL(leafExpr, columns)
        }
    }

    let left = ''
    let right = ''

    if (root.left) {
        left = generateWhere(root.left, columns, registry, options)
    }

    if (root.right) {
        right = generateWhere(root.right, columns, registry, options)
    }

    if (left && right) {
        validateBoolOperator(root.boolOperator)
        const sqlBoolOp = boolOpToSQL[root.boolOperator]
        text = `(${left} ${sqlBoolOp} ${right})`
    } else if (left) {
        text = left
    } else if (right) {
        text = right
    }

    if (isNegated && text) {
        text = `NOT (${text})`
    }

    return text
}

// SELECT clause generation

function parseRawSelectColumns(text) {
    const parts = text.split(',')
    const result = []
    for (let part of parts) {
        part = part.trim()
        if (!part) continue
        const lower = part.toLowerCase()
        const idx = lower.indexOf(' as ')
        let name, alias
        if (idx >= 0) {
            name = part.substring(0, idx).trim()
            alias = part.substring(idx + 4).trim()
        } else {
            name = part
            alias = ''
        }
        if (!name) {
            throw new Error('empty column name')
        }
        result.push({ name, alias })
    }
    return result
}

function resolveColumn(key, columns) {
    const segments = key.segments
    for (let i = segments.length; i > 0; i--) {
        const candidateKey = segments.slice(0, i).join('.')
        const col = columns[candidateKey]
        if (col) {
            const allQuoted = extractQuotedSegments(key.raw)
            return { column: col, path: segments.slice(i), pathQuoted: allQuoted.slice(i) }
        }
    }
    throw new Error(`unknown column: ${key.raw}`)
}

function buildSelectExpr(identifier, column, path, pathQuoted) {
    if (path.length === 0) {
        return identifier
    }

    if (column.flyqlType() === Type.JSON || column.flyqlType() === Type.JSONString) {
        const castIdentifier = column.flyqlType() === Type.JSONString ? `(${identifier}::jsonb)` : identifier
        for (let i = 0; i < path.length; i++) {
            validateJSONPathPart(path[i], pathQuoted[i])
        }
        return buildJSONBPathRaw(castIdentifier, path, pathQuoted)
    }

    if (column.flyqlType() === Type.Map) {
        const mapKey = path.join('.')
        const escapedKey = escapeParam(mapKey)
        return `${identifier}->${escapedKey}`
    }

    if (column.flyqlType() === Type.Array) {
        const indexStr = path.join('.')
        const index = parseInt(indexStr, 10)
        if (isNaN(index)) {
            throw new Error(`invalid array index, expected number: ${indexStr}`)
        }
        return `${identifier}[${index + 1}]`
    }

    throw new Error(`path access on non-composite column type: ${column.name}`)
}

export function generateSelect(text, columns, registry = null) {
    const raws = parseRawSelectColumns(text)
    const selectColumns = []
    const exprs = []

    for (const raw of raws) {
        const key = parseKey(raw.name)
        const { column, path, pathQuoted } = resolveColumn(key, columns)

        const identifier = getIdentifier(column)
        let sqlExpr = buildSelectExpr(identifier, column, path, pathQuoted)
        if (key.transformers.length) {
            validateTransformerChain(key.transformers, registry)
            if (path.length > 0 && (column.flyqlType() === Type.JSON || column.flyqlType() === Type.JSONString)) {
                sqlExpr = `(${sqlExpr})::text`
            }
            sqlExpr = applyTransformerSQL(sqlExpr, key.transformers, 'postgresql', registry)
        }

        let alias = raw.alias
        if (alias) {
            sqlExpr = `${sqlExpr} AS ${escapeIdentifier(alias)}`
        } else if (path.length > 0) {
            alias = key.raw.split('|')[0]
            sqlExpr = `${sqlExpr} AS ${escapeIdentifier(alias)}`
        }

        selectColumns.push({
            key,
            alias,
            column,
            sqlExpr,
        })
        exprs.push(sqlExpr)
    }

    return {
        columns: selectColumns,
        sql: exprs.join(', '),
    }
}
