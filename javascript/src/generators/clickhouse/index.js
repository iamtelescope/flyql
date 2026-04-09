import { Operator, BoolOperator, VALID_KEY_VALUE_OPERATORS, VALID_BOOL_OPERATORS } from '../../core/constants.js'
import { ValueType } from '../../types.js'
import { FunctionCall } from '../../core/expression.js'
import { parseKey } from '../../core/key.js'
import {
    Column,
    newColumn,
    normalizeClickHouseType,
    NormalizedTypeBool,
    NormalizedTypeString,
    NormalizedTypeInt,
    NormalizedTypeFloat,
    NormalizedTypeDate,
    NormalizedTypeJSON,
} from './column.js'
import { validateOperation, validateInListTypes } from './helpers.js'
import { applyTransformerSQL, validateTransformerChain } from '../transformerHelpers.js'
import { defaultRegistry } from '../../transformers/index.js'

export { Column, newColumn, normalizeClickHouseType }

const boolOpToSQL = {
    [BoolOperator.AND]: 'AND',
    [BoolOperator.OR]: 'OR',
}

const operatorToClickHouseFunc = {
    [Operator.EQUALS]: 'equals',
    [Operator.NOT_EQUALS]: 'notEquals',
    [Operator.REGEX]: 'match',
    [Operator.NOT_REGEX]: 'match',
    [Operator.GREATER_THAN]: 'greater',
    [Operator.LOWER_THAN]: 'less',
    [Operator.GREATER_OR_EQUALS_THAN]: 'greaterOrEquals',
    [Operator.LOWER_OR_EQUALS_THAN]: 'lessOrEquals',
}

