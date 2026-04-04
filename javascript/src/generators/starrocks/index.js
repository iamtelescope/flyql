import { Operator, BoolOperator, VALID_KEY_VALUE_OPERATORS, VALID_BOOL_OPERATORS } from '../../core/constants.js'
import { ValueType } from '../../types.js'
import { parseKey } from '../../core/key.js'
import {
    Column,
    newColumn,
    normalizeStarRocksType,
    NormalizedTypeBool,
    NormalizedTypeString,
    NormalizedTypeInt,
    NormalizedTypeFloat,
    NormalizedTypeDate,
} from './column.js'
import { validateOperation, validateInListTypes } from './helpers.js'
import { applyTransformerSQL, validateTransformerChain } from '../transformerHelpers.js'
import { defaultRegistry } from '../../transformers/index.js'

export { Column, newColumn, normalizeStarRocksType }

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

function isNumber(value) {
    if (typeof value === 'number') return true
    if (typeof value === 'bigint') return true
    if (typeof value === 'string') {
        return !isNaN(parseFloat(value)) || !isNaN(parseInt(value, 10))
    }
    return false
}

function expressionToSQLSimple(expr, columns, registry = null) {
    const columnName = expr.key.segments[0]
    const column = columns[columnName]
    if (!column) throw new Error(`unknown column: ${columnName}`)

    if (column.values && column.values.length > 0) {
        if (!column.values.includes(String(expr.value))) throw new Error(`unknown value: ${expr.value}`)
    }

    if (column.normalizedType && !expr.key.transformers.length) {
        validateOperation(expr.value, column.normalizedType, expr.operator)
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
            return `not regexp(${colRef}, ${value})`
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
            if (typeof expr.value === 'number' || typeof expr.value === 'bigint') {
                return `${colRef} ${expr.operator} ${expr.value}`
            }
            const value = escapeParam(String(expr.value))
            return `${colRef} ${expr.operator} ${value}`
        }
    }
}

