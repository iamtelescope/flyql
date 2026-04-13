import { Operator } from '../../core/constants.js'
import { Type } from '../../flyql_type.js'

const forbiddenOperations = new Set([
    `${Type.String}|${Operator.LOWER_THAN}|int`,
    `${Type.String}|${Operator.LOWER_THAN}|float`,
    `${Type.String}|${Operator.GREATER_THAN}|int`,
    `${Type.String}|${Operator.GREATER_THAN}|float`,
    `${Type.String}|${Operator.GREATER_OR_EQUALS_THAN}|int`,
    `${Type.String}|${Operator.GREATER_OR_EQUALS_THAN}|float`,
    `${Type.String}|${Operator.LOWER_OR_EQUALS_THAN}|int`,
    `${Type.String}|${Operator.LOWER_OR_EQUALS_THAN}|float`,

    `${Type.Int}|${Operator.REGEX}|string`,
    `${Type.Float}|${Operator.REGEX}|string`,
    `${Type.Int}|${Operator.NOT_REGEX}|string`,
    `${Type.Float}|${Operator.NOT_REGEX}|string`,

    `${Type.Bool}|${Operator.LOWER_THAN}|bool`,
    `${Type.Bool}|${Operator.GREATER_THAN}|bool`,
    `${Type.Bool}|${Operator.GREATER_OR_EQUALS_THAN}|bool`,
    `${Type.Bool}|${Operator.LOWER_OR_EQUALS_THAN}|bool`,
])

export function getValueType(value) {
    if (typeof value === 'boolean') return 'bool'
    if (typeof value === 'bigint') return 'int'
    if (typeof value === 'number') {
        return Number.isInteger(value) ? 'int' : 'float'
    }
    if (typeof value === 'string') return 'string'
    return ''
}

export function validateOperation(value, columnType, operator) {
    if (!columnType || columnType === Type.Unknown) return

    const key = `${columnType}|${operator}|${getValueType(value)}`
    if (forbiddenOperations.has(key)) {
        throw new Error(`operation not allowed: ${columnType} column with '${operator}' operator`)
    }
}

const inCompatibleTypes = {
    [Type.String]: new Set(['string']),
    [Type.Int]: new Set(['int', 'float']),
    [Type.Float]: new Set(['int', 'float']),
    [Type.Bool]: new Set(['bool', 'int']),
    [Type.Date]: new Set(['string']),
}

export function validateInListTypes(values, columnType) {
    if (!columnType || columnType === Type.Unknown) return
    if (!values || values.length === 0) return

    const allowedTypes = inCompatibleTypes[columnType]
    if (!allowedTypes) return

    for (const value of values) {
        const valueType = getValueType(value)
        if (valueType && !allowedTypes.has(valueType)) {
            throw new Error(`type mismatch in IN list: ${columnType} column cannot contain ${valueType} values`)
        }
    }
}
