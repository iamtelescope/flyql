import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export function loadTestData(filename) {
    const testDataPath = resolve(__dirname, '../../../tests-data/columns/parser', filename)
    return JSON.parse(readFileSync(testDataPath, 'utf8'))
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
