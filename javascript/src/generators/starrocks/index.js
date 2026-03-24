import { Operator, BoolOperator, VALID_KEY_VALUE_OPERATORS, VALID_BOOL_OPERATORS } from '../../core/constants.js'
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

export function escapeParam(item) {
    if (item === null || item === undefined) return 'NULL'
    if (typeof item === 'string') {
        let result = "'"
        for (const c of item) {
            result += escapeCharsMap[c] !== undefined ? escapeCharsMap[c] : c
        }
        return result + "'"
    }
    if (typeof item === 'boolean') return item ? 'True' : 'False'
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
    if (!column) throw new Error(`unknown column: ${columnName}`)

    if (column.values && column.values.length > 0) {
        if (!column.values.includes(String(expr.value))) throw new Error(`unknown value: ${expr.value}`)
    }

    if (column.normalizedType) validateOperation(expr.value, column.normalizedType, expr.operator)

    switch (expr.operator) {
        case Operator.REGEX: {
            const value = escapeParam(String(expr.value))
            return `regexp(\`${column.name}\`, ${value})`
        }
        case Operator.NOT_REGEX: {
            const value = escapeParam(String(expr.value))
            return `not regexp(\`${column.name}\`, ${value})`
        }
        case Operator.EQUALS:
        case Operator.NOT_EQUALS: {
            let operator = expr.operator
            const { patternFound, value: processed } = prepareLikePatternValue(String(expr.value))
            const escapedValue = escapeParam(processed)
            if (patternFound) {
                operator = expr.operator === Operator.EQUALS ? 'LIKE' : 'NOT LIKE'
            }
            return `\`${column.name}\` ${operator} ${escapedValue}`
        }
        default: {
            if (typeof expr.value === 'number' || typeof expr.value === 'bigint') {
                return `\`${column.name}\` ${expr.operator} ${expr.value}`
            }
            const value = escapeParam(String(expr.value))
            return `\`${column.name}\` ${expr.operator} ${value}`
        }
    }
}

