import { Operator, BoolOperator, VALID_KEY_VALUE_OPERATORS, VALID_BOOL_OPERATORS } from '../../core/constants.js'
import { Type } from '../../flyql_type.js'
import { LiteralKind } from '../../literal/literal_kind.js'
import { FunctionCall, Parameter } from '../../core/expression.js'
import { FlyqlError } from '../../core/exceptions.js'
import { parseKey } from '../../core/key.js'
import { validateOperation, validateInListTypes } from './helpers.js'
import { applyTransformerSQL, validateTransformerChain } from '../transformerHelpers.js'
import { defaultRegistry } from '../../transformers/index.js'
import { Column, newColumn, normalizeStarRocksType } from './column.js'
import { Column as FCol, ColumnSchema } from '../../core/column.js'

export { Column, newColumn, normalizeStarRocksType }

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

const operatorToStarRocksOperator = {
    [Operator.EQUALS]: '=',
    [Operator.NOT_EQUALS]: '!=',
    [Operator.REGEX]: 'regexp',
    [Operator.NOT_REGEX]: 'regexp',
    [Operator.GREATER_THAN]: '>',
    [Operator.LOWER_THAN]: '<',
    [Operator.GREATER_OR_EQUALS_THAN]: '>=',
    [Operator.LOWER_OR_EQUALS_THAN]: '<=',
}

function getIdentifier(column) {
    if (column.rawIdentifier) {
        return column.rawIdentifier
    }
    const escaped = column.name.replace(/`/g, '``')
    return `\`${escaped}\``
}

const jsonKeyPattern = /^[a-zA-Z_][.a-zA-Z0-9_-]*$/
const validAliasPattern = /^[a-zA-Z_][a-zA-Z0-9_.]*$/

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
    if (!part) throw new Error('Invalid JSON path part')
    if (!jsonKeyPattern.test(part)) throw new Error('Invalid JSON path part')
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
    if (item === null || item === undefined) return 'NULL'
    if (typeof item === 'string') {
        let result = "'"
        for (const c of item) {
            result += escapeCharsMap[c] !== undefined ? escapeCharsMap[c] : c
        }
        return result + "'"
    }
    if (typeof item === 'boolean') return item ? 'true' : 'false'
    if (typeof item === 'bigint') return String(item)
    if (typeof item === 'number') {
        if (!Number.isFinite(item)) throw new Error(`unsupported numeric value: ${item}`)
        return String(item)
    }
    throw new Error(`unsupported type for escapeParam: ${typeof item}`)
}

export function quoteJsonPathPart(part) {
    let result = '\'"'
    for (const c of part) {
        result += escapeCharsMap[c] !== undefined ? escapeCharsMap[c] : c
    }
    return result + '"\''
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
            return 'NOW()'
        case 'today': {
            const timezone = fc.timezone || tz || 'UTC'
            return `DATE(CONVERT_TZ(NOW(), 'UTC', ${escapeParam(timezone)}))`
        }
        case 'startOf': {
            const timezone = fc.timezone || tz || 'UTC'
            const escapedTz = escapeParam(timezone)
            switch (fc.unit) {
                case 'day':
                    return `DATE_FORMAT(CONVERT_TZ(NOW(), 'UTC', ${escapedTz}), '%Y-%m-%d 00:00:00')`
                case 'week':
                    return `DATE_TRUNC('WEEK', CONVERT_TZ(NOW(), 'UTC', ${escapedTz}))`
                case 'month':
                    return `DATE_TRUNC('MONTH', CONVERT_TZ(NOW(), 'UTC', ${escapedTz}))`
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
            return `(NOW() - ${intervals.join(' - ')})`
        }
        default:
            throw new Error(`unsupported function: ${fc.name}`)
    }
}

function isNumber(value) {
    if (typeof value === 'number') return true
    if (typeof value === 'bigint') return true
    if (typeof value === 'string') {
        return !isNaN(parseFloat(value)) || !isNaN(parseInt(value, 10))
    }
    return false
}

