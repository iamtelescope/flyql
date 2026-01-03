import { Parser } from './parser.js'
import { ParsedColumn } from './column.js'
import { ParserError } from './exceptions.js'
import { parseKey } from '../core/key.js'

/**
 * Parse columns string and return list of ParsedColumn objects.
 *
 * @param {string} text - Columns definition string (e.g., "message, status|upper as code")
 * @returns {ParsedColumn[]} List of ParsedColumn objects with parsed path segments
 * @throws {ParserError} If parsing fails
 *
 * @example
 * const columns = parse("message")
 * const columns = parse("message, status, user_id")
 * const columns = parse("message|chars(25) as msg")
 * const columns = parse("metadata.labels.tier|upper")
 * const columns = parse("data.'key.with.dots'.nested")
 */
export function parse(text) {
    const parser = new Parser()
    parser.parse(text)
    const columns = []
    for (const columnDict of parser.columns) {
        // Parse the column name as a path with segments
        const key = parseKey(columnDict.name)
        columns.push(new ParsedColumn(columnDict.name, columnDict.modifiers, columnDict.alias, key))
    }
    return columns
}

export { Parser, ParsedColumn, ParserError }
