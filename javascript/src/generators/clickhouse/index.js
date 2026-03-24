import { Operator, BoolOperator, VALID_KEY_VALUE_OPERATORS, VALID_BOOL_OPERATORS } from '../../core/constants.js'
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
        return item ? 'True' : 'False'
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

function expressionToSQLSimple(expr, columns) {
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

    if (column.normalizedType) {
        validateOperation(expr.value, column.normalizedType, expr.operator)
    }

    switch (expr.operator) {
        case Operator.REGEX: {
            const value = escapeParam(String(expr.value))
            return `match(${column.name}, ${value})`
        }
        case Operator.NOT_REGEX: {
            const value = escapeParam(String(expr.value))
            return `not match(${column.name}, ${value})`
        }
        case Operator.EQUALS:
        case Operator.NOT_EQUALS: {
            let operator = expr.operator
            const valueStr = String(expr.value)
            const { patternFound, value: processedValue } = prepareLikePatternValue(valueStr)
            const escapedValue = escapeParam(processedValue)
            if (patternFound) {
                operator = expr.operator === Operator.EQUALS ? 'LIKE' : 'NOT LIKE'
            }
            return `${column.name} ${operator} ${escapedValue}`
        }
        default: {
            const value = escapeParam(expr.value)
            return `${column.name} ${expr.operator} ${value}`
        }
    }
}

const validAliasPattern = /^[a-zA-Z_][a-zA-Z0-9_.]*$/