function expressionToSQLSegmented(expr, columns) {
    if (expr.key.transformers.length) {
        throw new Error('transformers on segmented (nested path) keys are not supported')
    }
    const reverseOperator = expr.operator === Operator.NOT_REGEX ? 'not ' : ''
    const operator = operatorToStarRocksOperator[expr.operator]
    const columnName = expr.key.segments[0]
    const column = columns[columnName]
    if (!column) throw new Error(`unknown column: ${columnName}`)

    if (column.normalizedType) validateOperation(expr.value, column.normalizedType, expr.operator)

    const colId = getIdentifier(column)

    if (column.isJSON) {
        const jsonPath = expr.key.segments.slice(1)
        for (const part of jsonPath) validateJSONPathPart(part)
        const jsonPathStr = jsonPath.map((p) => quoteJsonPathPart(p)).join('->')
        const value = escapeParam(expr.value)
        let columnExp = `${colId}->${jsonPathStr}`
        if (expr.operator === Operator.REGEX || expr.operator === Operator.NOT_REGEX) {
            columnExp = `cast(${columnExp} as string)`
        }
        return `${columnExp} ${reverseOperator}${operator} ${value}`
    } else if (column.isMap) {
        const mapPath = expr.key.segments.slice(1).map((p) => escapeParam(p))
        const mapKey = mapPath.join('][')
        const value = escapeParam(expr.value)
        return `${colId}[${mapKey}] ${reverseOperator}${operator} ${value}`
    } else if (column.isArray) {
        const arrayIndexStr = expr.key.segments.slice(1).join('.')
        const arrayIndex = parseInt(arrayIndexStr, 10)
        if (isNaN(arrayIndex)) throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
        const value = escapeParam(expr.value)
        return `${colId}[${arrayIndex}] ${reverseOperator}${operator} ${value}`
    } else if (column.isStruct) {
        const structPath = expr.key.segments.slice(1)
        const structColumn = structPath.join('`.`')
        const value = escapeParam(expr.value)
        return `${colId}.\`${structColumn}\` ${reverseOperator}${operator} ${value}`
    } else if (column.jsonString) {
        const jsonPath = expr.key.segments.slice(1)
        for (const part of jsonPath) validateJSONPathPart(part)
        const jsonPathStr = jsonPath.map((p) => quoteJsonPathPart(p)).join('->')
        const value = escapeParam(expr.value)
        let columnExp = `parse_json(${colId})->${jsonPathStr}`
        if (expr.operator === Operator.REGEX || expr.operator === Operator.NOT_REGEX) {
            columnExp = `cast(${columnExp} as string)`
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
    if (column.normalizedType && !expr.key.isSegmented && !isHeterogeneous) {
        validateInListTypes(expr.values, column.normalizedType)
    }

    const valuesSQL = expr.values.map((v) => escapeParam(v)).join(', ')
    const sqlOp = isNotIn ? 'NOT IN' : 'IN'

    const colId = getIdentifier(column)

    if (expr.key.isSegmented) {
        if (column.isJSON) {
            const jsonPath = expr.key.segments.slice(1)
            for (const part of jsonPath) validateJSONPathPart(part)
            const jsonPathStr = jsonPath.map((p) => quoteJsonPathPart(p)).join('->')
            return `${colId}->${jsonPathStr} ${sqlOp} (${valuesSQL})`
        } else if (column.isMap) {
            const mapPath = expr.key.segments.slice(1).map((p) => escapeParam(p))
            const mapKey = mapPath.join('][')
            return `${colId}[${mapKey}] ${sqlOp} (${valuesSQL})`
        } else if (column.isArray) {
            const arrayIndexStr = expr.key.segments.slice(1).join('.')
            const arrayIndex = parseInt(arrayIndexStr, 10)
            if (isNaN(arrayIndex)) throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
            return `${colId}[${arrayIndex}] ${sqlOp} (${valuesSQL})`
        } else if (column.isStruct) {
            const structColumn = expr.key.segments.slice(1).join('`.`')
            return `${colId}.\`${structColumn}\` ${sqlOp} (${valuesSQL})`
        } else if (column.jsonString) {
            const jsonPath = expr.key.segments.slice(1)
            const jsonPathStr = jsonPath.map((p) => quoteJsonPathPart(p)).join('->')
            return `parse_json(${colId})->${jsonPathStr} ${sqlOp} (${valuesSQL})`
        } else {
            throw new Error('path search for unsupported column type')
        }
    }

    let colRef = colId
    if (expr.key.transformers && expr.key.transformers.length) {
        colRef = applyTransformerSQL(colRef, expr.key.transformers, 'starrocks')
    }

    return `${colRef} ${sqlOp} (${valuesSQL})`
}

function truthyExpressionToSQL(expr, columns) {
    const columnName = expr.key.segments[0]
    const column = columns[columnName]
    if (!column) throw new Error(`unknown column: ${columnName}`)

    const colId = getIdentifier(column)

    if (expr.key.isSegmented) {
        if (column.isJSON) {
            const jsonPath = expr.key.segments.slice(1)
            for (const part of jsonPath) validateJSONPathPart(part)
            const jsonPathStr = jsonPath.map((p) => quoteJsonPathPart(p)).join('->')
            return `(${colId}->${jsonPathStr} IS NOT NULL)`
        } else if (column.isMap) {
            const mapKey = escapeParam(expr.key.segments.slice(1).join('.'))
            return `(element_at(${colId}, ${mapKey}) IS NOT NULL AND ${colId}[${mapKey}] != '')`
        } else if (column.isArray) {
            const arrayIndex = parseInt(expr.key.segments.slice(1).join('.'), 10)
            if (isNaN(arrayIndex))
                throw new Error(`invalid array index, expected number: ${expr.key.segments.slice(1).join('.')}`)
            return `(array_length(${colId}) >= ${arrayIndex} AND ${colId}[${arrayIndex}] != '')`
        } else if (column.isStruct) {
            const structColumn = expr.key.segments.slice(1).join('`.`')
            return `(${colId}.\`${structColumn}\` IS NOT NULL AND ${colId}.\`${structColumn}\` != '')`
        } else if (column.jsonString) {
            const jsonPath = expr.key.segments.slice(1)
            const jsonPathStr = jsonPath.map((p) => quoteJsonPathPart(p)).join('->')
            return `(json_exists(parse_json(${colId}), ${jsonPathStr}) AND parse_json(${colId})->${jsonPathStr} != '')`
        } else {
            throw new Error('path search for unsupported column type')
        }
    }

    if (expr.key.transformers && expr.key.transformers.length) {
        const colRef = applyTransformerSQL(colId, expr.key.transformers, 'starrocks')
        return `(${colRef} IS NOT NULL AND ${colRef} != '')`
    }

    if (column.jsonString) {
        if (column.isMap || column.isStruct) {
            return `(${colId} IS NOT NULL AND json_length(to_json(${colId})) > 0)`
        }
        return `(${colId} IS NOT NULL AND ${colId} != '' AND json_length(${colId}) > 0)`
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
    if (!column) throw new Error(`unknown column: ${columnName}`)

    const colId = getIdentifier(column)

    if (expr.key.isSegmented) {
        if (column.isJSON) {
            const jsonPath = expr.key.segments.slice(1)
            for (const part of jsonPath) validateJSONPathPart(part)
            const jsonPathStr = jsonPath.map((p) => quoteJsonPathPart(p)).join('->')
            return `(${colId}->${jsonPathStr} IS NULL)`
        } else if (column.isMap) {
            const mapKey = escapeParam(expr.key.segments.slice(1).join('.'))
            return `(element_at(${colId}, ${mapKey}) IS NULL OR ${colId}[${mapKey}] = '')`
        } else if (column.isArray) {
            const arrayIndex = parseInt(expr.key.segments.slice(1).join('.'), 10)
            if (isNaN(arrayIndex)) throw new Error(`invalid array index`)
            return `(array_length(${colId}) < ${arrayIndex} OR ${colId}[${arrayIndex}] = '')`
        } else if (column.isStruct) {
            const structColumn = expr.key.segments.slice(1).join('`.`')
            return `(${colId}.\`${structColumn}\` IS NULL OR ${colId}.\`${structColumn}\` = '')`
        } else if (column.jsonString) {
            const jsonPath = expr.key.segments.slice(1)
            const jsonPathStr = jsonPath.map((p) => quoteJsonPathPart(p)).join('->')
            return `(NOT json_exists(parse_json(${colId}), '$.${jsonPathStr}') OR parse_json(${colId})->${jsonPathStr} = '')`
        } else {
            throw new Error('path search for unsupported column type')
        }
    }

    if (expr.key.transformers && expr.key.transformers.length) {
        const colRef = applyTransformerSQL(colId, expr.key.transformers, 'starrocks')
        return `(${colRef} IS NULL OR ${colRef} = '')`
    }

    if (column.jsonString) {
        if (column.isMap || column.isStruct) {
            return `(${colId} IS NULL OR json_length(to_json(${colId})) = 0)`
        }
        return `(${colId} IS NULL OR ${colId} = '' OR json_length(${colId}) = 0)`
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
    if (!column) throw new Error(`unknown column: ${columnName}`)

    const value = escapeParam(expr.value)
    const colId = getIdentifier(column)

    if (expr.key.isSegmented) {
        if (column.isJSON) {
            const jsonPath = expr.key.segments.slice(1)
            for (const part of jsonPath) validateJSONPathPart(part)
            const jsonPathStr = jsonPath.map((p) => quoteJsonPathPart(p)).join('->')
            const columnExp = `cast(${colId}->${jsonPathStr} as string)`
            if (isNotHas) {
                return `INSTR(${columnExp}, ${value}) = 0`
            }
            return `INSTR(${columnExp}, ${value}) > 0`
        } else if (column.isMap) {
            const mapPath = expr.key.segments.slice(1).map((p) => escapeParam(p))
            const mapKey = mapPath.join('][')
            if (isNotHas) {
                return `INSTR(${colId}[${mapKey}], ${value}) = 0`
            }
            return `INSTR(${colId}[${mapKey}], ${value}) > 0`
        } else if (column.isArray) {
            const arrayIndexStr = expr.key.segments.slice(1).join('.')
            const arrayIndex = parseInt(arrayIndexStr, 10)
            if (isNaN(arrayIndex)) throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
            if (isNotHas) {
                return `INSTR(${colId}[${arrayIndex}], ${value}) = 0`
            }
            return `INSTR(${colId}[${arrayIndex}], ${value}) > 0`
        } else if (column.isStruct) {
            const structPath = expr.key.segments.slice(1)
            const structColumn = structPath.join('`.`')
            const leafExpr = `${colId}.\`${structColumn}\``
            if (isNotHas) {
                return `INSTR(${leafExpr}, ${value}) = 0`
            }
            return `INSTR(${leafExpr}, ${value}) > 0`
        } else if (column.jsonString) {
            const jsonPath = expr.key.segments.slice(1)
            for (const part of jsonPath) validateJSONPathPart(part)
            const jsonPathStr = jsonPath.map((p) => quoteJsonPathPart(p)).join('->')
            const columnExp = `cast(parse_json(${colId})->${jsonPathStr} as string)`
            if (isNotHas) {
                return `INSTR(${columnExp}, ${value}) = 0`
            }
            return `INSTR(${columnExp}, ${value}) > 0`
        } else {
            throw new Error('path search for unsupported column type')
        }
    }

    let colRef = colId
    if (expr.key.transformers && expr.key.transformers.length) {
        colRef = applyTransformerSQL(colRef, expr.key.transformers, 'starrocks')
    }

    let isArrayResult = column.isArray
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

    if (column.isMap) {
        if (isNotHas) {
            return `NOT array_contains(map_keys(${colRef}), ${value})`
        }
        return `array_contains(map_keys(${colRef}), ${value})`
    }

    if (column.isJSON) {
        if (isNotHas) {
            return `NOT json_exists(${colRef}, concat('$.', ${value}))`
        }
        return `json_exists(${colRef}, concat('$.', ${value}))`
    }

    if (column.normalizedType === NormalizedTypeString) {
        if (isNotHas) {
            return `(${colRef} IS NULL OR INSTR(${colRef}, ${value}) = 0)`
        }
        return `INSTR(${colRef}, ${value}) > 0`
    }

    throw new Error(`has operator is not supported for column type: ${column.normalizedType}`)
}

function expressionToSQL(expr, columns, registry = null) {
    if (expr.operator === Operator.TRUTHY) return truthyExpressionToSQL(expr, columns)
    if (expr.operator === Operator.IN || expr.operator === Operator.NOT_IN) return inExpressionToSQL(expr, columns)
    if (expr.operator === Operator.HAS || expr.operator === Operator.NOT_HAS) return hasExpressionToSQL(expr, columns)
    if (!VALID_KEY_VALUE_OPERATORS.includes(expr.operator) && expr.operator !== Operator.TRUTHY) {
        throw new Error(`invalid operator: ${expr.operator}`)
    }
    if (expr.key.isSegmented) return expressionToSQLSegmented(expr, columns)
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
    if (!root) return ''

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
    if (root.left) left = generateWhere(root.left, columns, registry)
    if (root.right) right = generateWhere(root.right, columns, registry)

    if (left && right) {
        if (!VALID_BOOL_OPERATORS.includes(root.boolOperator)) {
            throw new Error(`invalid bool operator: ${root.boolOperator}`)
        }
        text = `(${left} ${root.boolOperator} ${right})`
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

function buildSelectExpr(column, path) {
    const colId = getIdentifier(column)

    if (path.length === 0) return colId

    if (column.isJSON) {
        for (const part of path) validateJSONPathPart(part)
        return `${colId}->${path.map((p) => quoteJsonPathPart(p)).join('->')}`
    }
    if (column.jsonString) {
        return `parse_json(${colId})->${path.map((p) => quoteJsonPathPart(p)).join('->')}`
    }
    if (column.isMap) {
        return `${colId}[${escapeParam(path.join('.'))}]`
    }
    if (column.isArray) {
        const index = parseInt(path.join('.'), 10)
        if (isNaN(index)) throw new Error(`invalid array index, expected number: ${path.join('.')}`)
        return `${colId}[${index}]`
    }
    if (column.isStruct) {
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
            alias = raw.name
            if (!validAliasPattern.test(alias)) throw new Error(`invalid alias: ${alias}`)
            sqlExpr = `${sqlExpr} AS \`${alias}\``
        }

        selectColumns.push({ key, alias, column, sqlExpr })
        exprs.push(sqlExpr)
    }

    return { columns: selectColumns, sql: exprs.join(', ') }
}
