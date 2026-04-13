/**
 * Parameter binding for FlyQL ASTs.
 *
 * `bindParams()` walks a parsed AST and substitutes parameter placeholders with
 * concrete values. Parameters can appear in:
 *
 *   - Expression values:        `status=$code`
 *   - IN-list values:           `status in [$x, $y]`
 *   - Function arguments:       `created=ago($duration)`
 *
 * bindParams() mutates the AST in place and returns the same Node.
 */

import { Parameter, FunctionCall, Duration } from './core/expression.js'
import { FlyqlError } from './core/exceptions.js'
import { LiteralKind } from './literal/literal_kind.js'

const MAX_SAFE = Number.MAX_SAFE_INTEGER
const MIN_SAFE = Number.MIN_SAFE_INTEGER
const DURATION_UNITS = ['s', 'm', 'h', 'd', 'w']

function _typeName(value) {
    if (value === null) return 'null'
    if (Array.isArray(value)) return 'array'
    return typeof value
}

function _valueTypeFor(value) {
    if (value === null) return LiteralKind.NULL
    if (typeof value === 'boolean') return LiteralKind.BOOLEAN
    if (typeof value === 'number') {
        if (Number.isInteger(value)) {
            if (value > MAX_SAFE || value < MIN_SAFE) {
                return LiteralKind.BIGINT
            }
            return LiteralKind.INTEGER
        }
        return LiteralKind.FLOAT
    }
    if (typeof value === 'string') return LiteralKind.STRING
    throw new FlyqlError(`unsupported parameter value type: ${_typeName(value)}`)
}

function _parseDuration(value) {
    if (!value || value.length < 2) {
        throw new FlyqlError(`invalid duration value: ${JSON.stringify(value)}`)
    }
    const unit = value[value.length - 1]
    if (!DURATION_UNITS.includes(unit)) {
        throw new FlyqlError(`invalid duration unit '${unit}' — expected one of ${DURATION_UNITS.join(',')}`)
    }
    const numStr = value.slice(0, -1)
    if (!/^-?\d+$/.test(numStr)) {
        throw new FlyqlError(`invalid duration value: ${JSON.stringify(value)}`)
    }
    const num = parseInt(numStr, 10)
    return new Duration(num, unit)
}

function _resolveParam(param, params, consumed, maxPositional) {
    if (param.positional) {
        const idx = parseInt(param.name, 10)
        if (idx > maxPositional.value) {
            maxPositional.value = idx
        }
    }
    if (!Object.prototype.hasOwnProperty.call(params, param.name)) {
        throw new FlyqlError(`unbound parameter: $${param.name}`)
    }
    consumed.add(param.name)
    return params[param.name]
}

function _bindFunctionCall(fc, params, consumed, maxPositional) {
    if (!fc.parameterArgs || fc.parameterArgs.length === 0) {
        return
    }

    if (fc.name === 'ago') {
        for (const param of fc.parameterArgs) {
            const value = _resolveParam(param, params, consumed, maxPositional)
            if (typeof value === 'string') {
                fc.durationArgs.push(_parseDuration(value))
            } else if (value instanceof Duration) {
                fc.durationArgs.push(value)
            } else {
                throw new FlyqlError(`ago() parameter must be a duration string or Duration, got ${_typeName(value)}`)
            }
        }
    } else if (fc.name === 'today') {
        if (fc.parameterArgs.length > 1) {
            throw new FlyqlError('today() accepts at most one parameter (timezone)')
        }
        const value = _resolveParam(fc.parameterArgs[0], params, consumed, maxPositional)
        if (typeof value !== 'string') {
            throw new FlyqlError(`today() timezone parameter must be a string, got ${_typeName(value)}`)
        }
        fc.timezone = value
    } else if (fc.name === 'startOf') {
        let idx = 0
        if (!fc.unit) {
            const value = _resolveParam(fc.parameterArgs[idx], params, consumed, maxPositional)
            if (typeof value !== 'string') {
                throw new FlyqlError(`startOf() unit parameter must be a string, got ${_typeName(value)}`)
            }
            if (value !== 'day' && value !== 'week' && value !== 'month') {
                throw new FlyqlError(`invalid unit '${value}' — expected 'day', 'week', or 'month'`)
            }
            fc.unit = value
            idx += 1
        }
        if (idx < fc.parameterArgs.length) {
            const value = _resolveParam(fc.parameterArgs[idx], params, consumed, maxPositional)
            if (typeof value !== 'string') {
                throw new FlyqlError(`startOf() timezone parameter must be a string, got ${_typeName(value)}`)
            }
            fc.timezone = value
            idx += 1
        }
        if (idx < fc.parameterArgs.length) {
            throw new FlyqlError('startOf() accepts at most two parameters (unit, timezone)')
        }
    } else if (fc.name === 'now') {
        throw new FlyqlError('now() does not accept arguments')
    } else {
        throw new FlyqlError(`unknown function: ${fc.name}`)
    }

    fc.parameterArgs = []
}

