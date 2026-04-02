import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { match } from '../../src/matcher/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const testDataDir = path.join(__dirname, '..', '..', '..', 'tests-data', 'matcher')

function loadFixture(filename) {
    return JSON.parse(fs.readFileSync(path.join(testDataDir, filename), 'utf-8'))
}

function runMatcherTestSuite(fixtureName) {
    const fixture = loadFixture(fixtureName)
    describe(fixture.test_suite, () => {
        for (const tc of fixture.tests) {
            it(tc.name, () => {
                const result = match(tc.query, tc.data)
                expect(result).toBe(tc.expected)
            })
        }
    })
}

describe('Matcher', () => {
    runMatcherTestSuite('truthy.json')
    runMatcherTestSuite('in.json')
    runMatcherTestSuite('not.json')
    runMatcherTestSuite('has.json')
    runMatcherTestSuite('transformers.json')
    runMatcherTestSuite('types.json')
    runMatcherTestSuite('regex.json')

    describe('basic matching', () => {
        it('matches string equals', () => {
            expect(match("name='alice'", { name: 'alice' })).toBe(true)
            expect(match("name='bob'", { name: 'alice' })).toBe(false)
        })

        it('matches number comparison', () => {
            expect(match('count>10', { count: 42 })).toBe(true)
            expect(match('count>10', { count: 5 })).toBe(false)
        })

        it('matches regex', () => {
            expect(match("message~'hello.*'", { message: 'hello world' })).toBe(true)
            expect(match("message~'hello.*'", { message: 'goodbye' })).toBe(false)
        })

        it('matches nested JSON path', () => {
            const data = { meta: '{"region":"us-east","location":{"city":"NYC"}}' }
            expect(match("meta.region='us-east'", data)).toBe(true)
            expect(match("meta.location.city='NYC'", data)).toBe(true)
            expect(match("meta.location.city='London'", data)).toBe(false)
        })

        it('matches boolean logic', () => {
            expect(match('a=1 and b=2', { a: 1, b: 2 })).toBe(true)
            expect(match('a=1 and b=2', { a: 1, b: 3 })).toBe(false)
            expect(match('a=1 or b=2', { a: 1, b: 3 })).toBe(true)
        })

        it('matches negation', () => {
            expect(match('not active', { active: '' })).toBe(true)
            expect(match('not active', { active: 'yes' })).toBe(false)
        })
    })
})
