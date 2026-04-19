// Walk the FlyQL AST and emit an Elasticsearch Query DSL object.
//
// FlyQL query: status = 200 and env in ['prod', 'staging']
//
// Demonstrates a non-SQL custom generator: same AST, different target.
// See advanced/ast for the full custom-generator walkthrough.

import { BoolOperator, Operator, parse } from 'flyql'

function generateES(node) {
    if (!node) {
        return { match_all: {} }
    }

    let result
    if (node.expression) {
        result = expressionToES(node.expression)
    } else {
        const left = generateES(node.left)
        const right = generateES(node.right)
        if (node.boolOperator === BoolOperator.AND) {
            result = { bool: { must: [left, right] } }
        } else {
            result = { bool: { should: [left, right], minimum_should_match: 1 } }
        }
    }

    if (node.negated) {
        result = { bool: { must_not: [result] } }
    }
    return result
}

function expressionToES(expr) {
    const field = expr.key.raw
    switch (expr.operator) {
        case Operator.EQUALS:
            return { term: { [field]: expr.value } }
        case Operator.IN:
            return { terms: { [field]: expr.values || [] } }
        case Operator.GREATER_THAN:
            return { range: { [field]: { gt: expr.value } } }
        case Operator.TRUTHY:
            return { exists: { field } }
        default:
            throw new Error(`unsupported operator: ${expr.operator}`)
    }
}

const result = parse("status = 200 and env in ['prod', 'staging']")
const esQuery = generateES(result.root)
console.log(JSON.stringify(esQuery, null, 2))