function _bindExpression(expr, params, consumed, maxPositional) {
    // Case 1: expression.value is a Parameter
    if (expr.value instanceof Parameter) {
        const value = _resolveParam(expr.value, params, consumed, maxPositional)
        expr.valueType = _valueTypeFor(value)
        expr.value = value
        return
    }

    // Case 2: expression.value is a FunctionCall with parameterArgs
    if (expr.value instanceof FunctionCall) {
        _bindFunctionCall(expr.value, params, consumed, maxPositional)
        return
    }

    // Case 3: expression.values contains Parameters (IN-list)
    if (expr.values !== null && expr.values !== undefined) {
        const newValues = []
        const newTypes = []
        const existingTypes = expr.valuesTypes || []
        for (let i = 0; i < expr.values.length; i++) {
            const v = expr.values[i]
            if (v instanceof Parameter) {
                const value = _resolveParam(v, params, consumed, maxPositional)
                newValues.push(value)
                newTypes.push(_valueTypeFor(value))
            } else {
                newValues.push(v)
                if (i < existingTypes.length) {
                    newTypes.push(existingTypes[i])
                } else {
                    newTypes.push(_valueTypeFor(v))
                }
            }
        }
        expr.values = newValues
        expr.valuesTypes = newTypes
    }
}

function _walk(node, params, consumed, maxPositional) {
    if (node === null || node === undefined) {
        return
    }
    if (node.expression !== null && node.expression !== undefined) {
        _bindExpression(node.expression, params, consumed, maxPositional)
    }
    _walk(node.left, params, consumed, maxPositional)
    _walk(node.right, params, consumed, maxPositional)
}

/**
 * Substitute parameter placeholders in a parsed AST with concrete values.
 *
 * @param {Node} node - The root Node of a parsed FlyQL query.
 * @param {Object} params - Mapping of parameter names (without `$` prefix) to
 *     concrete values. Positional parameters use string keys of digits
 *     (e.g. `{"1": 42}`).
 * @returns {Node} The same node, mutated in place.
 * @throws {FlyqlError} on missing/unused parameters or unsupported types.
 */
export function bindParams(node, params) {
    if (params === null || typeof params !== 'object' || Array.isArray(params)) {
        throw new FlyqlError('bindParams() params must be a plain object')
    }

    const consumed = new Set()
    const maxPositional = { value: 0 }
    _walk(node, params, consumed, maxPositional)

    // Validate: any provided params not consumed are "unused".
    for (const key of Object.keys(params)) {
        if (consumed.has(key)) continue
        throw new FlyqlError(`unused parameter: ${key}`)
    }

    // Validate that every positional index from 1 to max was provided.
    for (let i = 1; i <= maxPositional.value; i++) {
        if (!Object.prototype.hasOwnProperty.call(params, String(i))) {
            throw new FlyqlError(`unbound parameter: $${i}`)
        }
    }

    return node
}
