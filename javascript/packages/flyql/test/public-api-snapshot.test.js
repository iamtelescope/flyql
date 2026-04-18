// Surface contract: every public submodule's exports must match the canonical
// manifest at `errors/public_api_surface.json`. Any PR that adds, removes, or
// renames an export must update the JSON — making the public-API change
// explicit and reviewable across all three language implementations.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const surfacePath = path.resolve(__dirname, '..', '..', '..', '..', 'errors', 'public_api_surface.json')
const SURFACE = JSON.parse(fs.readFileSync(surfacePath, 'utf-8')).javascript

const SUBPATHS = [
    { name: 'flyql', mod: '../src/index.js' },
    { name: 'flyql/core', mod: '../src/core/index.js' },
    { name: 'flyql/matcher', mod: '../src/matcher/index.js' },
    { name: 'flyql/transformers', mod: '../src/transformers/index.js' },
    { name: 'flyql/generators/clickhouse', mod: '../src/generators/clickhouse/index.js' },
    { name: 'flyql/generators/postgresql', mod: '../src/generators/postgresql/index.js' },
    { name: 'flyql/generators/starrocks', mod: '../src/generators/starrocks/index.js' },
    { name: 'flyql/columns', mod: '../src/columns/index.js' },
    { name: 'flyql/renderers', mod: '../src/renderers/index.js' },
    { name: 'flyql/highlight', mod: '../src/highlight.js' },
    { name: 'flyql/tokenize', mod: '../src/tokenize.js' },
]

describe('public API surface', () => {
    for (const { name, mod } of SUBPATHS) {
        it(`${name} matches the surface contract`, async () => {
            const imported = await import(mod)
            const actual = Object.keys(imported).sort()
            const expected = [...SURFACE[name]].sort()
            expect(actual).toEqual(expected)
        })
    }
})
