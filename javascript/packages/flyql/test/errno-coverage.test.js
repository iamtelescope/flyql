import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Parser as CoreParser, ParserError as CoreParserError } from '../src/index.js'
import { parse as columnsParse, ParserError as ColumnsParserError } from '../src/columns/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..')
const REGISTRY_PATH = path.join(REPO_ROOT, 'errors', 'registry.json')
const CORE_FIXTURE_PATH = path.join(REPO_ROOT, 'tests-data', 'core', 'parser', 'errno_coverage.json')
const COLUMNS_FIXTURE_PATH = path.join(REPO_ROOT, 'tests-data', 'core', 'parser', 'columns_errno_coverage.json')

function loadJson(p) {
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
}

function resolveInput(entry) {
    if ('input' in entry) {
        return entry.input
    }
    const c = entry.input_construction
    if (c.type === 'nested_parens') {
        return '('.repeat(c.depth) + 'a=1' + ')'.repeat(c.depth)
    }
    throw new Error(`unknown input_construction type: ${c.type}`)
}

function registryNames(category) {
    const reg = loadJson(REGISTRY_PATH)
    return Object.values(reg.categories[category].errors).map((e) => e.name)
}

const CORE_FIXTURE = loadJson(CORE_FIXTURE_PATH)
const COLUMNS_FIXTURE = loadJson(COLUMNS_FIXTURE_PATH)

describe('Core errno coverage fixture', () => {
    for (const entry of CORE_FIXTURE.tests) {
        it(`triggers ${entry.name}`, () => {
            const parser = new CoreParser()
            const input = resolveInput(entry)
            expect(() => parser.parse(input)).toThrow(CoreParserError)
            let thrown
            try {
                parser.parse(input)
            } catch (err) {
                thrown = err
            }
            const expected = entry.expected_error
            if ('errno' in expected) {
                expect(thrown.errno).toBe(expected.errno)
            }
            if ('errno_options' in expected) {
                expect(expected.errno_options).toContain(thrown.errno)
            }
            const mc = expected.message_contains || ''
            if (mc) {
                expect(parser.errorText).toContain(mc)
            }
        })
    }
})

describe('Columns errno coverage fixture', () => {
    for (const entry of COLUMNS_FIXTURE.tests) {
        it(`triggers ${entry.name}`, () => {
            const caps = entry.capabilities || {}
            const input = resolveInput(entry)
            let thrown
            try {
                columnsParse(input, caps)
            } catch (err) {
                thrown = err
            }
            expect(thrown).toBeInstanceOf(ColumnsParserError)
            const expected = entry.expected_error
            if ('errno' in expected) {
                expect(thrown.errno).toBe(expected.errno)
            }
            if ('errno_options' in expected) {
                expect(expected.errno_options).toContain(thrown.errno)
            }
            const mc = expected.message_contains || ''
            if (mc) {
                expect(thrown.message).toContain(mc)
            }
        })
    }
})

describe('Registry name coverage', () => {
    it('core_parser registry names are all covered (fixture or known-unreachable)', () => {
        const fixtureNames = new Set(CORE_FIXTURE.tests.map((t) => t.name))
        const unreachable = new Set(CORE_FIXTURE.known_unreachable_codes || [])
        const registry = new Set(registryNames('core_parser'))
        const missing = [...registry].filter((n) => !fixtureNames.has(n) && !unreachable.has(n))
        expect(missing).toEqual([])
        const unknownUnreachable = [...unreachable].filter((n) => !registry.has(n))
        expect(unknownUnreachable).toEqual([])
    })

    it('columns_parser registry names are all covered (fixture or known-unreachable)', () => {
        const fixtureNames = new Set(COLUMNS_FIXTURE.tests.map((t) => t.name))
        const unreachable = new Set(COLUMNS_FIXTURE.known_unreachable_codes || [])
        const registry = new Set(registryNames('columns_parser'))
        const missing = [...registry].filter((n) => !fixtureNames.has(n) && !unreachable.has(n))
        expect(missing).toEqual([])
        const unknownUnreachable = [...unreachable].filter((n) => !registry.has(n))
        expect(unknownUnreachable).toEqual([])
    })
})
