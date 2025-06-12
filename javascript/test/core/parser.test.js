import { describe, it, expect } from 'vitest'
import { parse, ParserError } from '../../src/index.js'
import {
    loadTestData,
    astToDict,
    compareAst,
    formatAstMismatchMessage,
    normalizeAstForComparison
} from '../helpers.js'

function runTestCase(testCase) {
    if (testCase.expected_result === 'error') {
        expect(() => parse(testCase.input)).toThrow(ParserError)

        try {
            parse(testCase.input)
        } catch (error) {
            if (testCase.expected_error) {
                const expectedError = testCase.expected_error

                if (expectedError.errno) {
                    expect(error.errno).toBe(expectedError.errno)
                }

                if (expectedError.errno_options) {
                    expect(expectedError.errno_options).toContain(error.errno)
                }

                if (expectedError.message_contains) {
                    expect(error.message).toContain(expectedError.message_contains)
                }
            }
        }
    } else {
        const result = parse(testCase.input)
        const actualAst = normalizeAstForComparison(astToDict(result.root))
        const expectedAst = testCase.expected_ast

        const isMatch = compareAst(actualAst, expectedAst)
        if (!isMatch) {
            throw new Error(formatAstMismatchMessage(
                testCase.name,
                testCase.input,
                expectedAst,
                actualAst
            ))
        }
    }
}

describe('Parser Basic Tests', () => {
    const testData = loadTestData('basic.json')

    testData.tests.forEach(testCase => {
        it(testCase.name, () => {
            runTestCase(testCase)
        })
    })
})

describe('Parser Boolean Tests', () => {
    const testData = loadTestData('boolean.json')

    testData.tests.forEach(testCase => {
        it(testCase.name, () => {
            runTestCase(testCase)
        })
    })
})

describe('Parser Complex Tests', () => {
    const testData = loadTestData('complex.json')

    testData.tests.forEach(testCase => {
        it(testCase.name, () => {
            runTestCase(testCase)
        })
    })
})

describe('Parser Syntax Tests', () => {
    const testData = loadTestData('syntax.json')

    testData.tests.forEach(testCase => {
        it(testCase.name, () => {
            runTestCase(testCase)
        })
    })
})

describe('Parser Whitespace Tests', () => {
    const testData = loadTestData('whitespace.json')

    testData.tests.forEach(testCase => {
        it(testCase.name, () => {
            runTestCase(testCase)
        })
    })
})

describe('Parser Error Tests', () => {
    const testData = loadTestData('errors.json')

    testData.tests.forEach(testCase => {
        it(testCase.name, () => {
            runTestCase(testCase)
        })
    })
})