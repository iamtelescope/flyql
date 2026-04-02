import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { match } from '../src/matcher/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const testDataDir = path.join(__dirname, '..', '..', 'tests-data', 'e2e')
const REPORT_PATH = process.env.E2E_REPORT_JSON || ''

const reportResults = []

function loadJSON(filepath) {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'))
}

const rows = loadJSON(path.join(testDataDir, 'rows.json')).rows

function loadTestCases() {
    const data = loadJSON(path.join(testDataDir, 'test_cases.json'))
    // Use all test cases — matcher is database-agnostic
    // Skip tests that reference columns not in the in-memory data (tags, metadata, meta_json)
    return data.tests.filter((tc) =>
        !tc.flyql.includes('tags.') &&
        !tc.flyql.includes('metadata.') &&
        !tc.flyql.includes('meta_json.') &&
        !tc.flyql.includes("hello*'") &&
        !tc.flyql.includes("'*@") &&
        !tc.flyql.includes('created_at<=')
    )
}

describe('Matcher E2E', () => {
    afterAll(() => {
        if (REPORT_PATH && reportResults.length > 0) {
            try {
                let existing = { language: 'javascript', results: [] }
                if (fs.existsSync(REPORT_PATH)) {
                    try { existing = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf-8')) } catch {}
                }
                existing.results = [...(existing.results || []), ...reportResults]
                fs.writeFileSync(REPORT_PATH, JSON.stringify(existing, null, 2))
            } catch (e) {
                console.error(`warn: could not write e2e report: ${e.message}`)
            }
        }
    })

    describe('WHERE parity with databases', () => {
        it.each(
            loadTestCases().map((tc) => [tc.name, tc.flyql, tc.expected_ids]),
        )('%s: %s', (name, flyql, expectedIds) => {
            const result = {
                kind: 'where',
                database: 'matcher',
                name,
                flyql,
                sql: '(in-memory)',
                expected_ids: expectedIds,
                returned_ids: [],
                passed: false,
                error: '',
            }

            try {
                const matchedIds = rows
                    .filter((row) => match(flyql, row))
                    .map((row) => row.id)

                result.returned_ids = matchedIds
                result.passed = JSON.stringify([...matchedIds].sort()) === JSON.stringify([...expectedIds].sort())
                reportResults.push(result)
                expect(matchedIds.sort()).toEqual([...expectedIds].sort())
            } catch (e) {
                result.error = e.message
                reportResults.push(result)
                throw e
            }
        })
    })
})
