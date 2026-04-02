import { Operator, BoolOperator, VALID_KEY_VALUE_OPERATORS, VALID_BOOL_OPERATORS } from '../../core/constants.js'
import { ValueType } from '../../types.js'
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

export function prepareLikePatternValue(value) {
    let patternFound = false
    let newValue = ''
    const chars = [...value]

    for (let i = 0; i < chars.length; i++) {
        const char = chars[i]
        if (char === '*') {
            if (i > 0 && chars[i - 1] === '\\') {
                newValue += '*'
            } else {
                newValue += '%'
                patternFound = true
            }
        } else if (char === '%') {
            patternFound = true
            newValue += '\\%'
        } else if (char === '\\' && i + 1 < chars.length && chars[i + 1] === '*') {
            newValue += '\\'
        } else {
            newValue += char
        }
    }

    return { patternFound, value: newValue }
}

function expressionToSQLSimple(expr, columns, registry = null) {
    const columnName = expr.key.segments[0]
    const column = columns[columnName]
    if (!column) {
        throw new Error(`unknown column: ${columnName}`)
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
            return `not match(${colRef}, ${value})`
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
            let operator = expr.operator
            const valueStr = String(expr.value)
            const { patternFound, value: processedValue } = prepareLikePatternValue(valueStr)
            const escapedValue = escapeParam(processedValue)
            if (patternFound) {
                operator = expr.operator === Operator.EQUALS ? 'LIKE' : 'NOT LIKE'
            }
            return `${colRef} ${operator} ${escapedValue}`
        }
        default: {
            const value = escapeParam(expr.value)
            return `${colRef} ${expr.operator} ${value}`
        }
    }
}

const validAliasPattern = /^[a-zA-Z_][a-zA-Z0-9_.]*$/

