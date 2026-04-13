import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parse, bindParams } from '../src/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function loadBindTestData() {
    const p = path.join(__dirname, '..', '..', '..', '..', 'tests-data', 'core', 'bind', 'parameters.json')
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
}

function findFirstExpression(node) {
    if (node === null || node === undefined) return null
    if (node.expression !== null && node.expression !== undefined) return node.expression
    return findFirstExpression(node.left) || findFirstExpression(node.right)
}

const bindData = loadBindTestData()

describe('bind() — shared test data', () => {
    for (const tc of bindData.tests) {
        it(tc.name, () => {
            const parser = parse(tc.input)
            if (tc.expected_result === 'success') {
                bindParams(parser.root, tc.params)
                const expr = findFirstExpression(parser.root)
                expect(expr).not.toBeNull()
                expect(expr.value).toEqual(tc.expected_value)
                expect(expr.valueType).toBe(tc.expected_value_type)
            } else if (tc.expected_result === 'error') {
                expect(() => bindParams(parser.root, tc.params)).toThrow(tc.expected_error_contains)
            }
        })
    }
})

describe('bind() — additional cases', () => {
    it('multiple named', () => {
        const parser = parse('a=$x and b=$y')
        bindParams(parser.root, { x: 1, y: 'hello' })
        expect(parser.root.left.expression.value).toBe(1)
        expect(parser.root.right.expression.value).toBe('hello')
    })

    it('IN-list parameters', () => {
        const parser = parse('status in [$x, $y]')
        bindParams(parser.root, { x: 'a', y: 'b' })
        const expr = parser.root.left.expression
        expect(expr.values).toEqual(['a', 'b'])
    })

    it('function parameter (ago)', () => {
        const parser = parse('created=ago($d)')
        bindParams(parser.root, { d: '5m' })
        const fc = parser.root.left.expression.value
        expect(fc.parameterArgs).toEqual([])
        expect(fc.durationArgs.length).toBe(1)
        expect(fc.durationArgs[0].value).toBe(5)
        expect(fc.durationArgs[0].unit).toBe('m')
    })
})
