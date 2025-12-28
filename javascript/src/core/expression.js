import { tryConvertToNumber } from './utils.js'
import { FlyqlError } from './exceptions.js'
import { VALID_KEY_VALUE_OPERATORS, Operator } from './constants.js'
import { Key } from './key.js'

export class Expression {
    constructor(key, operator, value, valueIsString = null, values = null, valuesType = null) {
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

        if (operator === Operator.TRUTHY || operator === Operator.IN || operator === Operator.NOT_IN) {
            this.value = ''
        } else if (valueIsString === false) {
            this.value = tryConvertToNumber(value)
        } else if (valueIsString === true) {
            this.value = value
        } else {
            this.value = tryConvertToNumber(value)
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
