import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { Key, KeyParser, parseKey, FlyqlError } from '../../src/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function loadTestData() {
    const testDataPath = resolve(__dirname, '../../../tests-data/core/key.json')
    return JSON.parse(readFileSync(testDataPath, 'utf8'))
}

describe('Key', () => {
    it('should create key with single segment', () => {
        const key = new Key(['test'])
        expect(key.segments).toEqual(['test'])
        expect(key.isSegmented).toBe(false)
        expect(key.raw).toBe('test')
    })

    it('should create key with multiple segments', () => {
        const key = new Key(['key', 'some', 'path'])
        expect(key.segments).toEqual(['key', 'some', 'path'])
        expect(key.isSegmented).toBe(true)
        expect(key.raw).toBe('key:some:path')
    })

    it('should create key with custom raw', () => {
        const key = new Key(['key', 'some:path'], "key:'some:path'")
        expect(key.segments).toEqual(['key', 'some:path'])
        expect(key.isSegmented).toBe(true)
        expect(key.raw).toBe("key:'some:path'")
    })

    it('should create empty key', () => {
        const key = new Key([])
        expect(key.segments).toEqual([])
        expect(key.isSegmented).toBe(false)
        expect(key.raw).toBe('')
    })
})

describe('parseKey from JSON test data', () => {
    const testData = loadTestData()

    describe('success cases', () => {
        const successTests = testData.tests.filter((test) => test.expected_result === 'success')

        successTests.forEach((testCase) => {
            it(`should parse ${testCase.name}`, () => {
                const key = parseKey(testCase.input)
                const expected = testCase.expected_key

                expect(key.segments).toEqual(expected.segments)
                expect(key.isSegmented).toBe(expected.is_segmented)
                expect(key.raw).toBe(expected.raw)
            })
        })
    })

    describe('error cases', () => {
        const errorTests = testData.tests.filter((test) => test.expected_result === 'error')

        errorTests.forEach((testCase) => {
            it(`should throw error for ${testCase.name}`, () => {
                expect(() => parseKey(testCase.input)).toThrow(new RegExp(testCase.expected_error_message))
            })
        })
    })
})

describe('KeyParser individual tests', () => {
    const testData = loadTestData()

    it('should parse empty string', () => {
        const testCase = testData.tests.find((t) => t.name === 'empty_string')
        const key = parseKey(testCase.input)
        const expected = testCase.expected_key
        expect(key.segments).toEqual(expected.segments)
        expect(key.isSegmented).toBe(expected.is_segmented)
        expect(key.raw).toBe(expected.raw)
    })

    it('should parse single segment', () => {
        const testCase = testData.tests.find((t) => t.name === 'single_segment')
        const key = parseKey(testCase.input)
        const expected = testCase.expected_key
        expect(key.segments).toEqual(expected.segments)
        expect(key.isSegmented).toBe(expected.is_segmented)
        expect(key.raw).toBe(expected.raw)
    })

    it('should parse multiple segments', () => {
        const testCase = testData.tests.find((t) => t.name === 'multiple_segments')
        const key = parseKey(testCase.input)
        const expected = testCase.expected_key
        expect(key.segments).toEqual(expected.segments)
        expect(key.isSegmented).toBe(expected.is_segmented)
        expect(key.raw).toBe(expected.raw)
    })

    it('should parse quoted segment simple', () => {
        const testCase = testData.tests.find((t) => t.name === 'quoted_segment_simple')
        const key = parseKey(testCase.input)
        const expected = testCase.expected_key
        expect(key.segments).toEqual(expected.segments)
        expect(key.isSegmented).toBe(expected.is_segmented)
        expect(key.raw).toBe(expected.raw)
    })

    it('should parse double quoted segments', () => {
        const testCase = testData.tests.find((t) => t.name === 'double_quoted_segment_simple')
        const key = parseKey(testCase.input)
        const expected = testCase.expected_key
        expect(key.segments).toEqual(expected.segments)
        expect(key.isSegmented).toBe(expected.is_segmented)
        expect(key.raw).toBe(expected.raw)
    })

    it('should parse JSON key with quotes', () => {
        const testCase = testData.tests.find((t) => t.name === 'json_key_with_quotes')
        const key = parseKey(testCase.input)
        const expected = testCase.expected_key
        expect(key.segments).toEqual(expected.segments)
        expect(key.isSegmented).toBe(expected.is_segmented)
        expect(key.raw).toBe(expected.raw)
    })

    it('should parse JSON key with quotes and colons', () => {
        const testCase = testData.tests.find((t) => t.name === 'json_key_with_quotes_and_colons')
        const key = parseKey(testCase.input)
        const expected = testCase.expected_key
        expect(key.segments).toEqual(expected.segments)
        expect(key.isSegmented).toBe(expected.is_segmented)
        expect(key.raw).toBe(expected.raw)
    })

    it('should throw error for unterminated quote', () => {
        const testCase = testData.tests.find((t) => t.name === 'unterminated_quote_error')
        expect(() => parseKey(testCase.input)).toThrow(new RegExp(testCase.expected_error_message))
    })

    it('should throw error for incomplete escape', () => {
        const testCase = testData.tests.find((t) => t.name === 'incomplete_escape_error')
        expect(() => parseKey(testCase.input)).toThrow(new RegExp(testCase.expected_error_message))
    })
})
