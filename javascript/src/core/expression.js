import { convertUnquotedValue } from './utils.js'
import { FlyqlError } from './exceptions.js'
import { VALID_KEY_VALUE_OPERATORS, Operator } from './constants.js'
import { Key } from './key.js'
import { ValueType } from '../types.js'

export class Duration {
    constructor(value, unit) {
        this.value = value
        this.unit = unit
    }
}

export class FunctionCall {
    constructor(name, durationArgs = [], unit = '', timezone = '') {
        this.name = name
        this.durationArgs = durationArgs
        this.unit = unit
        this.timezone = timezone
        this.parameterArgs = []
    }
}

export class Parameter {
    constructor(name, positional) {
        this.name = name
        this.positional = positional
    }
}

export class Expression {
    constructor(
        key,
        operator,
        value,
        valueIsString = null,
        values = null,
        valuesType = null,
        valuesTypes = null,
        valueType = undefined,
        range = null,
        operatorRange = null,
        valueRange = null,
        valueRanges = null,
    ) {
        if (operator !== Operator.TRUTHY && !VALID_KEY_VALUE_OPERATORS.includes(operator)) {
            throw new FlyqlError(`invalid operator: ${operator}`)
        }

        if (!key.segments || key.segments.length === 0) {
            throw new FlyqlError('empty key')
        }

        this.key = key
        this.operator = operator
        this.values = values
        this.valuesType = valuesType
        this.valuesTypes = valuesTypes
        this.range = range
        this.operatorRange = operatorRange
        this.valueRange = valueRange
        this.valueRanges = valueRanges

        if (valueType !== undefined) {
            this.value = value
            this.valueType = valueType
        } else if (operator === Operator.TRUTHY) {
            this.value = ''
            this.valueType = ValueType.STRING
        } else if (operator === Operator.IN || operator === Operator.NOT_IN) {
            this.value = ''
            this.valueType = null
        } else if (valueIsString === false) {
            const [convertedValue, detectedType] = convertUnquotedValue(value)
            this.value = convertedValue
            this.valueType = detectedType
        } else if (valueIsString === true) {
            this.value = value
            this.valueType = ValueType.STRING
        } else {
            const [convertedValue, detectedType] = convertUnquotedValue(value)
            this.value = convertedValue
            this.valueType = detectedType
        }
    }

    toString() {
        if (this.operator === Operator.IN || this.operator === Operator.NOT_IN) {
            const valuesStr = this.values ? this.values.join(', ') : ''
            return `${this.key.raw} ${this.operator} [${valuesStr}]`
        }
        return `${this.key.raw}${this.operator}${this.value}`
    }
}
