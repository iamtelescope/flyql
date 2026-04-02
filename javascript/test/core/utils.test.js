import { describe, it, expect } from 'vitest'
import { isNumeric, tryConvertToNumber } from '../../src/index.js'
import { ValueType } from '../../src/types.js'

describe('isNumeric', () => {
    it('should identify numeric strings', () => {
        expect(isNumeric('123')).toBe(true)
        expect(isNumeric('12.34')).toBe(true)
        expect(isNumeric('-5')).toBe(true)
        expect(isNumeric('0')).toBe(true)
        expect(isNumeric('0.0')).toBe(true)
    })

    it('should reject non-numeric strings', () => {
        expect(isNumeric('hello')).toBe(false)
        expect(isNumeric('')).toBe(false)
        expect(isNumeric('12abc')).toBe(false)
        expect(isNumeric('abc12')).toBe(false)
    })

    it('should reject non-string types', () => {
        expect(isNumeric(123)).toBe(false)
        expect(isNumeric(null)).toBe(false)
        expect(isNumeric(undefined)).toBe(false)
        expect(isNumeric([])).toBe(false)
        expect(isNumeric({})).toBe(false)
    })
})

describe('tryConvertToNumber', () => {
    it('should convert integer strings to integers with INTEGER type', () => {
        expect(tryConvertToNumber('123')).toEqual([123, ValueType.INTEGER])
        expect(tryConvertToNumber('-5')).toEqual([-5, ValueType.INTEGER])
        expect(tryConvertToNumber('0')).toEqual([0, ValueType.INTEGER])
    })

    it('should convert float strings to floats with FLOAT type', () => {
        expect(tryConvertToNumber('12.34')).toEqual([12.34, ValueType.FLOAT])
    })

    it('should keep non-numeric strings as strings with STRING type', () => {
        expect(tryConvertToNumber('hello')).toEqual(['hello', ValueType.STRING])
        expect(tryConvertToNumber('abc123')).toEqual(['abc123', ValueType.STRING])
    })

    it('should handle empty string with STRING type', () => {
        expect(tryConvertToNumber('')).toEqual(['', ValueType.STRING])
    })

    it('should return non-strings with null type', () => {
        expect(tryConvertToNumber(123)).toEqual([123, null])
        expect(tryConvertToNumber(null)).toEqual([null, null])
        expect(tryConvertToNumber(undefined)).toEqual([undefined, null])
    })

    it('should detect BigInt for values exceeding MAX_SAFE_INTEGER', () => {
        const [value, type] = tryConvertToNumber('9007199254740992')
        expect(type).toBe(ValueType.BIGINT)
        expect(typeof value).toBe('bigint')
    })
})
