import { Operator } from '../../core/constants.js'
import {
    NormalizedTypeString,
    NormalizedTypeInt,
    NormalizedTypeFloat,
    NormalizedTypeBool,
    NormalizedTypeDate,
} from './column.js'

const forbiddenOperations = new Set([
    `${NormalizedTypeString}|${Operator.LOWER_THAN}|int`,
    `${NormalizedTypeString}|${Operator.LOWER_THAN}|float`,
    `${NormalizedTypeString}|${Operator.GREATER_THAN}|int`,
    `${NormalizedTypeString}|${Operator.GREATER_THAN}|float`,
    `${NormalizedTypeString}|${Operator.GREATER_OR_EQUALS_THAN}|int`,
    `${NormalizedTypeString}|${Operator.GREATER_OR_EQUALS_THAN}|float`,
    `${NormalizedTypeString}|${Operator.LOWER_OR_EQUALS_THAN}|int`,
    `${NormalizedTypeString}|${Operator.LOWER_OR_EQUALS_THAN}|float`,

    `${NormalizedTypeInt}|${Operator.REGEX}|string`,
    `${NormalizedTypeFloat}|${Operator.REGEX}|string`,
    `${NormalizedTypeInt}|${Operator.NOT_REGEX}|string`,
    `${NormalizedTypeFloat}|${Operator.NOT_REGEX}|string`,

    `${NormalizedTypeBool}|${Operator.LOWER_THAN}|bool`,
    `${NormalizedTypeBool}|${Operator.GREATER_THAN}|bool`,
    `${NormalizedTypeBool}|${Operator.GREATER_OR_EQUALS_THAN}|bool`,
    `${NormalizedTypeBool}|${Operator.LOWER_OR_EQUALS_THAN}|bool`,
])

export function getValueType(value) {
    if (typeof value === 'boolean') return 'bool'
    if (typeof value === 'number') {
        return Number.isInteger(value) ? 'int' : 'float'
    }
    if (typeof value === 'string') return 'string'
    return ''
}

export function validateOperation(value, columnNormalizedType, operator) {
    if (!columnNormalizedType) return

    const key = `${columnNormalizedType}|${operator}|${getValueType(value)}`
    if (forbiddenOperations.has(key)) {
        throw new Error(`operation not allowed: ${columnNormalizedType} column with '${operator}' operator`)
    }
}

const inCompatibleTypes = {
    [NormalizedTypeString]: new Set(['string']),
    [NormalizedTypeInt]: new Set(['int', 'float']),
    [NormalizedTypeFloat]: new Set(['int', 'float']),
    [NormalizedTypeBool]: new Set(['bool', 'int']),
    [NormalizedTypeDate]: new Set(['string']),
}

export function validateInListTypes(values, columnNormalizedType) {
    if (!columnNormalizedType) return
    if (!values || values.length === 0) return

    const allowedTypes = inCompatibleTypes[columnNormalizedType]
    if (!allowedTypes) return

    for (const value of values) {
        const valueType = getValueType(value)
        if (valueType && !allowedTypes.has(valueType)) {
            throw new Error(
                `type mismatch in IN list: ${columnNormalizedType} column cannot contain ${valueType} values`,
            )
        }
    }
}
