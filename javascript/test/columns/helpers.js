import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export function loadTestData(filename) {
    const testDataPath = resolve(__dirname, '../../../tests-data/columns/parser', filename)
    const data = JSON.parse(readFileSync(testDataPath, 'utf8'))
    // Remap "transformers" key to "modifiers" for JS compatibility (JS rename happens in Story 1.3)
    if (data.tests) {
        for (const test of data.tests) {
            if (test.expected_columns) {
                for (let i = 0; i < test.expected_columns.length; i++) {
                    const col = test.expected_columns[i]
                    if ('transformers' in col && !('modifiers' in col)) {
                        // Rebuild with correct key order matching JS asDict()
                        test.expected_columns[i] = {
                            name: col.name,
                            modifiers: col.transformers,
                            alias: col.alias,
                            segments: col.segments,
                            is_segmented: col.is_segmented,
                            display_name: col.display_name,
                        }
                    }
                }
            }
        }
    }
    // Remap capabilities key
    if (data.default_capabilities && 'transformers' in data.default_capabilities) {
        data.default_capabilities.modifiers = data.default_capabilities.transformers
        delete data.default_capabilities.transformers
    }
    if (data.tests) {
        for (const test of data.tests) {
            if (test.capabilities && 'transformers' in test.capabilities) {
                test.capabilities.modifiers = test.capabilities.transformers
                delete test.capabilities.transformers
            }
        }
    }
    return data
}

export function columnToDict(column) {
    return column.asDict()
}

export function compareColumns(actual, expected) {
    if (actual.length !== expected.length) {
        return false
    }
    for (let i = 0; i < actual.length; i++) {
        const actualDict = columnToDict(actual[i])
        const expectedDict = expected[i]
        if (JSON.stringify(actualDict) !== JSON.stringify(expectedDict)) {
            return false
        }
    }
    return true
}

export function formatColumnMismatchMessage(testName, inputText, expected, actual) {
    const actualDicts = actual.map((col) => columnToDict(col))
    return `Column mismatch for test '${testName}':\nInput: ${inputText}\nExpected: ${JSON.stringify(
        expected,
        null,
        2,
    )}\nActual: ${JSON.stringify(actualDicts, null, 2)}`
}
