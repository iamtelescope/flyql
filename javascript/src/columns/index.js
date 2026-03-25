import { Parser } from './parser.js'
import { ParsedColumn } from './column.js'
import { ParserError } from './exceptions.js'
import { parseKey } from '../core/key.js'
import { CharType, tokenTypes, MODIFIER_INFO } from './constants.js'
import { generateMonacoTokens, getMonacoTokenProvider } from './monaco.js'
import { validateColumns, validateColumnNames } from './validation.js'

export function parse(text, capabilities) {
    const parser = new Parser(capabilities)
    parser.parse(text)
    const columns = []
    for (const columnDict of parser.columns) {
        const key = parseKey(columnDict.name)
        const alias = columnDict.alias
        columns.push(new ParsedColumn(columnDict.name, columnDict.modifiers, alias, key, alias || ''))
    }
    return columns
}

export function parseToDicts(text, capabilities) {
    return parse(text, capabilities).map((col) => col.asDict())
}

export function parseToJson(text, capabilities) {
    return JSON.stringify(parseToDicts(text, capabilities))
}

export {
    Parser,
    ParsedColumn,
    ParserError,
    CharType,
    tokenTypes,
    generateMonacoTokens,
    getMonacoTokenProvider,
    MODIFIER_INFO,
    validateColumns,
    validateColumnNames,
}
