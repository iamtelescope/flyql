import { Parser } from './parser.js'
import { ParsedColumn } from './column.js'
import { ParserError } from './exceptions.js'
import { parseKey } from '../core/key.js'
import { CharType, tokenTypes } from './constants.js'
import { generateMonacoTokens, getMonacoTokenProvider } from './monaco.js'
import { validateColumns, validateColumnNames } from './validation.js'

export function parse(text) {
    const parser = new Parser()
    parser.parse(text)
    const columns = []
    for (const columnDict of parser.columns) {
        const key = parseKey(columnDict.name)
        columns.push(new ParsedColumn(columnDict.name, columnDict.modifiers, columnDict.alias, key))
    }
    return columns
}

export {
    Parser,
    ParsedColumn,
    ParserError,
    CharType,
    tokenTypes,
    generateMonacoTokens,
    getMonacoTokenProvider,
    validateColumns,
    validateColumnNames,
}
