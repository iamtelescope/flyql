import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export function loadTestData(filename) {
    const testDataPath = path.join(__dirname, '..', '..', 'tests-data', 'core', 'parser', filename)
    const content = fs.readFileSync(testDataPath, 'utf-8')
    return JSON.parse(content)
}

export function astToDict(node) {
    if (node === null) {
        return null
    }

    const result = {
        bool_operator: node.boolOperator,
        negated: node.negated || false,
        expression: null,
        left: null,
        right: null,
    }

    if (node.expression !== null) {
        result.expression = {
            key: node.expression.key.raw,
            operator: node.expression.operator,
            value: node.expression.value,
            value_type: typeof node.expression.value === 'string' ? 'string' : 'number',
            value_bigint: typeof node.expression.value === 'bigint',
        }
    }

    if (node.left !== null) {
        result.left = astToDict(node.left)
    }

    if (node.right !== null) {
        result.right = astToDict(node.right)
    }

    return result
}

export function normalizeAstForComparison(nodeDict) {
    if (nodeDict === null) {
        return null
    }

    if (
        nodeDict.expression === null &&
        nodeDict.left !== null &&
        nodeDict.left.expression !== null &&
        nodeDict.right === null &&
        nodeDict.left.left === null &&
        nodeDict.left.right === null &&
        !nodeDict.negated
    ) {
        return {
            bool_operator: '',
            negated: nodeDict.left.negated || false,
            expression: nodeDict.left.expression,
            left: null,
            right: null,
        }
    }

    if (nodeDict.expression === null && nodeDict.left === null && nodeDict.right !== null) {
        const normalized = normalizeAstForComparison(nodeDict.right)
        if (nodeDict.negated && normalized) {
            normalized.negated = true
        }
        return normalized
    }

    if (
        nodeDict.expression === null &&
        nodeDict.left === null &&
        nodeDict.right !== null &&
        nodeDict.right.left === null &&
        nodeDict.right.right !== null
    ) {
        const normalized = normalizeAstForComparison(nodeDict.right)
        if (nodeDict.negated && normalized) {
            normalized.negated = true
        }
        return normalized
    }

    const result = { ...nodeDict }
    if (result.left !== null) {
        result.left = normalizeAstForComparison(result.left)
    }
    if (result.right !== null) {
        result.right = normalizeAstForComparison(result.right)
    }

    return result
}

export function compareAst(actual, expected) {
    if (actual === null && expected === null) {
        return true
    }

    if (actual === null || expected === null) {
        return false
    }

    if (actual.bool_operator !== expected.bool_operator) {
        return false
    }

    const actualNegated = actual.negated || false
    const expectedNegated = expected.negated || false
    if (actualNegated !== expectedNegated) {
        return false
    }

    if (!compareExpressions(actual.expression, expected.expression)) {
        return false
    }

    if (!compareAst(actual.left, expected.left)) {
        return false
    }

    if (!compareAst(actual.right, expected.right)) {
        return false
    }

    return true
}

function compareExpressions(actual, expected) {
    if (actual === null && expected === null) {
        return true
    }

    if (actual === null || expected === null) {
        return false
    }

    if (actual.key !== expected.key) return false
    if (actual.operator !== expected.operator) return false
    if (actual.value_type !== expected.value_type) return false

    // BigInt values from the parser must be compared to their string representation
    // in the test data (since JSON cannot encode large integers without precision loss)
    if (actual.value_bigint) {
        return actual.value.toString() === String(expected.value)
    }

    return actual.value === expected.value
}

export function formatAstMismatchMessage(testName, input, expected, actual) {
    return `AST mismatch for test '${testName}':
Input: ${input}
Expected: ${JSON.stringify(expected, null, 2)}
Actual: ${JSON.stringify(actual, null, 2)}`
}