function getIdentifier(column) {
    if (column.rawIdentifier) {
        return column.rawIdentifier
    }
    return column.name
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

function validateJSONPathPart(part) {
    if (!part) {
        throw new Error('Invalid JSON path part')
    }
    if (!jsonKeyPattern.test(part)) {
        throw new Error('Invalid JSON path part')
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

const durationUnitMap = {
    s: 'SECOND',
    m: 'MINUTE',
    h: 'HOUR',
    d: 'DAY',
}

function functionCallToSQL(fc, tz) {
    switch (fc.name) {
        case 'now':
            return 'now()'
        case 'today': {
            const timezone = fc.timezone || tz || 'UTC'
            return `toDate(toTimezone(now(), ${escapeParam(timezone)}))`
        }
        case 'startOf': {
            const timezone = fc.timezone || tz || 'UTC'
            const escapedTz = escapeParam(timezone)
            switch (fc.unit) {
                case 'day':
                    return `toStartOfDay(toTimezone(now(), ${escapedTz}))`
                case 'week':
                    return `toStartOfWeek(toTimezone(now(), ${escapedTz}), 1)`
                case 'month':
                    return `toStartOfMonth(toTimezone(now(), ${escapedTz}))`
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
                intervals.push(`INTERVAL ${value} ${sqlUnit}`)
            }
            return `(now() - ${intervals.join(' - ')})`
        }
        default:
            throw new Error(`unsupported function: ${fc.name}`)
    }
}

function resolveRhsColumnRef(value, columns) {
    try {
        const key = parseKey(value)
        const result = resolveColumn(key, columns)
        return buildSelectExpr(result.column, result.path)
    } catch {
        return null
    }
}

function expressionToSQLSimple(expr, columns, registry = null, options = {}) {
    const columnName = expr.key.segments[0]
    const column = columns[columnName]
    if (!column) {
        throw new Error(`unknown column: ${columnName}`)
    }

    if (expr.valueType === ValueType.FUNCTION) {
        if (expr.key.isSegmented) {
            throw new Error('temporal functions are not supported with segmented keys')
        }
        if (column.normalizedType && column.normalizedType !== NormalizedTypeDate) {
            throw new Error(
                `temporal function '${expr.value.name}' is not valid for column '${columnName}' of type '${column.normalizedType}'`,
            )
        }
        const fc = expr.value
        const sqlValue = functionCallToSQL(fc, options.defaultTimezone)
        let colRef = getIdentifier(column)
        if (expr.key.transformers.length) {
            validateTransformerChain(expr.key.transformers, registry)
            colRef = applyTransformerSQL(colRef, expr.key.transformers, 'clickhouse', registry)
        }
        return `${colRef} ${expr.operator} ${sqlValue}`
    }

    let rhsRef = null
    if (expr.valueType === ValueType.COLUMN) {
        rhsRef = resolveRhsColumnRef(String(expr.value), columns)
    }

    if (rhsRef !== null) {
        let colRef = getIdentifier(column)
        if (expr.key.transformers.length) {
            validateTransformerChain(expr.key.transformers, registry)
            colRef = applyTransformerSQL(colRef, expr.key.transformers, 'clickhouse', registry)
        }
        switch (expr.operator) {
            case Operator.REGEX:
                return `match(${colRef}, ${rhsRef})`
            case Operator.NOT_REGEX:
                return `NOT match(${colRef}, ${rhsRef})`
            case Operator.LIKE:
                return `${colRef} LIKE ${rhsRef}`
            case Operator.NOT_LIKE:
                return `${colRef} NOT LIKE ${rhsRef}`
            case Operator.ILIKE:
                return `${colRef} ILIKE ${rhsRef}`
            case Operator.NOT_ILIKE:
                return `${colRef} NOT ILIKE ${rhsRef}`
            default:
                return `${colRef} ${expr.operator} ${rhsRef}`
        }
    }

    if (column.values && column.values.length > 0) {
        const valueStr = String(expr.value)
        if (!column.values.includes(valueStr)) {
            throw new Error(`unknown value: ${expr.value}`)
        }
    }

    if (column.normalizedType && !expr.key.transformers.length) {
        validateOperation(expr.value, column.normalizedType, expr.operator)
    }

    let colRef = getIdentifier(column)
    if (expr.key.transformers.length) {
        validateTransformerChain(expr.key.transformers, registry)
        colRef = applyTransformerSQL(colRef, expr.key.transformers, 'clickhouse', registry)
    }

    switch (expr.operator) {
        case Operator.REGEX: {
            const value = escapeParam(String(expr.value))
            return `match(${colRef}, ${value})`
        }
        case Operator.NOT_REGEX: {
            const value = escapeParam(String(expr.value))
            return `NOT match(${colRef}, ${value})`
        }
        case Operator.LIKE: {
            const value = escapeLikeParam(expr.value)
            return `${colRef} LIKE ${value}`
        }
        case Operator.NOT_LIKE: {
            const value = escapeLikeParam(expr.value)
            return `${colRef} NOT LIKE ${value}`
        }
        case Operator.ILIKE: {
            const value = escapeLikeParam(expr.value)
            return `${colRef} ILIKE ${value}`
        }
        case Operator.NOT_ILIKE: {
            const value = escapeLikeParam(expr.value)
            return `${colRef} NOT ILIKE ${value}`
        }
        case Operator.EQUALS:
        case Operator.NOT_EQUALS: {
            if (expr.valueType === ValueType.NULL) {
                return expr.operator === Operator.EQUALS ? `${colRef} IS NULL` : `${colRef} IS NOT NULL`
            }
            if (expr.valueType === ValueType.BOOLEAN) {
                const boolLiteral = expr.value ? 'true' : 'false'
                return `${colRef} ${expr.operator} ${boolLiteral}`
            }
            const escapedValue = escapeParam(String(expr.value))
            return `${colRef} ${expr.operator} ${escapedValue}`
        }
        default: {
            const value = escapeParam(expr.value)
            return `${colRef} ${expr.operator} ${value}`
        }
    }
}

const validAliasPattern = /^[a-zA-Z_][a-zA-Z0-9_.]*$/

function expressionToSQLSegmented(expr, columns) {
    const reverseOperator = expr.operator === Operator.NOT_REGEX ? 'NOT ' : ''
    const funcName = operatorToClickHouseFunc[expr.operator]
    if (!funcName) {
        throw new Error(`unsupported operator for segmented expression: ${expr.operator}`)
    }
    const columnName = expr.key.segments[0]

    const column = columns[columnName]
    if (!column) {
        throw new Error(`unknown column: ${columnName}`)
    }

    const hasTransformers = expr.key.transformers && expr.key.transformers.length

    if (column.normalizedType && !hasTransformers) {
        validateOperation(expr.value, column.normalizedType, expr.operator)
    }

    const colId = getIdentifier(column)

    if (column.jsonString) {
        const jsonPath = expr.key.segments.slice(1)
        const jsonPathParts = jsonPath.map((p) => escapeParam(p))
        const jsonPathStr = jsonPathParts.join(', ')

        let rhsRef = null
        if (expr.valueType === ValueType.COLUMN) {
            rhsRef = resolveRhsColumnRef(String(expr.value), columns)
        }
        if (rhsRef !== null) {
            let leafExpr = `JSONExtractString(${colId}, ${jsonPathStr})`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'clickhouse')
            }
            return `${reverseOperator}${funcName}(${leafExpr}, ${rhsRef})`
        }

        const strValue = escapeParam(expr.value)
        if (hasTransformers) {
            const leafExpr = applyTransformerSQL(
                `JSONExtractString(${colId}, ${jsonPathStr})`,
                expr.key.transformers,
                'clickhouse',
            )
            return `${reverseOperator}${funcName}(${leafExpr}, ${strValue})`
        }
        const multiIf = [
            `JSONType(${colId}, ${jsonPathStr}) = 'String', ${funcName}(JSONExtractString(${colId}, ${jsonPathStr}), ${strValue})`,
        ]

        if (
            (typeof expr.value === 'number' || typeof expr.value === 'bigint') &&
            expr.operator !== Operator.REGEX &&
            expr.operator !== Operator.NOT_REGEX
        ) {
            const numValue = String(expr.value)
            multiIf.push(
                `JSONType(${colId}, ${jsonPathStr}) = 'Int64', ${funcName}(JSONExtractInt(${colId}, ${jsonPathStr}), ${numValue})`,
                `JSONType(${colId}, ${jsonPathStr}) = 'Double', ${funcName}(JSONExtractFloat(${colId}, ${jsonPathStr}), ${numValue})`,
                `JSONType(${colId}, ${jsonPathStr}) = 'Bool', ${funcName}(JSONExtractBool(${colId}, ${jsonPathStr}), ${numValue})`,
            )
        }
        multiIf.push('0')
        return `${reverseOperator}multiIf(${multiIf.join(',')})`
    } else if (column.isJSON) {
        const jsonPath = expr.key.segments.slice(1)
        for (const part of jsonPath) {
            validateJSONPathPart(part)
        }
        const pathParts = jsonPath.map((part) => '`' + part + '`')
        const jsonPathStr = pathParts.join('.')
        let rhsRef = null
        if (expr.valueType === ValueType.COLUMN) {
            rhsRef = resolveRhsColumnRef(String(expr.value), columns)
        }
        const value = rhsRef !== null ? rhsRef : escapeParam(expr.value)
        let leafExpr = `${colId}.${jsonPathStr}`
        if (hasTransformers) {
            leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'clickhouse')
        }
        return `${leafExpr} ${expr.operator} ${value}`
    } else if (column.isMap) {
        const mapKey = expr.key.segments.slice(1).join('.')
        const escapedMapKey = escapeParam(mapKey)
        let rhsRef = null
        if (expr.valueType === ValueType.COLUMN) {
            rhsRef = resolveRhsColumnRef(String(expr.value), columns)
        }
        const value = rhsRef !== null ? rhsRef : escapeParam(expr.value)
        let leafExpr = `${colId}[${escapedMapKey}]`
        if (hasTransformers) {
            leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'clickhouse')
        }
        return `${reverseOperator}${funcName}(${leafExpr}, ${value})`
    } else if (column.isArray) {
        const arrayIndexStr = expr.key.segments.slice(1).join('.')
        const arrayIndex = parseInt(arrayIndexStr, 10)
        if (isNaN(arrayIndex)) {
            throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
        }
        let rhsRef = null
        if (expr.valueType === ValueType.COLUMN) {
            rhsRef = resolveRhsColumnRef(String(expr.value), columns)
        }
        const value = rhsRef !== null ? rhsRef : escapeParam(expr.value)
        let leafExpr = `${colId}[${arrayIndex}]`
        if (hasTransformers) {
            leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'clickhouse')
        }
        return `${reverseOperator}${funcName}(${leafExpr}, ${value})`
    } else {
        throw new Error('path search for unsupported column type')
    }
}

