import { describe, it, expect } from 'vitest'
import { Expression, FlyqlError, VALID_KEY_VALUE_OPERATORS } from '../../src/index.js'

describe('Expression', () => {
    it('should create valid expressions with all operators', () => {
        VALID_KEY_VALUE_OPERATORS.forEach(operator => {
            const expr = new Expression('key', operator, 'value', null)
            expect(expr.toString()).toBe(`key${operator}value`)
        })
    })

    it('should throw error for invalid operator', () => {
        expect(() => new Expression('key', 'invalid_operator', 'value', null))
            .toThrow(FlyqlError)
    })

    it('should throw error for empty key', () => {
        expect(() => new Expression('', '=', 'value', null))
            .toThrow(FlyqlError)
    })

    it('should allow empty value', () => {
        const expr = new Expression('key', '=', '', null)
        expect(expr.value).toBe('')
    })

    it('should handle string values explicitly', () => {
        const expr = new Expression('name', '=', 'test', true)
        expect(expr.value).toBe('test')
        expect(typeof expr.value).toBe('string')
    })

    it('should convert numeric values when valueIsString is false', () => {
        const expr1 = new Expression('count', '=', '123', false)
        expect(expr1.value).toBe(123)
        expect(typeof expr1.value).toBe('number')

        const expr2 = new Expression('price', '=', '12.34', false)
        expect(expr2.value).toBe(12.34)
        expect(typeof expr2.value).toBe('number')
    })

    it('should keep non-numeric values as strings when valueIsString is false', () => {
        const expr = new Expression('name', '=', 'abc', false)
        expect(expr.value).toBe('abc')
        expect(typeof expr.value).toBe('string')
    })

    it('should auto-convert when valueIsString is null', () => {
        const expr1 = new Expression('count', '=', '123', null)
        expect(expr1.value).toBe(123)
        expect(typeof expr1.value).toBe('number')

        const expr2 = new Expression('name', '=', 'abc', null)
        expect(expr2.value).toBe('abc')
        expect(typeof expr2.value).toBe('string')
    })
})