import { Parser } from './parser.js'
import { ParsedColumn } from './column.js'
import { ParserError } from './exceptions.js'
import { parseKey } from '../core/key.js'
import { CharType, tokenTypes, TRANSFORMER_INFO, TRANSFORMER_OPERATOR, COLUMNS_DELIMITER } from './constants.js'
import { State } from './state.js'
import { generateMonacoTokens, getMonacoTokenProvider } from './monaco.js'
import { validateColumns, validateColumnNames } from './validation.js'
import { diagnose } from './validator.js'

export function parse(text, capabilities) {
    const parser = new Parser(capabilities)
    parser.parse(text)
    const columns = []
    for (const columnDict of parser.columns) {
        const key = parseKey(columnDict.name)
        const alias = columnDict.alias
        const transformerRanges = columnDict.transformers.map((t) => ({
            nameRange: t.nameRange || null,
            argumentRanges: t.argumentRanges || [],
        }))
        columns.push(
            new ParsedColumn(columnDict.name, columnDict.transformers, alias, key, alias || '', {
                nameRange: columnDict.nameRange || null,
                transformerRanges,
            }),
        )
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
    State,
    tokenTypes,
    generateMonacoTokens,
    getMonacoTokenProvider,
    TRANSFORMER_INFO,
    TRANSFORMER_OPERATOR,
    COLUMNS_DELIMITER,
    validateColumns,
    validateColumnNames,
    diagnose,
}