function inExpressionToSQL(expr, columns) {
    const isNotIn = expr.operator === Operator.NOT_IN

    if (!expr.values || expr.values.length === 0) {
        return isNotIn ? '1' : '0'
    }

    const columnName = expr.key.segments[0]
    const column = columns[columnName]
    if (!column) {
        throw new Error(`unknown column: ${columnName}`)
    }

    const isHeterogeneous = expr.valuesTypes && new Set(expr.valuesTypes).size > 1
    if (column.normalizedType && !expr.key.isSegmented && !isHeterogeneous) {
        validateInListTypes(expr.values, column.normalizedType)
    }

    const valueParts = []
    for (let i = 0; i < expr.values.length; i++) {
        let rhsRef = null
        if (expr.valuesTypes && i < expr.valuesTypes.length && expr.valuesTypes[i] === ValueType.COLUMN) {
            rhsRef = resolveRhsColumnRef(String(expr.values[i]), columns)
        }
        valueParts.push(rhsRef !== null ? rhsRef : escapeParam(expr.values[i]))
    }
    const valuesSQL = valueParts.join(', ')

    const sqlOp = isNotIn ? 'NOT IN' : 'IN'

    const colId = getIdentifier(column)

    const hasTransformers = expr.key.transformers && expr.key.transformers.length

    if (expr.key.isSegmented) {
        if (column.isJSON) {
            const jsonPath = expr.key.segments.slice(1)
            for (const part of jsonPath) {
                validateJSONPathPart(part)
            }
            const pathParts = jsonPath.map((part) => `$.${part}`)
            const jsonPathStr = pathParts.join('.')
            let leafExpr = `JSON_VALUE(${colId}, '${jsonPathStr}')`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'clickhouse')
            }
            return `${leafExpr} ${sqlOp} (${valuesSQL})`
        } else if (column.jsonString) {
            const jsonPath = expr.key.segments.slice(1)
            const jsonPathParts = jsonPath.map((p) => escapeParam(p))
            const jsonPathStr = jsonPathParts.join(', ')
            let leafExpr = `JSONExtractString(${colId}, ${jsonPathStr})`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'clickhouse')
            }
            return `${leafExpr} ${sqlOp} (${valuesSQL})`
        } else if (column.isMap) {
            const mapKey = expr.key.segments.slice(1).join('.')
            const escapedMapKey = escapeParam(mapKey)
            let leafExpr = `${colId}[${escapedMapKey}]`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'clickhouse')
            }
            return `${leafExpr} ${sqlOp} (${valuesSQL})`
        } else if (column.isArray) {
            const arrayIndexStr = expr.key.segments.slice(1).join('.')
            const arrayIndex = parseInt(arrayIndexStr, 10)
            if (isNaN(arrayIndex)) {
                throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
            }
            let leafExpr = `${colId}[${arrayIndex}]`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'clickhouse')
            }
            return `${leafExpr} ${sqlOp} (${valuesSQL})`
        } else {
            throw new Error('path search for unsupported column type')
        }
    }

    let colRef = colId
    if (hasTransformers) {
        colRef = applyTransformerSQL(colRef, expr.key.transformers, 'clickhouse')
    }

    return `${colRef} ${sqlOp} (${valuesSQL})`
}