function expressionToSQLSimple(expr, columns, registry = null, options = {}) {
    const columnName = expr.key.segments[0]
    const column = columns[columnName]
    if (!column) throw new Error(`unknown column: ${columnName}`)

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
            colRef = applyTransformerSQL(colRef, expr.key.transformers, 'starrocks', registry)
        }
        return `${colRef} ${expr.operator} ${sqlValue}`
    }

    const rhsRef = expr.valueType === LiteralKind.COLUMN ? resolveRhsColumnRef(String(expr.value), columns) : null

    if (rhsRef !== null) {
        let colRef = getIdentifier(column)
        if (expr.key.transformers.length) {
            validateTransformerChain(expr.key.transformers, registry)
            colRef = applyTransformerSQL(colRef, expr.key.transformers, 'starrocks', registry)
        }
        switch (expr.operator) {
            case Operator.REGEX:
                return `regexp(${colRef}, ${rhsRef})`
            case Operator.NOT_REGEX:
                return `NOT regexp(${colRef}, ${rhsRef})`
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
        if (!column.values.includes(String(expr.value))) throw new Error(`unknown value: ${expr.value}`)
    }

    if (column.flyqlType() && !expr.key.transformers.length) {
        validateOperation(expr.value, column.flyqlType(), expr.operator)
    }

    let colRef = getIdentifier(column)
    if (expr.key.transformers.length) {
        validateTransformerChain(expr.key.transformers, registry)
        colRef = applyTransformerSQL(colRef, expr.key.transformers, 'starrocks', registry)
    }

    switch (expr.operator) {
        case Operator.REGEX: {
            const value = escapeParam(String(expr.value))
            return `regexp(${colRef}, ${value})`
        }
        case Operator.NOT_REGEX: {
            const value = escapeParam(String(expr.value))
            return `NOT regexp(${colRef}, ${value})`
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
            if (expr.valueType === LiteralKind.NULL) {
                return expr.operator === Operator.EQUALS ? `${colRef} IS NULL` : `${colRef} IS NOT NULL`
            }
            if (expr.valueType === LiteralKind.BOOLEAN) {
                const boolLiteral = expr.value ? 'true' : 'false'
                return `${colRef} ${expr.operator} ${boolLiteral}`
            }
            const escapedValue = escapeParam(expr.value)
            return `${colRef} ${expr.operator} ${escapedValue}`
        }
        default: {
            const value = escapeParam(expr.value)
            return `${colRef} ${expr.operator} ${value}`
        }
    }
}

