import { describe, it, expect } from 'vitest'
import { Type, parseFlyQLType, typePermitsUnknownChildren } from '../src/flyql_type.js'
import { FlyqlError } from '../src/core/exceptions.js'

describe('parseFlyQLType', () => {
    it("rejects 'any' as a column type", () => {
        expect(() => parseFlyQLType('any')).toThrow(FlyqlError)
        try {
            parseFlyQLType('any')
        } catch (err) {
            expect(err.message).toContain('unknown flyql type')
        }
    })
})

describe('Type.Any', () => {
    it('is defined and equals "any"', () => {
        expect(Type.Any).toBe('any')
    })
})

describe('typePermitsUnknownChildren', () => {
    it('returns true for exactly JSON, JSONString, Map, Unknown', () => {
        const permissive = new Set([Type.JSON, Type.JSONString, Type.Map, Type.Unknown])
        for (const value of Object.values(Type)) {
            expect(typePermitsUnknownChildren(value)).toBe(permissive.has(value))
        }
    })
})
