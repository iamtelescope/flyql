// Parity test: generated JS constants match errors/registry.json.
// Runs under vitest. Loads registry at test time and asserts
// (a) every named constant exists in the generated module with the expected
// value, and (b) for non-dynamic entries, message maps match exactly.

import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'url'
import * as errorsGenerated from '../src/errors_generated.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const REGISTRY_PATH = path.join(__dirname, '..', '..', '..', '..', 'errors', 'registry.json')
const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'))

const MESSAGE_MAPS = {
    core_parser: errorsGenerated.CORE_PARSER_MESSAGES,
    columns_parser: errorsGenerated.COLUMNS_PARSER_MESSAGES,
    validator: errorsGenerated.VALIDATOR_MESSAGES,
    matcher: errorsGenerated.MATCHER_MESSAGES,
}

// Registry maps exclude matcher per Decision 2 (matcher uses FlyqlError, not Diagnostic/ParserError).
const REGISTRY_MAPS = {
    core_parser: errorsGenerated.CORE_PARSER_REGISTRY,
    columns_parser: errorsGenerated.COLUMNS_PARSER_REGISTRY,
    validator: errorsGenerated.VALIDATOR_REGISTRY,
}

function expectedKey(codeType, key) {
    return codeType === 'int' ? parseInt(key, 10) : key
}

for (const [category, cat] of Object.entries(registry.categories)) {
    describe(`error registry parity: ${category}`, () => {
        for (const [key, entry] of Object.entries(cat.errors)) {
            const expected = expectedKey(cat.code_type, key)
            const dynamic = Boolean(entry.dynamic_message)
            const description = entry.description || ''
            it(`${entry.name} exports correct value`, () => {
                expect(errorsGenerated).toHaveProperty(entry.name)
                expect(errorsGenerated[entry.name]).toBe(expected)
            })
            it(`${entry.name} has message in map`, () => {
                const mmap = MESSAGE_MAPS[category]
                expect(Object.prototype.hasOwnProperty.call(mmap, expected)).toBe(true)
                if (dynamic) {
                    expect(mmap[expected]).not.toBe('')
                } else {
                    expect(mmap[expected]).toBe(entry.message)
                }
            })
            if (REGISTRY_MAPS[category] !== undefined) {
                it(`${entry.name} has REGISTRY entry with full fields`, () => {
                    const rmap = REGISTRY_MAPS[category]
                    expect(Object.prototype.hasOwnProperty.call(rmap, expected)).toBe(true)
                    const e = rmap[expected]
                    expect(e).toBeInstanceOf(errorsGenerated.ErrorEntry)
                    expect(e.code).toBe(expected)
                    expect(e.name).toBe(entry.name)
                    // REGISTRY always carries the canonical message (no dynamic skip).
                    expect(e.message).toBe(entry.message)
                    expect(e.description).toBe(description)
                    expect(e.dynamicMessage).toBe(dynamic)
                })
            }
        }
    })
}
