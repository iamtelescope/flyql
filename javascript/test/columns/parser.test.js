import { describe, it, expect } from 'vitest'
import { parse, ParserError } from '../../src/columns/index.js'
import { loadTestData, compareColumns, formatColumnMismatchMessage } from './helpers.js'

function runTestCase(testCase) {
    if (testCase.expected_result === 'error') {
        expect(() => parse(testCase.input)).toThrow(ParserError)

        if (testCase.expected_error) {
            try {
                parse(testCase.input)
            } catch (e) {
                const expectedError = testCase.expected_error
                if (expectedError.errno) {
                    expect(e.errno).toBe(expectedError.errno)
                }
                if (expectedError.message_contains && expectedError.message_contains !== '') {
                    expect(e.message).toContain(expectedError.message_contains)
                }
            }
        }
    } else {
        const result = parse(testCase.input)
        const expected = testCase.expected_columns
        expect(compareColumns(result, expected)).toBe(true)
        if (!compareColumns(result, expected)) {
            throw new Error(formatColumnMismatchMessage(testCase.name, testCase.input, expected, result))
        }
    }
}

describe('Columns Parser', () => {
    describe('basic parsing', () => {
        const testData = loadTestData('basic.json')
        testData.tests.forEach((testCase) => {
            it(`should handle ${testCase.name}`, () => {
                runTestCase(testCase)
            })
        })
    })

    describe('modifiers parsing', () => {
        const testData = loadTestData('modifiers.json')
        testData.tests.forEach((testCase) => {
            it(`should handle ${testCase.name}`, () => {
                runTestCase(testCase)
            })
        })
    })

    describe('error handling', () => {
        const testData = loadTestData('errors.json')
        testData.tests.forEach((testCase) => {
            it(`should handle ${testCase.name}`, () => {
                runTestCase(testCase)
            })
        })
    })
})