function truthyExpressionToSQL(expr, columns) {
    const columnName = expr.key.segments[0]
    const column = columns[columnName]
    if (!column) {
        throw new Error(`unknown column: ${columnName}`)
    }

    const colId = getIdentifier(column)

    const hasTransformers = expr.key.transformers && expr.key.transformers.length

    if (expr.key.isSegmented) {
        if (column.jsonString) {
            const jsonPath = expr.key.segments.slice(1)
            const jsonPathParts = jsonPath.map((p) => escapeParam(p))
            const jsonPathStr = jsonPathParts.join(', ')
            let leafExpr = `JSONExtractString(${colId}, ${jsonPathStr})`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'clickhouse')
            }
            return `(JSONHas(${colId}, ${jsonPathStr}) AND ${leafExpr} != '')`
        } else if (column.isJSON) {
            const jsonPath = expr.key.segments.slice(1)
            for (const part of jsonPath) {
                validateJSONPathPart(part)
            }
            const pathParts = jsonPath.map((part) => '`' + part + '`')
            const jsonPathStr = pathParts.join('.')
            let leafExpr = `${colId}.${jsonPathStr}`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'clickhouse')
                return `(${leafExpr} IS NOT NULL AND ${leafExpr} != '')`
            }
            return `(${leafExpr} IS NOT NULL)`
        } else if (column.isMap) {
            const mapKey = expr.key.segments.slice(1).join('.')
            const escapedMapKey = escapeParam(mapKey)
            let leafExpr = `${colId}[${escapedMapKey}]`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'clickhouse')
            }
            return `(mapContains(${colId}, ${escapedMapKey}) AND ${leafExpr} != '')`
        } else if (column.isArray) {
            const arrayIndexStr = expr.key.segments.slice(1).join('.')
            const arrayIndex = parseInt(arrayIndexStr, 10)
            if (isNaN(arrayIndex)) {
                throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
            }
            let leafExpr = `${colId}[${arrayIndex}]`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'clickhouse')
            }
            return `(length(${colId}) >= ${arrayIndex} AND ${leafExpr} != '')`
        } else {
            throw new Error('path search for unsupported column type')
        }
    }

    if (hasTransformers) {
        const colRef = applyTransformerSQL(colId, expr.key.transformers, 'clickhouse')
        return `(${colRef} IS NOT NULL AND ${colRef} != '')`
    }

    if (column.jsonString) {
        return `(${colId} IS NOT NULL AND ${colId} != '' AND JSONLength(${colId}) > 0)`
    }

    switch (column.normalizedType) {
        case NormalizedTypeBool:
            return colId
        case NormalizedTypeString:
            return `(${colId} IS NOT NULL AND ${colId} != '')`
        case NormalizedTypeInt:
        case NormalizedTypeFloat:
            return `(${colId} IS NOT NULL AND ${colId} != 0)`
        case NormalizedTypeDate:
            return `(${colId} IS NOT NULL)`
        default:
            return `(${colId} IS NOT NULL)`
    }
}

