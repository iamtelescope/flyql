import { describe, it, expect } from 'vitest'
import { parse, ParserError } from '../../src/columns/index.js'
import { Range } from '../../src/core/range.js'
import { loadTestData, compareColumns, formatColumnMismatchMessage } from './helpers.js'

function runTestCase(testCase, suiteCapabilities) {
    const capabilities = testCase.capabilities || suiteCapabilities || undefined
    if (testCase.expected_result === 'error') {
        expect(() => parse(testCase.input, capabilities)).toThrow(ParserError)

        if (testCase.expected_error) {
            try {
                parse(testCase.input, capabilities)
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
        const result = parse(testCase.input, capabilities)
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
                runTestCase(testCase, testData.default_capabilities)
            })
        })
    })

    describe('transformers parsing', () => {
        const testData = loadTestData('transformers.json')
        testData.tests.forEach((testCase) => {
            it(`should handle ${testCase.name}`, () => {
                runTestCase(testCase, testData.default_capabilities)
            })
        })
    })

    describe('error handling', () => {
        const testData = loadTestData('errors.json')
        testData.tests.forEach((testCase) => {
            it(`should handle ${testCase.name}`, () => {
                runTestCase(testCase, testData.default_capabilities)
            })
        })
    })

    describe('range tracking', () => {
        it('single column has nameRange', () => {
            const result = parse('level', { transformers: true })
            expect(result[0].nameRange).toEqual(new Range(0, 5))
        })

        it('multiple columns have correct nameRanges', () => {
            const result = parse('level, service', { transformers: true })
            expect(result[0].nameRange).toEqual(new Range(0, 5))
            expect(result[1].nameRange).toEqual(new Range(7, 14))
        })

        it('column with transformer has correct ranges', () => {
            const result = parse('level|upper', { transformers: true })
            expect(result[0].nameRange).toEqual(new Range(0, 5))
            expect(result[0].transformerRanges).toHaveLength(1)
            expect(result[0].transformerRanges[0].nameRange).toEqual(new Range(6, 11))
        })

        it('transformer with arguments has argumentRanges', () => {
            const result = parse('level|split(",")', { transformers: true })
            expect(result[0].transformerRanges[0].nameRange).toEqual(new Range(6, 11))
            expect(result[0].transformerRanges[0].argumentRanges).toHaveLength(1)
            // Quoted arg: range includes quotes
            expect(result[0].transformerRanges[0].argumentRanges[0]).toEqual(new Range(12, 15))
        })

        it('column with alias has correct nameRange', () => {
            const result = parse('level as lvl', { transformers: true })
            expect(result[0].nameRange).toEqual(new Range(0, 5))
        })

        it('chained transformers have correct ranges', () => {
            const result = parse('level|upper|len', { transformers: true })
            expect(result[0].nameRange).toEqual(new Range(0, 5))
            expect(result[0].transformerRanges).toHaveLength(2)
            expect(result[0].transformerRanges[0].nameRange).toEqual(new Range(6, 11))
            expect(result[0].transformerRanges[1].nameRange).toEqual(new Range(12, 15))
        })
    })
})