function expressionToSQLSegmented(expr, columns) {
    const reverseOperator = expr.operator === Operator.NOT_REGEX ? 'NOT ' : ''
    const operator = operatorToStarRocksOperator[expr.operator]
    const columnName = expr.key.segments[0]
    const column = columns[columnName]
    if (!column) throw new Error(`unknown column: ${columnName}`)

    const hasTransformers = expr.key.transformers && expr.key.transformers.length

    if (column.flyqlType() && !hasTransformers) validateOperation(expr.value, column.flyqlType(), expr.operator)

    const colId = getIdentifier(column)
    const isRegexOp = expr.operator === Operator.REGEX || expr.operator === Operator.NOT_REGEX

    if (column.flyqlType() === Type.JSON) {
        const jsonPath = expr.key.segments.slice(1)
        for (const part of jsonPath) validateJSONPathPart(part)
        const jsonPathStr = jsonPath.map((p) => quoteJsonPathPart(p)).join('->')
        const rhsRef = expr.valueType === LiteralKind.COLUMN ? resolveRhsColumnRef(String(expr.value), columns) : null
        const value = rhsRef !== null ? rhsRef : escapeParam(expr.value)
        let columnExp = `${colId}->${jsonPathStr}`
        if (isRegexOp || hasTransformers) {
            columnExp = `cast(${columnExp} as string)`
        }
        if (hasTransformers) {
            columnExp = applyTransformerSQL(columnExp, expr.key.transformers, 'starrocks')
        }
        return `${columnExp} ${reverseOperator}${operator} ${value}`
    } else if (column.flyqlType() === Type.Map) {
        const mapPath = expr.key.segments.slice(1).map((p) => escapeParam(p))
        const mapKey = mapPath.join('][')
        const rhsRef = expr.valueType === LiteralKind.COLUMN ? resolveRhsColumnRef(String(expr.value), columns) : null
        const value = rhsRef !== null ? rhsRef : escapeParam(expr.value)
        let columnExp = `${colId}[${mapKey}]`
        if (hasTransformers) {
            columnExp = applyTransformerSQL(columnExp, expr.key.transformers, 'starrocks')
        }
        return `${columnExp} ${reverseOperator}${operator} ${value}`
    } else if (column.flyqlType() === Type.Array) {
        const arrayIndexStr = expr.key.segments.slice(1).join('.')
        const arrayIndex = parseInt(arrayIndexStr, 10)
        if (isNaN(arrayIndex)) throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
        const rhsRef = expr.valueType === LiteralKind.COLUMN ? resolveRhsColumnRef(String(expr.value), columns) : null
        const value = rhsRef !== null ? rhsRef : escapeParam(expr.value)
        let columnExp = `${colId}[${arrayIndex}]`
        if (hasTransformers) {
            columnExp = applyTransformerSQL(columnExp, expr.key.transformers, 'starrocks')
        }
        return `${columnExp} ${reverseOperator}${operator} ${value}`
    } else if (column.flyqlType() === Type.Struct) {
        const structPath = expr.key.segments.slice(1)
        const structColumn = structPath.join('`.`')
        const rhsRef = expr.valueType === LiteralKind.COLUMN ? resolveRhsColumnRef(String(expr.value), columns) : null
        const value = rhsRef !== null ? rhsRef : escapeParam(expr.value)
        let columnExp = `${colId}.\`${structColumn}\``
        if (hasTransformers) {
            columnExp = applyTransformerSQL(columnExp, expr.key.transformers, 'starrocks')
        }
        return `${columnExp} ${reverseOperator}${operator} ${value}`
    } else if (column.flyqlType() === Type.JSONString) {
        const jsonPath = expr.key.segments.slice(1)
        for (const part of jsonPath) validateJSONPathPart(part)
        const jsonPathStr = jsonPath.map((p) => quoteJsonPathPart(p)).join('->')
        const rhsRef = expr.valueType === LiteralKind.COLUMN ? resolveRhsColumnRef(String(expr.value), columns) : null
        const value = rhsRef !== null ? rhsRef : escapeParam(expr.value)
        let columnExp = `parse_json(${colId})->${jsonPathStr}`
        if (isRegexOp || hasTransformers) {
            columnExp = `cast(${columnExp} as string)`
        }
        if (hasTransformers) {
            columnExp = applyTransformerSQL(columnExp, expr.key.transformers, 'starrocks')
        }
        return `${columnExp} ${reverseOperator}${operator} ${value}`
    } else {
        throw new Error('path search for unsupported column type')
    }
}

function inExpressionToSQL(expr, columns) {
    const isNotIn = expr.operator === Operator.NOT_IN
    if (!expr.values || expr.values.length === 0) return isNotIn ? '1' : '0'

    const columnName = expr.key.segments[0]
    const column = columns[columnName]
    if (!column) throw new Error(`unknown column: ${columnName}`)

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

    const colId = getIdentifier(column)

    const hasTransformers = expr.key.transformers && expr.key.transformers.length

    if (expr.key.isSegmented) {
        if (column.flyqlType() === Type.JSON) {
            const jsonPath = expr.key.segments.slice(1)
            for (const part of jsonPath) validateJSONPathPart(part)
            const jsonPathStr = jsonPath.map((p) => quoteJsonPathPart(p)).join('->')
            let leafExpr = `${colId}->${jsonPathStr}`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(`cast(${leafExpr} as string)`, expr.key.transformers, 'starrocks')
            }
            return `${leafExpr} ${sqlOp} (${valuesSQL})`
        } else if (column.flyqlType() === Type.Map) {
            const mapPath = expr.key.segments.slice(1).map((p) => escapeParam(p))
            const mapKey = mapPath.join('][')
            let leafExpr = `${colId}[${mapKey}]`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'starrocks')
            }
            return `${leafExpr} ${sqlOp} (${valuesSQL})`
        } else if (column.flyqlType() === Type.Array) {
            const arrayIndexStr = expr.key.segments.slice(1).join('.')
            const arrayIndex = parseInt(arrayIndexStr, 10)
            if (isNaN(arrayIndex)) throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
            let leafExpr = `${colId}[${arrayIndex}]`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'starrocks')
            }
            return `${leafExpr} ${sqlOp} (${valuesSQL})`
        } else if (column.flyqlType() === Type.Struct) {
            const structColumn = expr.key.segments.slice(1).join('`.`')
            let leafExpr = `${colId}.\`${structColumn}\``
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'starrocks')
            }
            return `${leafExpr} ${sqlOp} (${valuesSQL})`
        } else if (column.flyqlType() === Type.JSONString) {
            const jsonPath = expr.key.segments.slice(1)
            const jsonPathStr = jsonPath.map((p) => quoteJsonPathPart(p)).join('->')
            let leafExpr = `parse_json(${colId})->${jsonPathStr}`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(`cast(${leafExpr} as string)`, expr.key.transformers, 'starrocks')
            }
            return `${leafExpr} ${sqlOp} (${valuesSQL})`
        } else {
            throw new Error('path search for unsupported column type')
        }
    }

    let colRef = colId
    if (hasTransformers) {
        colRef = applyTransformerSQL(colRef, expr.key.transformers, 'starrocks')
    }

    return `${colRef} ${sqlOp} (${valuesSQL})`
}