function falsyExpressionToSQL(expr, columns) {
    const columnName = expr.key.segments[0]
    const column = columns[columnName]
    if (!column) {
        throw new Error(`unknown column: ${columnName}`)
    }

    const colId = getIdentifier(column)

    const hasTransformers = expr.key.transformers && expr.key.transformers.length

    if (expr.key.isSegmented) {
        if (column.jsonString) {
            const jsonPath = expr.key.segments.slice(1)
            const jsonPathParts = jsonPath.map((p) => escapeParam(p))
            const jsonPathStr = jsonPathParts.join(', ')
            let leafExpr = `JSONExtractString(${colId}, ${jsonPathStr})`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'clickhouse')
            }
            return `(NOT JSONHas(${colId}, ${jsonPathStr}) OR ${leafExpr} = '')`
        } else if (column.isJSON) {
            const jsonPath = expr.key.segments.slice(1)
            for (const part of jsonPath) {
                validateJSONPathPart(part)
            }
            const pathParts = jsonPath.map((part) => '`' + part + '`')
            const jsonPathStr = pathParts.join('.')
            let leafExpr = `${colId}.${jsonPathStr}`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'clickhouse')
                return `(${leafExpr} IS NULL OR ${leafExpr} = '')`
            }
            return `(${leafExpr} IS NULL)`
        } else if (column.isMap) {
            const mapKey = expr.key.segments.slice(1).join('.')
            const escapedMapKey = escapeParam(mapKey)
            let leafExpr = `${colId}[${escapedMapKey}]`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'clickhouse')
            }
            return `(NOT mapContains(${colId}, ${escapedMapKey}) OR ${leafExpr} = '')`
        } else if (column.isArray) {
            const arrayIndexStr = expr.key.segments.slice(1).join('.')
            const arrayIndex = parseInt(arrayIndexStr, 10)
            if (isNaN(arrayIndex)) {
                throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
            }
            let leafExpr = `${colId}[${arrayIndex}]`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'clickhouse')
            }
            return `(length(${colId}) < ${arrayIndex} OR ${leafExpr} = '')`
        } else {
            throw new Error('path search for unsupported column type')
        }
    }

    if (hasTransformers) {
        const colRef = applyTransformerSQL(colId, expr.key.transformers, 'clickhouse')
        return `(${colRef} IS NULL OR ${colRef} = '')`
    }

    if (column.jsonString) {
        return `(${colId} IS NULL OR ${colId} = '' OR JSONLength(${colId}) = 0)`
    }

    switch (column.normalizedType) {
        case NormalizedTypeBool:
            return `NOT ${colId}`
        case NormalizedTypeString:
            return `(${colId} IS NULL OR ${colId} = '')`
        case NormalizedTypeInt:
        case NormalizedTypeFloat:
            return `(${colId} IS NULL OR ${colId} = 0)`
        case NormalizedTypeDate:
            return `(${colId} IS NULL)`
        default:
            return `(${colId} IS NULL)`
    }
}

