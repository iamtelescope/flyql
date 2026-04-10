import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { FunctionCall, Parameter } from '../src/core/expression.js'

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
        let value = node.expression.value
        if (value instanceof Parameter) {
            value = { name: value.name, positional: value.positional }
        } else if (value instanceof FunctionCall) {
            const fcDict = {
                name: value.name,
                duration_args: value.durationArgs.map((d) => ({ value: d.value, unit: d.unit })),
                unit: value.unit,
                timezone: value.timezone,
            }
            if (value.parameterArgs && value.parameterArgs.length > 0) {
                fcDict.parameter_args = value.parameterArgs.map((p) => ({
                    name: p.name,
                    positional: p.positional,
                }))
            }
            value = fcDict
        }
        result.expression = {
            key: node.expression.key.raw,
            operator: node.expression.operator,
            value: value,
            value_type: node.expression.valueType,
            value_bigint: typeof node.expression.value === 'bigint',
        }
        if (node.expression.values !== null) {
            result.expression.values = node.expression.values.map((v) =>
                v instanceof Parameter ? { name: v.name, positional: v.positional } : v,
            )
            result.expression.values_type = node.expression.valuesType
            result.expression.values_types = node.expression.valuesTypes
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

    // Skip value/value_type comparison for IN expressions (they use values/values_type)
    if (expected.values === undefined) {
        // Use value_type_js override if present (for cross-language BigInt boundary differences)
        const expectedValueType = expected.value_type_js !== undefined ? expected.value_type_js : expected.value_type
        if (actual.value_type !== expectedValueType) return false

        // BigInt values from the parser must be compared to their string representation
        // in the test data (since JSON cannot encode large integers without precision loss)
        if (actual.value_bigint) {
            return actual.value.toString() === String(expected.value)
        }

        // Function call and parameter values are objects — compare by JSON serialization
        if (
            (actual.value_type === 'function' || actual.value_type === 'parameter') &&
            typeof actual.value === 'object' &&
            typeof expected.value === 'object'
        ) {
            if (JSON.stringify(actual.value) !== JSON.stringify(expected.value)) return false
        } else if (actual.value !== expected.value) return false
    } else {
        if (actual.values === undefined) return false
        if (actual.values_type !== expected.values_type) return false
        if (actual.values.length !== expected.values.length) return false
        for (let i = 0; i < expected.values.length; i++) {
            const av = actual.values[i]
            const ev = expected.values[i]
            if (typeof av === 'object' && av !== null && typeof ev === 'object' && ev !== null) {
                if (JSON.stringify(av) !== JSON.stringify(ev)) return false
            } else if (av !== ev) return false
        }
        if (expected.values_types !== undefined && expected.values_types !== null) {
            if (actual.values_types === undefined || actual.values_types === null) return false
            if (actual.values_types.length !== expected.values_types.length) return false
            for (let i = 0; i < expected.values_types.length; i++) {
                if (actual.values_types[i] !== expected.values_types[i]) return false
            }
        }
    }

    return true
}

export function formatAstMismatchMessage(testName, input, expected, actual) {
    return `AST mismatch for test '${testName}':
Input: ${input}
Expected: ${JSON.stringify(expected, null, 2)}
Actual: ${JSON.stringify(actual, null, 2)}`
}