function truthyExpressionToSQL(expr, columns) {
    const columnName = expr.key.segments[0]
    const column = columns[columnName]
    if (!column) throw new Error(`unknown column: ${columnName}`)

    const colId = getIdentifier(column)

    const hasTransformers = expr.key.transformers && expr.key.transformers.length

    if (expr.key.isSegmented) {
        if (column.flyqlType() === Type.JSON) {
            const jsonPath = expr.key.segments.slice(1)
            for (const part of jsonPath) validateJSONPathPart(part)
            const jsonPathStr = jsonPath.map((p) => quoteJsonPathPart(p)).join('->')
            let leafExpr = `${colId}->${jsonPathStr}`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(`cast(${leafExpr} as string)`, expr.key.transformers, 'starrocks')
                return `(${leafExpr} IS NOT NULL AND ${leafExpr} != '')`
            }
            return `(${leafExpr} IS NOT NULL)`
        } else if (column.flyqlType() === Type.Map) {
            const mapKey = escapeParam(expr.key.segments.slice(1).join('.'))
            let leafExpr = `${colId}[${mapKey}]`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'starrocks')
            }
            return `(element_at(${colId}, ${mapKey}) IS NOT NULL AND ${leafExpr} != '')`
        } else if (column.flyqlType() === Type.Array) {
            const arrayIndex = parseInt(expr.key.segments.slice(1).join('.'), 10)
            if (isNaN(arrayIndex))
                throw new Error(`invalid array index, expected number: ${expr.key.segments.slice(1).join('.')}`)
            let leafExpr = `${colId}[${arrayIndex}]`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'starrocks')
            }
            return `(array_length(${colId}) >= ${arrayIndex} AND ${leafExpr} != '')`
        } else if (column.flyqlType() === Type.Struct) {
            const structColumn = expr.key.segments.slice(1).join('`.`')
            let leafExpr = `${colId}.\`${structColumn}\``
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'starrocks')
            }
            return `(${leafExpr} IS NOT NULL AND ${leafExpr} != '')`
        } else if (column.flyqlType() === Type.JSONString) {
            const jsonPath = expr.key.segments.slice(1)
            const jsonPathStr = jsonPath.map((p) => quoteJsonPathPart(p)).join('->')
            let leafExpr = `parse_json(${colId})->${jsonPathStr}`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(`cast(${leafExpr} as string)`, expr.key.transformers, 'starrocks')
                return `(json_exists(parse_json(${colId}), ${jsonPathStr}) AND ${leafExpr} != '')`
            }
            return `(json_exists(parse_json(${colId}), ${jsonPathStr}) AND ${leafExpr} != '')`
        } else {
            throw new Error('path search for unsupported column type')
        }
    }

    if (hasTransformers) {
        const colRef = applyTransformerSQL(colId, expr.key.transformers, 'starrocks')
        return `(${colRef} IS NOT NULL AND ${colRef} != '')`
    }

    if (column.flyqlType() === Type.JSONString) {
        return `(${colId} IS NOT NULL AND ${colId} != '' AND json_length(${colId}) > 0)`
    }

    switch (column.flyqlType()) {
        case Type.Bool:
            return colId
        case Type.String:
            return `(${colId} IS NOT NULL AND ${colId} != '')`
        case Type.Int:
        case Type.Float:
            return `(${colId} IS NOT NULL AND ${colId} != 0)`
        case Type.Date:
            return `(${colId} IS NOT NULL)`
        default:
            return `(${colId} IS NOT NULL)`
    }
}