function expressionToSQLSegmented(expr, columns) {
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

    if (column.jsonString) {
        const jsonPath = expr.key.segments.slice(1)
        const jsonPathParts = jsonPath.map((p) => escapeParam(p))
        const jsonPathStr = jsonPathParts.join(', ')

        const strValue = escapeParam(expr.value)
        const multiIf = [
            `JSONType(${column.name}, ${jsonPathStr}) = 'String', ${funcName}(JSONExtractString(${column.name}, ${jsonPathStr}), ${strValue})`,
        ]

        if (
            (typeof expr.value === 'number' || typeof expr.value === 'bigint') &&
            expr.operator !== Operator.REGEX &&
            expr.operator !== Operator.NOT_REGEX
        ) {
            const numValue = String(expr.value)
            multiIf.push(
                `JSONType(${column.name}, ${jsonPathStr}) = 'Int64', ${funcName}(JSONExtractInt(${column.name}, ${jsonPathStr}), ${numValue})`,
                `JSONType(${column.name}, ${jsonPathStr}) = 'Double', ${funcName}(JSONExtractFloat(${column.name}, ${jsonPathStr}), ${numValue})`,
                `JSONType(${column.name}, ${jsonPathStr}) = 'Bool', ${funcName}(JSONExtractBool(${column.name}, ${jsonPathStr}), ${numValue})`,
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
        return `${column.name}.${jsonPathStr} ${expr.operator} ${value}`
    } else if (column.isMap) {
        const mapKey = expr.key.segments.slice(1).join('.')
        const escapedMapKey = escapeParam(mapKey)
        const value = escapeParam(expr.value)
        return `${reverseOperator}${funcName}(${column.name}[${escapedMapKey}], ${value})`
    } else if (column.isArray) {
        const arrayIndexStr = expr.key.segments.slice(1).join('.')
        const arrayIndex = parseInt(arrayIndexStr, 10)
        if (isNaN(arrayIndex)) {
            throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
        }
        const value = escapeParam(expr.value)
        return `${reverseOperator}${funcName}(${column.name}[${arrayIndex}], ${value})`
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

    if (column.normalizedType && !expr.key.isSegmented) {
        validateInListTypes(expr.values, column.normalizedType)
    }

    const valueParts = expr.values.map((v) => escapeParam(v))
    const valuesSQL = valueParts.join(', ')

    const sqlOp = isNotIn ? 'NOT IN' : 'IN'

    if (expr.key.isSegmented) {
        if (column.isJSON) {
            const jsonPath = expr.key.segments.slice(1)
            for (const part of jsonPath) {
                validateJSONPathPart(part)
            }
            const pathParts = jsonPath.map((part) => `$.${part}`)
            const jsonPathStr = pathParts.join('.')
            return `JSON_VALUE(${column.name}, '${jsonPathStr}') ${sqlOp} (${valuesSQL})`
        } else if (column.jsonString) {
            const jsonPath = expr.key.segments.slice(1)
            const jsonPathParts = jsonPath.map((p) => escapeParam(p))
            const jsonPathStr = jsonPathParts.join(', ')
            return `JSONExtractString(${column.name}, ${jsonPathStr}) ${sqlOp} (${valuesSQL})`
        } else if (column.isMap) {
            const mapKey = expr.key.segments.slice(1).join('.')
            const escapedMapKey = escapeParam(mapKey)
            return `${column.name}[${escapedMapKey}] ${sqlOp} (${valuesSQL})`
        } else if (column.isArray) {
            const arrayIndexStr = expr.key.segments.slice(1).join('.')
            const arrayIndex = parseInt(arrayIndexStr, 10)
            if (isNaN(arrayIndex)) {
                throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
            }
            return `${column.name}[${arrayIndex}] ${sqlOp} (${valuesSQL})`
        } else {
            throw new Error('path search for unsupported column type')
        }
    }

    return `${column.name} ${sqlOp} (${valuesSQL})`
}

function truthyExpressionToSQL(expr, columns) {
    const columnName = expr.key.segments[0]
    const column = columns[columnName]
    if (!column) {
        throw new Error(`unknown column: ${columnName}`)
    }

    if (expr.key.isSegmented) {
        if (column.jsonString) {
            const jsonPath = expr.key.segments.slice(1)
            const jsonPathParts = jsonPath.map((p) => escapeParam(p))
            const jsonPathStr = jsonPathParts.join(', ')
            return `(JSONHas(${column.name}, ${jsonPathStr}) AND JSONExtractString(${column.name}, ${jsonPathStr}) != '')`
        } else if (column.isJSON) {
            const jsonPath = expr.key.segments.slice(1)
            for (const part of jsonPath) {
                validateJSONPathPart(part)
            }
            const pathParts = jsonPath.map((part) => '`' + part + '`')
            const jsonPathStr = pathParts.join('.')
            return `(${column.name}.${jsonPathStr} IS NOT NULL)`
        } else if (column.isMap) {
            const mapKey = expr.key.segments.slice(1).join('.')
            const escapedMapKey = escapeParam(mapKey)
            return `(mapContains(${column.name}, ${escapedMapKey}) AND ${column.name}[${escapedMapKey}] != '')`
        } else if (column.isArray) {
            const arrayIndexStr = expr.key.segments.slice(1).join('.')
            const arrayIndex = parseInt(arrayIndexStr, 10)
            if (isNaN(arrayIndex)) {
                throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
            }
            return `(length(${column.name}) >= ${arrayIndex} AND ${column.name}[${arrayIndex}] != '')`
        } else {
            throw new Error('path search for unsupported column type')
        }
    }

    if (column.jsonString) {
        return `(${column.name} IS NOT NULL AND ${column.name} != '' AND JSONLength(${column.name}) > 0)`
    }

    switch (column.normalizedType) {
        case NormalizedTypeBool:
            return column.name
        case NormalizedTypeString:
            return `(${column.name} IS NOT NULL AND ${column.name} != '')`
        case NormalizedTypeInt:
        case NormalizedTypeFloat:
            return `(${column.name} IS NOT NULL AND ${column.name} != 0)`
        case NormalizedTypeDate:
            return `(${column.name} IS NOT NULL)`
        default:
            return `(${column.name} IS NOT NULL)`
    }
}

function falsyExpressionToSQL(expr, columns) {
    const columnName = expr.key.segments[0]
    const column = columns[columnName]
    if (!column) {
        throw new Error(`unknown column: ${columnName}`)
    }

    if (expr.key.isSegmented) {
        if (column.jsonString) {
            const jsonPath = expr.key.segments.slice(1)
            const jsonPathParts = jsonPath.map((p) => escapeParam(p))
            const jsonPathStr = jsonPathParts.join(', ')
            return `(NOT JSONHas(${column.name}, ${jsonPathStr}) OR JSONExtractString(${column.name}, ${jsonPathStr}) = '')`
        } else if (column.isJSON) {
            const jsonPath = expr.key.segments.slice(1)
            for (const part of jsonPath) {
                validateJSONPathPart(part)
            }
            const pathParts = jsonPath.map((part) => '`' + part + '`')
            const jsonPathStr = pathParts.join('.')
            return `(${column.name}.${jsonPathStr} IS NULL)`
        } else if (column.isMap) {
            const mapKey = expr.key.segments.slice(1).join('.')
            const escapedMapKey = escapeParam(mapKey)
            return `(NOT mapContains(${column.name}, ${escapedMapKey}) OR ${column.name}[${escapedMapKey}] = '')`
        } else if (column.isArray) {
            const arrayIndexStr = expr.key.segments.slice(1).join('.')
            const arrayIndex = parseInt(arrayIndexStr, 10)
            if (isNaN(arrayIndex)) {
                throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
            }
            return `(length(${column.name}) < ${arrayIndex} OR ${column.name}[${arrayIndex}] = '')`
        } else {
            throw new Error('path search for unsupported column type')
        }
    }

    if (column.jsonString) {
        return `(${column.name} IS NULL OR ${column.name} = '' OR JSONLength(${column.name}) = 0)`
    }

    switch (column.normalizedType) {
        case NormalizedTypeBool:
            return `NOT ${column.name}`
        case NormalizedTypeString:
            return `(${column.name} IS NULL OR ${column.name} = '')`
        case NormalizedTypeInt:
        case NormalizedTypeFloat:
            return `(${column.name} IS NULL OR ${column.name} = 0)`
        case NormalizedTypeDate:
            return `(${column.name} IS NULL)`
        default:
            return `(${column.name} IS NULL)`
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

    if (expr.key.isSegmented) {
        if (column.jsonString) {
            const jsonPath = expr.key.segments.slice(1)
            const jsonPathParts = jsonPath.map((p) => escapeParam(p))
            const jsonPathStr = jsonPathParts.join(', ')
            if (isNotHas) {
                return `position(JSONExtractString(${column.name}, ${jsonPathStr}), ${value}) = 0`
            }
            return `position(JSONExtractString(${column.name}, ${jsonPathStr}), ${value}) > 0`
        } else if (column.isJSON) {
            const jsonPath = expr.key.segments.slice(1)
            for (const part of jsonPath) {
                validateJSONPathPart(part)
            }
            const pathParts = jsonPath.map((part) => '`' + part + '`')
            const jsonPathStr = pathParts.join('.')
            if (isNotHas) {
                return `position(${column.name}.${jsonPathStr}, ${value}) = 0`
            }
            return `position(${column.name}.${jsonPathStr}, ${value}) > 0`
        } else if (column.isMap) {
            const mapKey = expr.key.segments.slice(1).join('.')
            const escapedMapKey = escapeParam(mapKey)
            if (isNotHas) {
                return `position(${column.name}[${escapedMapKey}], ${value}) = 0`
            }
            return `position(${column.name}[${escapedMapKey}], ${value}) > 0`
        } else if (column.isArray) {
            const arrayIndexStr = expr.key.segments.slice(1).join('.')
            const arrayIndex = parseInt(arrayIndexStr, 10)
            if (isNaN(arrayIndex)) {
                throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
            }
            if (isNotHas) {
                return `position(${column.name}[${arrayIndex}], ${value}) = 0`
            }
            return `position(${column.name}[${arrayIndex}], ${value}) > 0`
        } else {
            throw new Error('path search for unsupported column type')
        }
    }

    if (column.isArray) {
        if (isNotHas) {
            return `NOT has(${column.name}, ${value})`
        }
        return `has(${column.name}, ${value})`
    }

    if (column.isMap) {
        if (isNotHas) {
            return `NOT mapContains(${column.name}, ${value})`
        }
        return `mapContains(${column.name}, ${value})`
    }

    if (column.isJSON) {
        if (isNotHas) {
            return `NOT JSON_EXISTS(${column.name}, concat('$.', ${value}))`
        }
        return `JSON_EXISTS(${column.name}, concat('$.', ${value}))`
    }

    if (column.jsonString) {
        if (isNotHas) {
            return `NOT JSONHas(${column.name}, ${value})`
        }
        return `JSONHas(${column.name}, ${value})`
    }

    if (column.normalizedType === NormalizedTypeString) {
        if (isNotHas) {
            return `(${column.name} IS NULL OR position(${column.name}, ${value}) = 0)`
        }
        return `position(${column.name}, ${value}) > 0`
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

function expressionToSQL(expr, columns) {
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
    return expressionToSQLSimple(expr, columns)
}

function findSingleLeafExpression(node) {
    if (!node) return null
    if (node.negated) return null
    if (node.expression) return node.expression
    if (node.left && !node.right) return findSingleLeafExpression(node.left)
    if (node.right && !node.left) return findSingleLeafExpression(node.right)
    return null
}

export function generateWhere(root, columns) {
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
            text = expressionToSQL(root.expression, columns)
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
        left = generateWhere(root.left, columns)
    }

    if (root.right) {
        right = generateWhere(root.right, columns)
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
    if (path.length === 0) {
        return column.name
    }

    if (column.isJSON) {
        for (const part of path) {
            validateJSONPathPart(part)
        }
        const pathParts = path.map((part) => '`' + part + '`')
        return `${column.name}.${pathParts.join('.')}`
    }

    if (column.jsonString) {
        const jsonPathParts = path.map((p) => escapeParam(p))
        return `JSONExtractString(${column.name}, ${jsonPathParts.join(', ')})`
    }

    if (column.isMap) {
        const mapKey = path.join('.')
        const escapedKey = escapeParam(mapKey)
        return `${column.name}[${escapedKey}]`
    }

    if (column.isArray) {
        const indexStr = path.join('.')
        const index = parseInt(indexStr, 10)
        if (isNaN(index)) {
            throw new Error(`invalid array index, expected number: ${indexStr}`)
        }
        return `${column.name}[${index}]`
    }

    throw new Error(`path access on non-composite column type: ${column.name}`)
}

export function generateSelect(text, columns) {
    const raws = parseRawSelectColumns(text)
    const selectColumns = []
    const exprs = []

    for (const raw of raws) {
        const key = parseKey(raw.name)
        const { column, path } = resolveColumn(key, columns)

        let sqlExpr = buildSelectExpr(column, path)

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
