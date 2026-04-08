/**
 * Tests that run every doc snippet file and verify it executes without errors.
 *
 * Each snippet in javascript/snippets/ is the exact code shown in the docs.
 * If a test here fails, the corresponding doc example is broken.
 */

import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const snippetsDir = resolve(import.meta.dirname, '..', 'snippets')
const snippets = readdirSync(snippetsDir)
    .filter((f) => f.endsWith('.mjs'))
    .sort()

describe('doc snippets', () => {
    for (const file of snippets) {
        it(file.replace('.mjs', ''), () => {
            const result = execFileSync('node', [join(snippetsDir, file)], {
                cwd: resolve(snippetsDir, '..'),
                timeout: 30000,
                encoding: 'utf-8',
            })
            expect(typeof result).toBe('string')
        })
    }
})