function falsyExpressionToSQL(expr, columns) {
    const columnName = expr.key.segments[0]
    const column = columns[columnName]
    if (!column) throw new Error(`unknown column: ${columnName}`)

    const colId = getIdentifier(column)

    const hasTransformers = expr.key.transformers && expr.key.transformers.length

    if (expr.key.isSegmented) {
        if (column.flyqlType() === Type.JSON) {
            const jsonPath = expr.key.segments.slice(1)
            for (const part of jsonPath) validateJSONPathPart(part)
            const jsonPathStr = jsonPath.map((p) => quoteJsonPathPart(p)).join('->')
            let leafExpr = `${colId}->${jsonPathStr}`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(`cast(${leafExpr} as string)`, expr.key.transformers, 'starrocks')
                return `(${leafExpr} IS NULL OR ${leafExpr} = '')`
            }
            return `(${leafExpr} IS NULL)`
        } else if (column.flyqlType() === Type.Map) {
            const mapKey = escapeParam(expr.key.segments.slice(1).join('.'))
            let leafExpr = `${colId}[${mapKey}]`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'starrocks')
            }
            return `(element_at(${colId}, ${mapKey}) IS NULL OR ${leafExpr} = '')`
        } else if (column.flyqlType() === Type.Array) {
            const arrayIndex = parseInt(expr.key.segments.slice(1).join('.'), 10)
            if (isNaN(arrayIndex)) throw new Error(`invalid array index`)
            let leafExpr = `${colId}[${arrayIndex}]`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'starrocks')
            }
            return `(array_length(${colId}) < ${arrayIndex} OR ${leafExpr} = '')`
        } else if (column.flyqlType() === Type.Struct) {
            const structColumn = expr.key.segments.slice(1).join('`.`')
            let leafExpr = `${colId}.\`${structColumn}\``
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'starrocks')
            }
            return `(${leafExpr} IS NULL OR ${leafExpr} = '')`
        } else if (column.flyqlType() === Type.JSONString) {
            const jsonPath = expr.key.segments.slice(1)
            const jsonPathStr = jsonPath.map((p) => quoteJsonPathPart(p)).join('->')
            let leafExpr = `parse_json(${colId})->${jsonPathStr}`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(`cast(${leafExpr} as string)`, expr.key.transformers, 'starrocks')
                return `(NOT json_exists(parse_json(${colId}), '$.${jsonPathStr}') OR ${leafExpr} = '')`
            }
            return `(NOT json_exists(parse_json(${colId}), '$.${jsonPathStr}') OR ${leafExpr} = '')`
        } else {
            throw new Error('path search for unsupported column type')
        }
    }

    if (hasTransformers) {
        const colRef = applyTransformerSQL(colId, expr.key.transformers, 'starrocks')
        return `(${colRef} IS NULL OR ${colRef} = '')`
    }

    if (column.flyqlType() === Type.JSONString) {
        return `(${colId} IS NULL OR ${colId} = '' OR json_length(${colId}) = 0)`
    }

    switch (column.flyqlType()) {
        case Type.Bool:
            return `NOT ${colId}`
        case Type.String:
            return `(${colId} IS NULL OR ${colId} = '')`
        case Type.Int:
        case Type.Float:
            return `(${colId} IS NULL OR ${colId} = 0)`
        case Type.Date:
            return `(${colId} IS NULL)`
        default:
            return `(${colId} IS NULL)`
    }
}

