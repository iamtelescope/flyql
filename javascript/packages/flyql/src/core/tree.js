import { FlyqlError } from './exceptions.js'
import { VALID_BOOL_OPERATORS } from './constants.js'

export class Node {
    constructor(boolOperator, expression, left, right, negated = false, range = null, boolOperatorRange = null) {
        if ((left || right) && expression) {
            throw new FlyqlError('either (left or right) or expression at same time')
        }

        this.boolOperator = boolOperator
        this.expression = expression
        this.left = left
        this.right = right
        this.negated = negated
        this.range = range
        this.boolOperatorRange = boolOperatorRange
    }

    setBoolOperator(boolOperator) {
        if (!VALID_BOOL_OPERATORS.includes(boolOperator)) {
            throw new FlyqlError(`invalid bool operator: ${boolOperator}`)
        }
        this.boolOperator = boolOperator
    }

    setLeft(node) {
        this.left = node
    }

    setRight(node) {
        this.right = node
    }

    setExpression(expression) {
        this.expression = expression
    }

    setNegated(negated) {
        this.negated = negated
    }
}
