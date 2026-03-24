import { Operator, BoolOperator, VALID_KEY_VALUE_OPERATORS, VALID_BOOL_OPERATORS } from '../../core/constants.js'
import { parseKey } from '../../core/key.js'
import {
    Column,
    newColumn,
    normalizePostgreSQLType,
    NormalizedTypeBool,
    NormalizedTypeString,
    NormalizedTypeInt,
    NormalizedTypeFloat,
    NormalizedTypeDate,
    NormalizedTypeJSON,
    NormalizedTypeHstore,
} from './column.js'
import { validateOperation, validateInListTypes } from './helpers.js'

export { Column, newColumn, normalizePostgreSQLType }

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

    const identifier = getIdentifier(column)

    switch (expr.operator) {
        case Operator.REGEX: {
            const value = escapeParam(String(expr.value))
            return `${identifier} ~ ${value}`
        }
        case Operator.NOT_REGEX: {
            const value = escapeParam(String(expr.value))
            return `${identifier} !~ ${value}`
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
            return `${identifier} ${operator} ${escapedValue}`
        }
        default: {
            const value = escapeParam(expr.value)
            return `${identifier} ${expr.operator} ${value}`
        }
    }
}

function expressionToSQLSegmented(expr, columns) {
    const columnName = expr.key.segments[0]
    const column = columns[columnName]
    if (!column) {
        throw new Error(`unknown column: ${columnName}`)
    }

    if (column.normalizedType) {
        validateOperation(expr.value, column.normalizedType, expr.operator)
    }

    const identifier = getIdentifier(column)

    if (column.isJSONB) {
        const jsonPath = expr.key.segments.slice(1)
        const allQuoted = extractQuotedSegments(expr.key.raw)
        const jsonPathQuoted = allQuoted.slice(1)
        for (let i = 0; i < jsonPath.length; i++) {
            validateJSONPathPart(jsonPath[i], jsonPathQuoted[i])
        }

        const pathExpr = buildJSONBPath(identifier, jsonPath, jsonPathQuoted)
        const value = escapeParam(expr.value)

        switch (true) {
            case expr.operator === Operator.REGEX:
                return `${pathExpr} ~ ${value}`
            case expr.operator === Operator.NOT_REGEX:
                return `${pathExpr} !~ ${value}`
            case typeof expr.value === 'number' || typeof expr.value === 'bigint': {
                const jsonbRaw = buildJSONBPathRaw(identifier, jsonPath, jsonPathQuoted)
                return `(jsonb_typeof(${jsonbRaw}) = 'number' AND (${pathExpr})::numeric ${expr.operator} ${value})`
            }
            case typeof expr.value === 'string': {
                const jsonbRaw = buildJSONBPathRaw(identifier, jsonPath, jsonPathQuoted)
                return `(jsonb_typeof(${jsonbRaw}) = 'string' AND ${pathExpr} ${expr.operator} ${value})`
            }
            default:
                return `${pathExpr} ${expr.operator} ${value}`
        }
    } else if (column.isHstore) {
        const mapKey = expr.key.segments.slice(1).join('.')
        const escapedMapKey = escapeParam(mapKey)
        const value = escapeParam(expr.value)
        const accessExpr = `${identifier}->${escapedMapKey}`

        switch (expr.operator) {
            case Operator.REGEX:
                return `${accessExpr} ~ ${value}`
            case Operator.NOT_REGEX:
                return `${accessExpr} !~ ${value}`
            default:
                return `${accessExpr} ${expr.operator} ${value}`
        }
    } else if (column.isArray) {
        const arrayIndexStr = expr.key.segments.slice(1).join('.')
        const arrayIndex = parseInt(arrayIndexStr, 10)
        if (isNaN(arrayIndex)) {
            throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
        }
        const value = escapeParam(expr.value)
        const pgIndex = arrayIndex + 1
        const accessExpr = `${identifier}[${pgIndex}]`

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

    if (column.normalizedType && !expr.key.isSegmented) {
        validateInListTypes(expr.values, column.normalizedType)
    }

    const valueParts = expr.values.map((v) => escapeParam(v))
    const valuesSQL = valueParts.join(', ')

    const sqlOp = isNotIn ? 'NOT IN' : 'IN'

    const identifier = getIdentifier(column)

    if (expr.key.isSegmented) {
        if (column.isJSONB) {
            const jsonPath = expr.key.segments.slice(1)
            const allQuoted = extractQuotedSegments(expr.key.raw)
            const jsonPathQuoted = allQuoted.slice(1)
            for (let i = 0; i < jsonPath.length; i++) {
                validateJSONPathPart(jsonPath[i], jsonPathQuoted[i])
            }
            const pathExpr = buildJSONBPath(identifier, jsonPath, jsonPathQuoted)
            return `${pathExpr} ${sqlOp} (${valuesSQL})`
        } else if (column.isHstore) {
            const mapKey = expr.key.segments.slice(1).join('.')
            const escapedMapKey = escapeParam(mapKey)
            return `${identifier}->${escapedMapKey} ${sqlOp} (${valuesSQL})`
        } else if (column.isArray) {
            const arrayIndexStr = expr.key.segments.slice(1).join('.')
            const arrayIndex = parseInt(arrayIndexStr, 10)
            if (isNaN(arrayIndex)) {
                throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
            }
            return `${identifier}[${arrayIndex + 1}] ${sqlOp} (${valuesSQL})`
        } else {
            throw new Error('path search for unsupported column type')
        }
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

    if (expr.key.isSegmented) {
        if (column.isJSONB) {
            const jsonPath = expr.key.segments.slice(1)
            const allQuoted = extractQuotedSegments(expr.key.raw)
            const jsonPathQuoted = allQuoted.slice(1)
            for (let i = 0; i < jsonPath.length; i++) {
                validateJSONPathPart(jsonPath[i], jsonPathQuoted[i])
            }
            const pathExpr = buildJSONBPath(identifier, jsonPath, jsonPathQuoted)
            return `(${pathExpr} IS NOT NULL AND ${pathExpr} != '')`
        } else if (column.isHstore) {
            const mapKey = expr.key.segments.slice(1).join('.')
            const escapedMapKey = escapeParam(mapKey)
            return `(${identifier} ? ${escapedMapKey} AND ${identifier}->${escapedMapKey} != '')`
        } else if (column.isArray) {
            const arrayIndexStr = expr.key.segments.slice(1).join('.')
            const arrayIndex = parseInt(arrayIndexStr, 10)
            if (isNaN(arrayIndex)) {
                throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
            }
            const pgIndex = arrayIndex + 1
            return `(array_length(${identifier}, 1) >= ${pgIndex} AND ${identifier}[${pgIndex}] != '')`
        } else {
            throw new Error('path search for unsupported column type')
        }
    }

    switch (column.normalizedType) {
        case NormalizedTypeBool:
            return identifier
        case NormalizedTypeString:
            return `(${identifier} IS NOT NULL AND ${identifier} != '')`
        case NormalizedTypeInt:
        case NormalizedTypeFloat:
            return `(${identifier} IS NOT NULL AND ${identifier} != 0)`
        case NormalizedTypeDate:
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

    if (expr.key.isSegmented) {
        if (column.isJSONB) {
            const jsonPath = expr.key.segments.slice(1)
            const allQuoted = extractQuotedSegments(expr.key.raw)
            const jsonPathQuoted = allQuoted.slice(1)
            for (let i = 0; i < jsonPath.length; i++) {
                validateJSONPathPart(jsonPath[i], jsonPathQuoted[i])
            }
            const pathExpr = buildJSONBPath(identifier, jsonPath, jsonPathQuoted)
            return `(${pathExpr} IS NULL OR ${pathExpr} = '')`
        } else if (column.isHstore) {
            const mapKey = expr.key.segments.slice(1).join('.')
            const escapedMapKey = escapeParam(mapKey)
            return `(NOT (${identifier} ? ${escapedMapKey}) OR ${identifier}->${escapedMapKey} = '')`
        } else if (column.isArray) {
            const arrayIndexStr = expr.key.segments.slice(1).join('.')
            const arrayIndex = parseInt(arrayIndexStr, 10)
            if (isNaN(arrayIndex)) {
                throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
            }
            const pgIndex = arrayIndex + 1
            return `(array_length(${identifier}, 1) < ${pgIndex} OR ${identifier}[${pgIndex}] = '')`
        } else {
            throw new Error('path search for unsupported column type')
        }
    }

    switch (column.normalizedType) {
        case NormalizedTypeBool:
            return `NOT ${identifier}`
        case NormalizedTypeString:
            return `(${identifier} IS NULL OR ${identifier} = '')`
        case NormalizedTypeInt:
        case NormalizedTypeFloat:
            return `(${identifier} IS NULL OR ${identifier} = 0)`
        case NormalizedTypeDate:
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

    const identifier = getIdentifier(column)
    const value = escapeParam(expr.value)

    if (expr.key.isSegmented) {
        if (column.isJSONB) {
            const jsonPath = expr.key.segments.slice(1)
            const allQuoted = extractQuotedSegments(expr.key.raw)
            const jsonPathQuoted = allQuoted.slice(1)
            for (let i = 0; i < jsonPath.length; i++) {
                validateJSONPathPart(jsonPath[i], jsonPathQuoted[i])
            }
            const pathExpr = buildJSONBPath(identifier, jsonPath, jsonPathQuoted)
            if (isNotHas) {
                return `position(${value} in ${pathExpr}) = 0`
            }
            return `position(${value} in ${pathExpr}) > 0`
        } else if (column.isHstore) {
            const mapKey = expr.key.segments.slice(1).join('.')
            const escapedMapKey = escapeParam(mapKey)
            const accessExpr = `${identifier}->${escapedMapKey}`
            if (isNotHas) {
                return `position(${value} in ${accessExpr}) = 0`
            }
            return `position(${value} in ${accessExpr}) > 0`
        } else if (column.isArray) {
            const arrayIndexStr = expr.key.segments.slice(1).join('.')
            const arrayIndex = parseInt(arrayIndexStr, 10)
            if (isNaN(arrayIndex)) {
                throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
            }
            const pgIndex = arrayIndex + 1
            const accessExpr = `${identifier}[${pgIndex}]`
            if (isNotHas) {
                return `position(${value} in ${accessExpr}) = 0`
            }
            return `position(${value} in ${accessExpr}) > 0`
        } else {
            throw new Error('path search for unsupported column type')
        }
    }

    if (column.isArray) {
        if (isNotHas) {
            return `NOT (${value} = ANY(${identifier}))`
        }
        return `${value} = ANY(${identifier})`
    }

    if (column.isJSONB) {
        if (isNotHas) {
            return `NOT (${identifier} ? ${value})`
        }
        return `${identifier} ? ${value}`
    }

    if (column.isHstore) {
        if (isNotHas) {
            return `NOT (${identifier} ? ${value})`
        }
        return `${identifier} ? ${value}`
    }

    if (column.normalizedType === NormalizedTypeString) {
        if (isNotHas) {
            return `(${identifier} IS NULL OR position(${value} in ${identifier}) = 0)`
        }
        return `position(${value} in ${identifier}) > 0`
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

    if (column.isJSONB) {
        for (let i = 0; i < path.length; i++) {
            validateJSONPathPart(path[i], pathQuoted[i])
        }
        return buildJSONBPathRaw(identifier, path, pathQuoted)
    }

    if (column.isHstore) {
        const mapKey = path.join('.')
        const escapedKey = escapeParam(mapKey)
        return `${identifier}->${escapedKey}`
    }

    if (column.isArray) {
        const indexStr = path.join('.')
        const index = parseInt(indexStr, 10)
        if (isNaN(index)) {
            throw new Error(`invalid array index, expected number: ${indexStr}`)
        }
        return `${identifier}[${index + 1}]`
    }

    throw new Error(`path access on non-composite column type: ${column.name}`)
}

export function generateSelect(text, columns) {
    const raws = parseRawSelectColumns(text)
    const selectColumns = []
    const exprs = []

    for (const raw of raws) {
        const key = parseKey(raw.name)
        const { column, path, pathQuoted } = resolveColumn(key, columns)

        const identifier = getIdentifier(column)
        let sqlExpr = buildSelectExpr(identifier, column, path, pathQuoted)

        let alias = raw.alias
        if (alias) {
            sqlExpr = `${sqlExpr} AS ${escapeIdentifier(alias)}`
        } else if (path.length > 0) {
            alias = raw.name
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
