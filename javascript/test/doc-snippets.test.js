/**
 * Tests that run every doc snippet file and verify it executes without errors.
 *
 * Each snippet in javascript/snippets/ is the exact code shown in the docs.
 * If a test here fails, the corresponding doc example is broken.
 */

import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const snippetsDir = resolve(import.meta.dirname, '..', 'snippets')

function walk(dir) {
    const out = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) out.push(...walk(full))
        else if (entry.isFile() && entry.name.endsWith('.mjs')) out.push(full)
    }
    return out
}

const snippets = walk(snippetsDir).sort()

describe('doc snippets', () => {
    for (const file of snippets) {
        const rel = relative(snippetsDir, file)
        it(rel.replace('.mjs', ''), () => {
            const result = execFileSync('node', [file], {
                cwd: resolve(snippetsDir, '..'),
                timeout: 30000,
                encoding: 'utf-8',
            })
            expect(typeof result).toBe('string')
        })
    }
})