function hasExpressionToSQL(expr, columns) {
    const isNotHas = expr.operator === Operator.NOT_HAS
    const columnName = expr.key.segments[0]
    const column = columns[columnName]
    if (!column) {
        throw new Error(`unknown column: ${columnName}`)
    }

    let rhsRef = null
    if (expr.valueType === ValueType.COLUMN) {
        rhsRef = resolveRhsColumnRef(String(expr.value), columns)
    }
    const value = rhsRef !== null ? rhsRef : escapeParam(expr.value)
    const colId = getIdentifier(column)

    const hasTransformers = expr.key.transformers && expr.key.transformers.length

    if (expr.key.isSegmented) {
        if (column.jsonString) {
            const jsonPath = expr.key.segments.slice(1)
            const jsonPathParts = jsonPath.map((p) => escapeParam(p))
            const jsonPathStr = jsonPathParts.join(', ')
            let leafExpr = `JSONExtractString(${colId}, ${jsonPathStr})`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'clickhouse')
            }
            if (isNotHas) {
                return `position(${leafExpr}, ${value}) = 0`
            }
            return `position(${leafExpr}, ${value}) > 0`
        } else if (column.isJSON) {
            const jsonPath = expr.key.segments.slice(1)
            for (const part of jsonPath) {
                validateJSONPathPart(part)
            }
            const jsonPathStr = jsonPath.map((p) => p).join('.')
            let leafExpr = `JSON_VALUE(${colId}, '$.${jsonPathStr}')`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'clickhouse')
            }
            if (isNotHas) {
                return `position(${leafExpr}, ${value}) = 0`
            }
            return `position(${leafExpr}, ${value}) > 0`
        } else if (column.isMap) {
            const mapKey = expr.key.segments.slice(1).join('.')
            const escapedMapKey = escapeParam(mapKey)
            let leafExpr = `${colId}[${escapedMapKey}]`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'clickhouse')
            }
            if (isNotHas) {
                return `position(${leafExpr}, ${value}) = 0`
            }
            return `position(${leafExpr}, ${value}) > 0`
        } else if (column.isArray) {
            const arrayIndexStr = expr.key.segments.slice(1).join('.')
            const arrayIndex = parseInt(arrayIndexStr, 10)
            if (isNaN(arrayIndex)) {
                throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
            }
            let leafExpr = `${colId}[${arrayIndex}]`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'clickhouse')
            }
            if (isNotHas) {
                return `position(${leafExpr}, ${value}) = 0`
            }
            return `position(${leafExpr}, ${value}) > 0`
        } else {
            throw new Error('path search for unsupported column type')
        }
    }

    let colRef = colId
    if (hasTransformers) {
        colRef = applyTransformerSQL(colRef, expr.key.transformers, 'clickhouse')
    }

    let isArrayResult = column.isArray
    if (expr.key.transformers && expr.key.transformers.length) {
        const reg = defaultRegistry()
        const lastT = reg.get(expr.key.transformers[expr.key.transformers.length - 1].name)
        if (lastT && lastT.outputType === 'array') isArrayResult = true
    }

    if (isArrayResult) {
        if (isNotHas) {
            return `NOT has(${colRef}, ${value})`
        }
        return `has(${colRef}, ${value})`
    }

    if (column.isMap) {
        if (isNotHas) {
            return `NOT mapContains(${colRef}, ${value})`
        }
        return `mapContains(${colRef}, ${value})`
    }

    if (column.isJSON) {
        if (isNotHas) {
            return `NOT JSON_EXISTS(${colRef}, concat('$.', ${value}))`
        }
        return `JSON_EXISTS(${colRef}, concat('$.', ${value}))`
    }

    if (column.jsonString) {
        if (isNotHas) {
            return `NOT JSONHas(${colRef}, ${value})`
        }
        return `JSONHas(${colRef}, ${value})`
    }

    if (column.normalizedType === NormalizedTypeString) {
        if (isNotHas) {
            return `(${colRef} IS NULL OR position(${colRef}, ${value}) = 0)`
        }
        return `position(${colRef}, ${value}) > 0`
    }

    throw new Error(`has operator is not supported for column type: ${column.normalizedType}`)
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
        text = `(${left} ${boolOpToSQL[root.boolOperator]} ${right})`
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
            return { column: col, path: segments.slice(i) }
        }
    }
    throw new Error(`unknown column: ${key.raw}`)
}

