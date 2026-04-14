import { describe, it, expect } from 'vitest'
import { parse, ParserError } from '../../src/index.js'
import { loadTestData, astToDict, compareAst, formatAstMismatchMessage, normalizeAstForComparison } from '../helpers.js'

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
            throw new Error(formatAstMismatchMessage(testCase.name, testCase.input, expectedAst, actualAst))
        }
    }
}

describe('Parser Basic Tests', () => {
    const testData = loadTestData('basic.json')

    testData.tests.forEach((testCase) => {
        it(testCase.name, () => {
            runTestCase(testCase)
        })
    })
})

describe('Parser Boolean Tests', () => {
    const testData = loadTestData('boolean.json')

    testData.tests.forEach((testCase) => {
        it(testCase.name, () => {
            runTestCase(testCase)
        })
    })
})

describe('Parser Complex Tests', () => {
    const testData = loadTestData('complex.json')

    testData.tests.forEach((testCase) => {
        it(testCase.name, () => {
            runTestCase(testCase)
        })
    })
})

describe('Parser Syntax Tests', () => {
    const testData = loadTestData('syntax.json')

    testData.tests.forEach((testCase) => {
        it(testCase.name, () => {
            runTestCase(testCase)
        })
    })
})

describe('Parser Whitespace Tests', () => {
    const testData = loadTestData('whitespace.json')

    testData.tests.forEach((testCase) => {
        it(testCase.name, () => {
            runTestCase(testCase)
        })
    })
})

describe('Parser Error Tests', () => {
    const testData = loadTestData('errors.json')

    testData.tests.forEach((testCase) => {
        it(testCase.name, () => {
            runTestCase(testCase)
        })
    })
})

describe('Parser Quoted Keys Tests', () => {
    const testData = loadTestData('quoted_keys.json')

    testData.tests.forEach((testCase) => {
        it(testCase.name, () => {
            runTestCase(testCase)
        })
    })
})

describe('Parser Truthy Tests', () => {
    const testData = loadTestData('truthy.json')

    testData.tests.forEach((testCase) => {
        it(testCase.name, () => {
            runTestCase(testCase)
        })
    })
})

describe('Parser Not Tests', () => {
    const testData = loadTestData('not.json')

    testData.tests.forEach((testCase) => {
        it(testCase.name, () => {
            runTestCase(testCase)
        })
    })
})

describe('Parser Int64 Tests', () => {
    const testData = loadTestData('int64.json')

    testData.tests.forEach((testCase) => {
        it(testCase.name, () => {
            runTestCase(testCase)
        })
    })
})

describe('Parser Has Tests', () => {
    const testData = loadTestData('has.json')

    testData.tests.forEach((testCase) => {
        it(testCase.name, () => {
            runTestCase(testCase)
        })
    })
})

describe('Parser Escaped Quotes in Values Tests', () => {
    const testData = loadTestData('escaped_quotes_in_values.json')

    testData.tests.forEach((testCase) => {
        it(testCase.name, () => {
            runTestCase(testCase)
        })
    })
})

describe('Parser Types Tests', () => {
    const testData = loadTestData('types.json')

    testData.tests.forEach((testCase) => {
        it(testCase.name, () => {
            runTestCase(testCase)
        })
    })
})

describe('Parser Null Errors Tests', () => {
    const testData = loadTestData('null_errors.json')

    testData.tests.forEach((testCase) => {
        it(testCase.name, () => {
            runTestCase(testCase)
        })
    })
})

describe('Parser Like Tests', () => {
    const testData = loadTestData('like.json')

    testData.tests.forEach((testCase) => {
        it(testCase.name, () => {
            runTestCase(testCase)
        })
    })
})

describe('Parser Functions Tests', () => {
    const testData = loadTestData('functions.json')

    testData.tests.forEach((testCase) => {
        it(testCase.name, () => {
            runTestCase(testCase)
        })
    })
})

describe('Parser Parameters Tests', () => {
    const testData = loadTestData('parameters.json')

    testData.tests.forEach((testCase) => {
        it(testCase.name, () => {
            runTestCase(testCase)
        })
    })
})

describe('Parser Precedence Tests', () => {
    const testData = loadTestData('precedence.json')

    testData.tests.forEach((testCase) => {
        it(testCase.name, () => {
            runTestCase(testCase)
        })
    })
})

describe('normalizeAstForComparison idempotent on canonical trees', () => {
    const testData = loadTestData('precedence.json')

    testData.tests.forEach((testCase) => {
        it(testCase.name, () => {
            const result = parse(testCase.input)
            const raw = astToDict(result.root)
            const normalized = normalizeAstForComparison(raw)
            if (JSON.stringify(normalized) !== JSON.stringify(raw)) {
                throw new Error(
                    `normalizeAstForComparison is not idempotent on ${testCase.name}\n` +
                        `raw:        ${JSON.stringify(raw)}\n` +
                        `normalized: ${JSON.stringify(normalized)}`,
                )
            }
        })
    })
})

describe('Parser Precedence Raw AST Shape', () => {
    const testData = loadTestData('precedence.json')

    testData.tests.forEach((testCase) => {
        it(`${testCase.name} (raw)`, () => {
            const result = parse(testCase.input)
            const actualRaw = astToDict(result.root)
            // Drop JS-only value_bigint flag for cross-language comparison
            const strip = (n) => {
                if (!n) return n
                if (n.expression && 'value_bigint' in n.expression) {
                    const { value_bigint: _, ...rest } = n.expression
                    n = { ...n, expression: rest }
                }
                if (n.left) n.left = strip(n.left)
                if (n.right) n.right = strip(n.right)
                return n
            }
            const stripped = strip(actualRaw)
            if (JSON.stringify(stripped) !== JSON.stringify(testCase.expected_ast)) {
                throw new Error(
                    formatAstMismatchMessage(testCase.name, testCase.input, testCase.expected_ast, stripped),
                )
            }
        })
    })
})

describe('Parser Hyphen Keys Tests', () => {
    it('should parse unquoted keys with hyphens correctly', () => {
        // Test simple hyphenated key
        const result1 = parse('user-id = 123')
        expect(result1.errno).toBe(0)
        expect(result1.root.left.expression.key.segments).toEqual(['user-id'])
        expect(result1.root.left.expression.value).toBe(123)

        // Test multi-segment key with hyphens
        const result2 = parse('data.user-identifier = "john-doe"')
        expect(result2.errno).toBe(0)
        expect(result2.root.left.expression.key.segments).toEqual(['data', 'user-identifier'])
        expect(result2.root.left.expression.value).toBe('john-doe')
    })
})