function hasExpressionToSQL(expr, columns) {
    const isNotHas = expr.operator === Operator.NOT_HAS
    const columnName = expr.key.segments[0]
    const column = columns[columnName]
    if (!column) throw new Error(`unknown column: ${columnName}`)

    const rhsRef = expr.valueType === LiteralKind.COLUMN ? resolveRhsColumnRef(String(expr.value), columns) : null
    const value = rhsRef !== null ? rhsRef : escapeParam(expr.value)
    const colId = getIdentifier(column)

    const hasTransformers = expr.key.transformers && expr.key.transformers.length

    if (expr.key.isSegmented) {
        if (column.flyqlType() === Type.JSON) {
            const jsonPath = expr.key.segments.slice(1)
            for (const part of jsonPath) validateJSONPathPart(part)
            const jsonPathStr = jsonPath.map((p) => quoteJsonPathPart(p)).join('->')
            let columnExp = `cast(${colId}->${jsonPathStr} as string)`
            if (hasTransformers) {
                columnExp = applyTransformerSQL(columnExp, expr.key.transformers, 'starrocks')
            }
            if (isNotHas) {
                return `INSTR(${columnExp}, ${value}) = 0`
            }
            return `INSTR(${columnExp}, ${value}) > 0`
        } else if (column.flyqlType() === Type.Map) {
            const mapPath = expr.key.segments.slice(1).map((p) => escapeParam(p))
            const mapKey = mapPath.join('][')
            let leafExpr = `${colId}[${mapKey}]`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'starrocks')
            }
            if (isNotHas) {
                return `INSTR(${leafExpr}, ${value}) = 0`
            }
            return `INSTR(${leafExpr}, ${value}) > 0`
        } else if (column.flyqlType() === Type.Array) {
            const arrayIndexStr = expr.key.segments.slice(1).join('.')
            const arrayIndex = parseInt(arrayIndexStr, 10)
            if (isNaN(arrayIndex)) throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
            let leafExpr = `${colId}[${arrayIndex}]`
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'starrocks')
            }
            if (isNotHas) {
                return `INSTR(${leafExpr}, ${value}) = 0`
            }
            return `INSTR(${leafExpr}, ${value}) > 0`
        } else if (column.flyqlType() === Type.Struct) {
            const structPath = expr.key.segments.slice(1)
            const structColumn = structPath.join('`.`')
            let leafExpr = `${colId}.\`${structColumn}\``
            if (hasTransformers) {
                leafExpr = applyTransformerSQL(leafExpr, expr.key.transformers, 'starrocks')
            }
            if (isNotHas) {
                return `INSTR(${leafExpr}, ${value}) = 0`
            }
            return `INSTR(${leafExpr}, ${value}) > 0`
        } else if (column.flyqlType() === Type.JSONString) {
            const jsonPath = expr.key.segments.slice(1)
            for (const part of jsonPath) validateJSONPathPart(part)
            const jsonPathStr = jsonPath.map((p) => quoteJsonPathPart(p)).join('->')
            let columnExp = `cast(parse_json(${colId})->${jsonPathStr} as string)`
            if (hasTransformers) {
                columnExp = applyTransformerSQL(columnExp, expr.key.transformers, 'starrocks')
            }
            if (isNotHas) {
                return `INSTR(${columnExp}, ${value}) = 0`
            }
            return `INSTR(${columnExp}, ${value}) > 0`
        } else {
            throw new Error('path search for unsupported column type')
        }
    }

    let colRef = colId
    if (hasTransformers) {
        colRef = applyTransformerSQL(colRef, expr.key.transformers, 'starrocks')
    }

    let isArrayResult = column.flyqlType() === Type.Array
    if (expr.key.transformers && expr.key.transformers.length) {
        const reg = defaultRegistry()
        const lastT = reg.get(expr.key.transformers[expr.key.transformers.length - 1].name)
        if (lastT && lastT.outputType === 'array') isArrayResult = true
    }

    if (isArrayResult) {
        if (isNotHas) {
            return `NOT array_contains(${colRef}, ${value})`
        }
        return `array_contains(${colRef}, ${value})`
    }

    if (column.flyqlType() === Type.Map) {
        if (isNotHas) {
            return `NOT array_contains(map_keys(${colRef}), ${value})`
        }
        return `array_contains(map_keys(${colRef}), ${value})`
    }

    if (column.flyqlType() === Type.JSON) {
        if (isNotHas) {
            return `NOT json_exists(${colRef}, concat('$.', ${value}))`
        }
        return `json_exists(${colRef}, concat('$.', ${value}))`
    }

    if (column.flyqlType() === Type.String) {
        if (isNotHas) {
            return `(${colRef} IS NULL OR INSTR(${colRef}, ${value}) = 0)`
        }
        return `INSTR(${colRef}, ${value}) > 0`
    }

    throw new Error(`has operator is not supported for column type: ${column.flyqlType()}`)
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
    if (expr.operator === Operator.TRUTHY) return truthyExpressionToSQL(expr, columns)
    if (expr.operator === Operator.IN || expr.operator === Operator.NOT_IN) return inExpressionToSQL(expr, columns)
    if (expr.operator === Operator.HAS || expr.operator === Operator.NOT_HAS) return hasExpressionToSQL(expr, columns)
    if (!VALID_KEY_VALUE_OPERATORS.includes(expr.operator) && expr.operator !== Operator.TRUTHY) {
        throw new Error(`invalid operator: ${expr.operator}`)
    }
    if (expr.key.isSegmented) return expressionToSQLSegmented(expr, columns)
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
    if (!root) return ''

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
    if (root.left) left = generateWhere(root.left, columns, registry, options)
    if (root.right) right = generateWhere(root.right, columns, registry, options)

    if (left && right) {
        if (!VALID_BOOL_OPERATORS.includes(root.boolOperator)) {
            throw new Error(`invalid bool operator: ${root.boolOperator}`)
        }
        text = `(${left} ${boolOpToSQL[root.boolOperator]} ${right})`
    } else if (left) {
        text = left
    } else if (right) {
        text = right
    }

    if (isNegated && text) text = `NOT (${text})`
    return text
}