function expressionToSQLSegmented(expr, columns) {
    if (expr.key.transformers.length) {
        throw new Error('transformers on segmented (nested path) keys are not supported')
    }
    const reverseOperator = expr.operator === Operator.NOT_REGEX ? 'not ' : ''
    const funcName = operatorToClickHouseFunc[expr.operator]
    if (!funcName) {
        throw new Error(`unsupported operator for segmented expression: ${expr.operator}`)
    }
    const columnName = expr.key.segments[0]

    const column = columns[columnName]
    if (!column) {
        throw new Error(`unknown column: ${columnName}`)
    }

    if (column.normalizedType) {
        validateOperation(expr.value, column.normalizedType, expr.operator)
    }

    const colId = getIdentifier(column)

    if (column.jsonString) {
        const jsonPath = expr.key.segments.slice(1)
        const jsonPathParts = jsonPath.map((p) => escapeParam(p))
        const jsonPathStr = jsonPathParts.join(', ')

        const strValue = escapeParam(expr.value)
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
        const value = escapeParam(expr.value)
        return `${colId}.${jsonPathStr} ${expr.operator} ${value}`
    } else if (column.isMap) {
        const mapKey = expr.key.segments.slice(1).join('.')
        const escapedMapKey = escapeParam(mapKey)
        const value = escapeParam(expr.value)
        return `${reverseOperator}${funcName}(${colId}[${escapedMapKey}], ${value})`
    } else if (column.isArray) {
        const arrayIndexStr = expr.key.segments.slice(1).join('.')
        const arrayIndex = parseInt(arrayIndexStr, 10)
        if (isNaN(arrayIndex)) {
            throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
        }
        const value = escapeParam(expr.value)
        return `${reverseOperator}${funcName}(${colId}[${arrayIndex}], ${value})`
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

    const valueParts = expr.values.map((v) => escapeParam(v))
    const valuesSQL = valueParts.join(', ')

    const sqlOp = isNotIn ? 'NOT IN' : 'IN'

    const colId = getIdentifier(column)

    if (expr.key.isSegmented) {
        if (column.isJSON) {
            const jsonPath = expr.key.segments.slice(1)
            for (const part of jsonPath) {
                validateJSONPathPart(part)
            }
            const pathParts = jsonPath.map((part) => `$.${part}`)
            const jsonPathStr = pathParts.join('.')
            return `JSON_VALUE(${colId}, '${jsonPathStr}') ${sqlOp} (${valuesSQL})`
        } else if (column.jsonString) {
            const jsonPath = expr.key.segments.slice(1)
            const jsonPathParts = jsonPath.map((p) => escapeParam(p))
            const jsonPathStr = jsonPathParts.join(', ')
            return `JSONExtractString(${colId}, ${jsonPathStr}) ${sqlOp} (${valuesSQL})`
        } else if (column.isMap) {
            const mapKey = expr.key.segments.slice(1).join('.')
            const escapedMapKey = escapeParam(mapKey)
            return `${colId}[${escapedMapKey}] ${sqlOp} (${valuesSQL})`
        } else if (column.isArray) {
            const arrayIndexStr = expr.key.segments.slice(1).join('.')
            const arrayIndex = parseInt(arrayIndexStr, 10)
            if (isNaN(arrayIndex)) {
                throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
            }
            return `${colId}[${arrayIndex}] ${sqlOp} (${valuesSQL})`
        } else {
            throw new Error('path search for unsupported column type')
        }
    }

    let colRef = colId
    if (expr.key.transformers && expr.key.transformers.length) {
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

    if (expr.key.isSegmented) {
        if (column.jsonString) {
            const jsonPath = expr.key.segments.slice(1)
            const jsonPathParts = jsonPath.map((p) => escapeParam(p))
            const jsonPathStr = jsonPathParts.join(', ')
            return `(JSONHas(${colId}, ${jsonPathStr}) AND JSONExtractString(${colId}, ${jsonPathStr}) != '')`
        } else if (column.isJSON) {
            const jsonPath = expr.key.segments.slice(1)
            for (const part of jsonPath) {
                validateJSONPathPart(part)
            }
            const pathParts = jsonPath.map((part) => '`' + part + '`')
            const jsonPathStr = pathParts.join('.')
            return `(${colId}.${jsonPathStr} IS NOT NULL)`
        } else if (column.isMap) {
            const mapKey = expr.key.segments.slice(1).join('.')
            const escapedMapKey = escapeParam(mapKey)
            return `(mapContains(${colId}, ${escapedMapKey}) AND ${colId}[${escapedMapKey}] != '')`
        } else if (column.isArray) {
            const arrayIndexStr = expr.key.segments.slice(1).join('.')
            const arrayIndex = parseInt(arrayIndexStr, 10)
            if (isNaN(arrayIndex)) {
                throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
            }
            return `(length(${colId}) >= ${arrayIndex} AND ${colId}[${arrayIndex}] != '')`
        } else {
            throw new Error('path search for unsupported column type')
        }
    }

    if (expr.key.transformers && expr.key.transformers.length) {
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

    if (expr.key.isSegmented) {
        if (column.jsonString) {
            const jsonPath = expr.key.segments.slice(1)
            const jsonPathParts = jsonPath.map((p) => escapeParam(p))
            const jsonPathStr = jsonPathParts.join(', ')
            return `(NOT JSONHas(${colId}, ${jsonPathStr}) OR JSONExtractString(${colId}, ${jsonPathStr}) = '')`
        } else if (column.isJSON) {
            const jsonPath = expr.key.segments.slice(1)
            for (const part of jsonPath) {
                validateJSONPathPart(part)
            }
            const pathParts = jsonPath.map((part) => '`' + part + '`')
            const jsonPathStr = pathParts.join('.')
            return `(${colId}.${jsonPathStr} IS NULL)`
        } else if (column.isMap) {
            const mapKey = expr.key.segments.slice(1).join('.')
            const escapedMapKey = escapeParam(mapKey)
            return `(NOT mapContains(${colId}, ${escapedMapKey}) OR ${colId}[${escapedMapKey}] = '')`
        } else if (column.isArray) {
            const arrayIndexStr = expr.key.segments.slice(1).join('.')
            const arrayIndex = parseInt(arrayIndexStr, 10)
            if (isNaN(arrayIndex)) {
                throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
            }
            return `(length(${colId}) < ${arrayIndex} OR ${colId}[${arrayIndex}] = '')`
        } else {
            throw new Error('path search for unsupported column type')
        }
    }

    if (expr.key.transformers && expr.key.transformers.length) {
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

    const value = escapeParam(expr.value)
    const colId = getIdentifier(column)

    if (expr.key.isSegmented) {
        if (column.jsonString) {
            const jsonPath = expr.key.segments.slice(1)
            const jsonPathParts = jsonPath.map((p) => escapeParam(p))
            const jsonPathStr = jsonPathParts.join(', ')
            if (isNotHas) {
                return `position(JSONExtractString(${colId}, ${jsonPathStr}), ${value}) = 0`
            }
            return `position(JSONExtractString(${colId}, ${jsonPathStr}), ${value}) > 0`
        } else if (column.isJSON) {
            const jsonPath = expr.key.segments.slice(1)
            for (const part of jsonPath) {
                validateJSONPathPart(part)
            }
            const pathParts = jsonPath.map((part) => '`' + part + '`')
            const jsonPathStr = pathParts.join('.')
            if (isNotHas) {
                return `position(${colId}.${jsonPathStr}, ${value}) = 0`
            }
            return `position(${colId}.${jsonPathStr}, ${value}) > 0`
        } else if (column.isMap) {
            const mapKey = expr.key.segments.slice(1).join('.')
            const escapedMapKey = escapeParam(mapKey)
            if (isNotHas) {
                return `position(${colId}[${escapedMapKey}], ${value}) = 0`
            }
            return `position(${colId}[${escapedMapKey}], ${value}) > 0`
        } else if (column.isArray) {
            const arrayIndexStr = expr.key.segments.slice(1).join('.')
            const arrayIndex = parseInt(arrayIndexStr, 10)
            if (isNaN(arrayIndex)) {
                throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
            }
            if (isNotHas) {
                return `position(${colId}[${arrayIndex}], ${value}) = 0`
            }
            return `position(${colId}[${arrayIndex}], ${value}) > 0`
        } else {
            throw new Error('path search for unsupported column type')
        }
    }

    let colRef = colId
    if (expr.key.transformers && expr.key.transformers.length) {
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

function expressionToSQL(expr, columns, registry = null) {
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
    return expressionToSQLSimple(expr, columns, registry)
}

function findSingleLeafExpression(node) {
    if (!node) return null
    if (node.negated) return null
    if (node.expression) return node.expression
    if (node.left && !node.right) return findSingleLeafExpression(node.left)
    if (node.right && !node.left) return findSingleLeafExpression(node.right)
    return null
}

export function generateWhere(root, columns, registry = null) {
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
            text = expressionToSQL(root.expression, columns, registry)
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
        left = generateWhere(root.left, columns, registry)
    }

    if (root.right) {
        right = generateWhere(root.right, columns, registry)
    }

    if (left && right) {
        validateBoolOperator(root.boolOperator)
        text = `(${left} ${root.boolOperator} ${right})`
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
            alias = raw.name
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