function expressionToSQLSegmented(expr, columns) {
    const reverseOperator = expr.operator === Operator.NOT_REGEX ? 'not ' : ''
    const operator = operatorToStarRocksOperator[expr.operator]
    const columnName = expr.key.segments[0]
    const column = columns[columnName]
    if (!column) throw new Error(`unknown column: ${columnName}`)

    if (column.normalizedType) validateOperation(expr.value, column.normalizedType, expr.operator)

    if (column.isJSON) {
        const jsonPath = expr.key.segments.slice(1)
        for (const part of jsonPath) validateJSONPathPart(part)
        const jsonPathStr = jsonPath.map((p) => quoteJsonPathPart(p)).join('->')
        const value = escapeParam(expr.value)
        let columnExp = `\`${column.name}\`->${jsonPathStr}`
        if (expr.operator === Operator.REGEX || expr.operator === Operator.NOT_REGEX) {
            columnExp = `cast(${columnExp} as string)`
        }
        return `${columnExp} ${reverseOperator}${operator} ${value}`
    } else if (column.isMap) {
        const mapPath = expr.key.segments.slice(1).map((p) => escapeParam(p))
        const mapKey = mapPath.join('][')
        const value = escapeParam(expr.value)
        return `\`${column.name}\`[${mapKey}] ${reverseOperator}${operator} ${value}`
    } else if (column.isArray) {
        const arrayIndexStr = expr.key.segments.slice(1).join('.')
        const arrayIndex = parseInt(arrayIndexStr, 10)
        if (isNaN(arrayIndex)) throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
        const value = escapeParam(expr.value)
        return `\`${column.name}\`[${arrayIndex}] ${reverseOperator}${operator} ${value}`
    } else if (column.isStruct) {
        const structPath = expr.key.segments.slice(1)
        const structColumn = structPath.join('`.`')
        const value = escapeParam(expr.value)
        return `\`${column.name}\`.\`${structColumn}\` ${reverseOperator}${operator} ${value}`
    } else if (column.jsonString) {
        const jsonPath = expr.key.segments.slice(1)
        for (const part of jsonPath) validateJSONPathPart(part)
        const jsonPathStr = jsonPath.map((p) => quoteJsonPathPart(p)).join('->')
        const value = escapeParam(expr.value)
        let columnExp = `parse_json(\`${column.name}\`)->${jsonPathStr}`
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

    if (column.normalizedType && !expr.key.isSegmented) {
        validateInListTypes(expr.values, column.normalizedType)
    }

    const valuesSQL = expr.values.map((v) => escapeParam(v)).join(', ')
    const sqlOp = isNotIn ? 'NOT IN' : 'IN'

    if (expr.key.isSegmented) {
        if (column.isJSON) {
            const jsonPath = expr.key.segments.slice(1)
            for (const part of jsonPath) validateJSONPathPart(part)
            const jsonPathStr = jsonPath.map((p) => quoteJsonPathPart(p)).join('->')
            return `\`${column.name}\`->${jsonPathStr} ${sqlOp} (${valuesSQL})`
        } else if (column.isMap) {
            const mapKey = expr.key.segments.slice(1).join("']['")
            return `\`${column.name}\`['${mapKey}'] ${sqlOp} (${valuesSQL})`
        } else if (column.isArray) {
            const arrayIndexStr = expr.key.segments.slice(1).join('.')
            const arrayIndex = parseInt(arrayIndexStr, 10)
            if (isNaN(arrayIndex)) throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
            return `\`${column.name}\`[${arrayIndex}] ${sqlOp} (${valuesSQL})`
        } else if (column.isStruct) {
            const structColumn = expr.key.segments.slice(1).join('`.`')
            return `\`${column.name}\`.\`${structColumn}\` ${sqlOp} (${valuesSQL})`
        } else if (column.jsonString) {
            const jsonPath = expr.key.segments.slice(1)
            const jsonPathStr = jsonPath.map((p) => quoteJsonPathPart(p)).join('->')
            return `parse_json(\`${column.name}\`)->${jsonPathStr} ${sqlOp} (${valuesSQL})`
        } else {
            throw new Error('path search for unsupported column type')
        }
    }

    return `\`${column.name}\` ${sqlOp} (${valuesSQL})`
}

function truthyExpressionToSQL(expr, columns) {
    const columnName = expr.key.segments[0]
    const column = columns[columnName]
    if (!column) throw new Error(`unknown column: ${columnName}`)

    if (expr.key.isSegmented) {
        if (column.isJSON) {
            const jsonPath = expr.key.segments.slice(1)
            for (const part of jsonPath) validateJSONPathPart(part)
            const jsonPathStr = jsonPath.map((p) => quoteJsonPathPart(p)).join('->')
            return `(\`${column.name}\`->${jsonPathStr} IS NOT NULL)`
        } else if (column.isMap) {
            const mapKey = escapeParam(expr.key.segments.slice(1).join('.'))
            return `(element_at(\`${column.name}\`, ${mapKey}) IS NOT NULL AND \`${column.name}\`[${mapKey}] != '')`
        } else if (column.isArray) {
            const arrayIndex = parseInt(expr.key.segments.slice(1).join('.'), 10)
            if (isNaN(arrayIndex))
                throw new Error(`invalid array index, expected number: ${expr.key.segments.slice(1).join('.')}`)
            return `(array_length(\`${column.name}\`) >= ${arrayIndex} AND \`${column.name}\`[${arrayIndex}] != '')`
        } else if (column.isStruct) {
            const structColumn = expr.key.segments.slice(1).join('`.`')
            return `\`${column.name}\`.\`${structColumn}\` IS NOT NULL AND \`${column.name}\`.\`${structColumn}\` != ''`
        } else if (column.jsonString) {
            const jsonPath = expr.key.segments.slice(1)
            const jsonPathStr = jsonPath.map((p) => quoteJsonPathPart(p)).join('->')
            return `(json_exists(parse_json(\`${column.name}\`), ${jsonPathStr}) AND parse_json(\`${column.name}\`)->${jsonPathStr} != '')`
        } else {
            throw new Error('path search for unsupported column type')
        }
    }

    if (column.jsonString) {
        if (column.isMap || column.isStruct) {
            return `(\`${column.name}\` IS NOT NULL AND json_length(to_json(\`${column.name}\`)) > 0)`
        }
        return `(\`${column.name}\` IS NOT NULL AND \`${column.name}\` != '' AND json_length(\`${column.name}\`) > 0)`
    }

    switch (column.normalizedType) {
        case NormalizedTypeBool:
            return `\`${column.name}\``
        case NormalizedTypeString:
            return `(\`${column.name}\` IS NOT NULL AND \`${column.name}\` != '')`
        case NormalizedTypeInt:
        case NormalizedTypeFloat:
            return `(\`${column.name}\` IS NOT NULL AND \`${column.name}\` != 0)`
        case NormalizedTypeDate:
            return `(\`${column.name}\` IS NOT NULL)`
        default:
            return `(\`${column.name}\` IS NOT NULL)`
    }
}

function falsyExpressionToSQL(expr, columns) {
    const columnName = expr.key.segments[0]
    const column = columns[columnName]
    if (!column) throw new Error(`unknown column: ${columnName}`)

    if (expr.key.isSegmented) {
        if (column.isJSON) {
            const jsonPath = expr.key.segments.slice(1)
            for (const part of jsonPath) validateJSONPathPart(part)
            const jsonPathStr = jsonPath.map((p) => quoteJsonPathPart(p)).join('->')
            return `(\`${column.name}\`->${jsonPathStr} IS NULL)`
        } else if (column.isMap) {
            const mapKey = escapeParam(expr.key.segments.slice(1).join('.'))
            return `(element_at(\`${column.name}\`, '${mapKey}') IS NULL OR \`${column.name}\`['${mapKey}'] = '')`
        } else if (column.isArray) {
            const arrayIndex = parseInt(expr.key.segments.slice(1).join('.'), 10)
            if (isNaN(arrayIndex)) throw new Error(`invalid array index`)
            return `(array_length(\`${column.name}\`) < ${arrayIndex} OR \`${column.name}\`[${arrayIndex}] = '')`
        } else if (column.isStruct) {
            const structColumn = expr.key.segments.slice(1).join('`.`')
            return `\`${column.name}\`.\`${structColumn}\` IS NULL OR \`${column.name}\`.\`${structColumn}\` = ''`
        } else if (column.jsonString) {
            const jsonPath = expr.key.segments.slice(1)
            const jsonPathStr = jsonPath.map((p) => quoteJsonPathPart(p)).join('->')
            return `(NOT json_exists(parse_json(\`${column.name}\`), '$.${jsonPathStr}') OR parse_json(\`${column.name}\`)->${jsonPathStr} = '')`
        } else {
            throw new Error('path search for unsupported column type')
        }
    }

    if (column.jsonString) {
        if (column.isMap || column.isStruct) {
            return `(\`${column.name}\` IS NULL OR json_length(to_json(\`${column.name}\`)) = 0)`
        }
        return `(\`${column.name}\` IS NULL OR \`${column.name}\` = '' OR json_length(\`${column.name}\`) = 0)`
    }

    switch (column.normalizedType) {
        case NormalizedTypeBool:
            return `NOT \`${column.name}\``
        case NormalizedTypeString:
            return `(\`${column.name}\` IS NULL OR \`${column.name}\` = '')`
        case NormalizedTypeInt:
        case NormalizedTypeFloat:
            return `(\`${column.name}\` IS NULL OR \`${column.name}\` = 0)`
        case NormalizedTypeDate:
            return `(\`${column.name}\` IS NULL)`
        default:
            return `(\`${column.name}\` IS NULL)`
    }
}

function hasExpressionToSQL(expr, columns) {
    const isNotHas = expr.operator === Operator.NOT_HAS
    const columnName = expr.key.segments[0]
    const column = columns[columnName]
    if (!column) throw new Error(`unknown column: ${columnName}`)

    const value = escapeParam(expr.value)

    if (expr.key.isSegmented) {
        if (column.isJSON) {
            const jsonPath = expr.key.segments.slice(1)
            for (const part of jsonPath) validateJSONPathPart(part)
            const jsonPathStr = jsonPath.map((p) => quoteJsonPathPart(p)).join('->')
            const columnExp = `cast(\`${column.name}\`->${jsonPathStr} as string)`
            if (isNotHas) {
                return `INSTR(${columnExp}, ${value}) = 0`
            }
            return `INSTR(${columnExp}, ${value}) > 0`
        } else if (column.isMap) {
            const mapPath = expr.key.segments.slice(1).map((p) => escapeParam(p))
            const mapKey = mapPath.join('][')
            if (isNotHas) {
                return `INSTR(\`${column.name}\`[${mapKey}], ${value}) = 0`
            }
            return `INSTR(\`${column.name}\`[${mapKey}], ${value}) > 0`
        } else if (column.isArray) {
            const arrayIndexStr = expr.key.segments.slice(1).join('.')
            const arrayIndex = parseInt(arrayIndexStr, 10)
            if (isNaN(arrayIndex)) throw new Error(`invalid array index, expected number: ${arrayIndexStr}`)
            if (isNotHas) {
                return `INSTR(\`${column.name}\`[${arrayIndex}], ${value}) = 0`
            }
            return `INSTR(\`${column.name}\`[${arrayIndex}], ${value}) > 0`
        } else if (column.jsonString) {
            const jsonPath = expr.key.segments.slice(1)
            for (const part of jsonPath) validateJSONPathPart(part)
            const jsonPathStr = jsonPath.map((p) => quoteJsonPathPart(p)).join('->')
            const columnExp = `cast(parse_json(\`${column.name}\`)->${jsonPathStr} as string)`
            if (isNotHas) {
                return `INSTR(${columnExp}, ${value}) = 0`
            }
            return `INSTR(${columnExp}, ${value}) > 0`
        } else {
            throw new Error('path search for unsupported column type')
        }
    }

    if (column.isArray) {
        if (isNotHas) {
            return `NOT array_contains(\`${column.name}\`, ${value})`
        }
        return `array_contains(\`${column.name}\`, ${value})`
    }

    if (column.isMap) {
        if (isNotHas) {
            return `NOT array_contains(map_keys(\`${column.name}\`), ${value})`
        }
        return `array_contains(map_keys(\`${column.name}\`), ${value})`
    }

    if (column.isJSON) {
        if (isNotHas) {
            return `NOT json_exists(\`${column.name}\`, concat('$.', ${value}))`
        }
        return `json_exists(\`${column.name}\`, concat('$.', ${value}))`
    }

    if (column.normalizedType === NormalizedTypeString) {
        if (isNotHas) {
            return `(\`${column.name}\` IS NULL OR INSTR(\`${column.name}\`, ${value}) = 0)`
        }
        return `INSTR(\`${column.name}\`, ${value}) > 0`
    }

    throw new Error(`has operator is not supported for column type: ${column.normalizedType}`)
}

function expressionToSQL(expr, columns) {
    if (expr.operator === Operator.TRUTHY) return truthyExpressionToSQL(expr, columns)
    if (expr.operator === Operator.IN || expr.operator === Operator.NOT_IN) return inExpressionToSQL(expr, columns)
    if (expr.operator === Operator.HAS || expr.operator === Operator.NOT_HAS) return hasExpressionToSQL(expr, columns)
    if (!VALID_KEY_VALUE_OPERATORS.includes(expr.operator) && expr.operator !== Operator.TRUTHY) {
        throw new Error(`invalid operator: ${expr.operator}`)
    }
    if (expr.key.isSegmented) return expressionToSQLSegmented(expr, columns)
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
    if (!root) return ''

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
    if (root.left) left = generateWhere(root.left, columns)
    if (root.right) right = generateWhere(root.right, columns)

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
    if (path.length === 0) return `\`${column.name}\``

    if (column.isJSON) {
        for (const part of path) validateJSONPathPart(part)
        return `\`${column.name}\`->${path.map((p) => quoteJsonPathPart(p)).join('->')}`
    }
    if (column.jsonString) {
        return `parse_json(\`${column.name}\`)->${path.map((p) => quoteJsonPathPart(p)).join('->')}`
    }
    if (column.isMap) {
        return `\`${column.name}\`[${escapeParam(path.join('.'))}]`
    }
    if (column.isArray) {
        const index = parseInt(path.join('.'), 10)
        if (isNaN(index)) throw new Error(`invalid array index, expected number: ${path.join('.')}`)
        return `\`${column.name}\`[${index}]`
    }
    if (column.isStruct) {
        return `\`${column.name}\`.\`${path.join('`.`')}\``
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