// SELECT clause generation

function parseRawSelectColumns(text) {
    const result = []
    for (let part of text.split(',')) {
        part = part.trim()
        if (!part) continue
        const idx = part.toLowerCase().indexOf(' as ')
        let name, alias
        if (idx >= 0) {
            name = part.substring(0, idx).trim()
            alias = part.substring(idx + 4).trim()
        } else {
            name = part
            alias = ''
        }
        if (!name) throw new Error('empty column name')
        result.push({ name, alias })
    }
    return result
}

function resolveColumn(key, columns) {
    for (let i = key.segments.length; i > 0; i--) {
        const candidateKey = key.segments.slice(0, i).join('.')
        const col = columns[candidateKey]
        if (col) return { column: col, path: key.segments.slice(i) }
    }
    throw new Error(`unknown column: ${key.raw}`)
}

function resolveRhsColumnRef(value, columns) {
    try {
        const key = parseKey(value)
        const { column, path } = resolveColumn(key, columns)
        return buildSelectExpr(column, path)
    } catch {
        return null
    }
}

function buildSelectExpr(column, path) {
    const colId = getIdentifier(column)

    if (path.length === 0) return colId

    if (column.flyqlType() === Type.JSON) {
        for (const part of path) validateJSONPathPart(part)
        return `${colId}->${path.map((p) => quoteJsonPathPart(p)).join('->')}`
    }
    if (column.flyqlType() === Type.JSONString) {
        return `parse_json(${colId})->${path.map((p) => quoteJsonPathPart(p)).join('->')}`
    }
    if (column.flyqlType() === Type.Map) {
        return `${colId}[${escapeParam(path.join('.'))}]`
    }
    if (column.flyqlType() === Type.Array) {
        const index = parseInt(path.join('.'), 10)
        if (isNaN(index)) throw new Error(`invalid array index, expected number: ${path.join('.')}`)
        return `${colId}[${index}]`
    }
    if (column.flyqlType() === Type.Struct) {
        return `${colId}.\`${path.join('`.`')}\``
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
            sqlExpr = applyTransformerSQL(sqlExpr, key.transformers, 'starrocks', registry)
        }

        let alias = raw.alias
        if (alias) {
            if (!validAliasPattern.test(alias)) throw new Error(`invalid alias: ${alias}`)
            sqlExpr = `${sqlExpr} AS \`${alias}\``
        } else if (path.length > 0) {
            alias = key.raw.split('|')[0]
            if (!validAliasPattern.test(alias)) throw new Error(`invalid alias: ${alias}`)
            sqlExpr = `${sqlExpr} AS \`${alias}\``
        }

        selectColumns.push({ key, alias, column, sqlExpr })
        exprs.push(sqlExpr)
    }

    return { columns: selectColumns, sql: exprs.join(', ') }
}
