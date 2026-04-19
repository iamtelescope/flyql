import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Parser, ParserError } from '../../src/index.js'
import { Range } from '../../src/core/range.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURES_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'tests-data', 'core', 'parser', 'positions')

const INDEX_RE = /^([^[\]]+)(?:\[(\d+)\])?$/

function snakeToCamel(s) {
    return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

function getByPath(root, pathStr) {
    let current = root
    const parts = pathStr.split('.')
    const start = parts[0] === 'root' ? 1 : 0
    for (let i = start; i < parts.length; i++) {
        const m = parts[i].match(INDEX_RE)
        if (!m) throw new Error(`invalid path segment: ${parts[i]}`)
        const name = snakeToCamel(m[1])
        const idx = m[2]
        if (current === null || current === undefined) {
            throw new Error(`null/undefined at segment ${parts[i]}`)
        }
        current = current[name]
        if (idx !== undefined) {
            current = current[parseInt(idx, 10)]
        }
    }
    return current
}

function loadFixtures() {
    const files = fs
        .readdirSync(FIXTURES_DIR)
        .filter((f) => f.endsWith('.json'))
        .sort()
    const cases = []
    for (const file of files) {
        const data = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf-8'))
        for (const tc of data.tests) {
            cases.push({ file, tc })
        }
    }
    return cases
}

describe('AST source positions', () => {
    for (const { file, tc } of loadFixtures()) {
        it(`${file}::${tc.name}`, () => {
            if (tc.expected_result === 'error') {
                let caught = null
                try {
                    const p = new Parser()
                    p.parse(tc.input)
                } catch (e) {
                    caught = e
                }
                expect(caught).toBeInstanceOf(ParserError)
                expect(caught.errno).toBe(tc.expected_error.errno)
                const want = tc.expected_error.range
                expect(caught.range).toEqual(new Range(want[0], want[1]))
                return
            }
            const p = new Parser()
            p.parse(tc.input)
            for (const [pathStr, expected] of Object.entries(tc.expected_ranges)) {
                const actual = getByPath(p.root, pathStr)
                expect(actual, `path ${pathStr}`).not.toBeNull()
                expect(actual, `path ${pathStr}`).toEqual(new Range(expected[0], expected[1]))
            }
        })
    }
})