function buildSelectExpr(column, path) {
    const colId = getIdentifier(column)

    if (path.length === 0) {
        return colId
    }

    if (column.isJSON) {
        for (const part of path) {
            validateJSONPathPart(part)
        }
        const pathParts = path.map((part) => '`' + part + '`')
        return `${colId}.${pathParts.join('.')}`
    }

    if (column.jsonString) {
        const jsonPathParts = path.map((p) => escapeParam(p))
        return `JSONExtractString(${colId}, ${jsonPathParts.join(', ')})`
    }

    if (column.isMap) {
        const mapKey = path.join('.')
        const escapedKey = escapeParam(mapKey)
        return `${colId}[${escapedKey}]`
    }

    if (column.isArray) {
        const indexStr = path.join('.')
        const index = parseInt(indexStr, 10)
        if (isNaN(index)) {
            throw new Error(`invalid array index, expected number: ${indexStr}`)
        }
        return `${colId}[${index}]`
    }

    throw new Error(`path access on non-composite column type: ${column.name}`)
}

export function generateSelect(text, columns, registry = null) {
    const raws = parseRawSelectColumns(text)
    const selectColumns = []
    const exprs = []

    for (const raw of raws) {
        const key = parseKey(raw.name)
        const { column, path } = resolveColumn(key, columns)

        let sqlExpr = buildSelectExpr(column, path)
        if (key.transformers.length) {
            validateTransformerChain(key.transformers, registry)
            sqlExpr = applyTransformerSQL(sqlExpr, key.transformers, 'clickhouse', registry)
        }

        let alias = raw.alias
        if (alias) {
            if (!validAliasPattern.test(alias)) {
                throw new Error(`invalid alias: ${alias}`)
            }
            const quotedAlias = alias.includes('.') ? `\`${alias}\`` : alias
            sqlExpr = `${sqlExpr} AS ${quotedAlias}`
        } else if (path.length > 0) {
            alias = key.raw.split('|')[0]
            if (!validAliasPattern.test(alias)) {
                throw new Error(`invalid alias: ${alias}`)
            }
            const quotedAlias = alias.includes('.') ? `\`${alias}\`` : alias
            sqlExpr = `${sqlExpr} AS ${quotedAlias}`
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
