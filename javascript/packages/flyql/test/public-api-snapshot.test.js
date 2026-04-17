// Snapshot test: the top-level barrel exports exactly this set of names.
//
// This freezes the package's public API surface. Any PR that adds, removes,
// or renames a top-level export must update this inline array — making the
// public-API change explicit and reviewable.
//
// Background: shared-error-registry migration (PR 3) shuffles some export
// sources from constants.js to errors_generated.js. The surface must remain
// byte-identical across that change; this test catches accidental drift.

import { describe, expect, it } from 'vitest'
import * as barrel from '../src/index.js'

const EXPECTED_EXPORTS = [
    'ArgSpec',
    'BoolOperator',
    'CODE_ARG_COUNT',
    'CODE_ARG_TYPE',
    'CODE_CHAIN_TYPE',
    'CODE_INVALID_AST',
    'CODE_UNKNOWN_COLUMN',
    'CODE_UNKNOWN_COLUMN_VALUE',
    'CODE_UNKNOWN_TRANSFORMER',
    'Char',
    'CharType',
    'Column',
    'ColumnSchema',
    'Diagnostic',
    'Duration',
    'ERR_MAX_DEPTH_EXCEEDED',
    'Expression',
    'FlyqlError',
    'FunctionCall',
    'Key',
    'KeyParser',
    'LenTransformer',
    'LiteralKind',
    'LowerTransformer',
    'Node',
    'Operator',
    'Parameter',
    'ParseResult',
    'Parser',
    'ParserError',
    'Range',
    'Renderer',
    'RendererRegistry',
    'SplitTransformer',
    'State',
    'Transformer',
    'TransformerRegistry',
    'Type',
    'UpperTransformer',
    'VALID_BOOL_OPERATORS',
    'VALID_BOOL_OPERATORS_CHARS',
    'VALID_KEY_VALUE_OPERATORS',
    'bindParams',
    'convertUnquotedValue',
    'defaultRegistry',
    'defaultRendererRegistry',
    'diagnose',
    'isNumeric',
    'parse',
    'parseFlyQLType',
    'parseKey',
    'tokenize',
]

describe('public API snapshot', () => {
    it('top-level barrel exports exactly the expected set', () => {
        const actual = Object.keys(barrel).sort()
        expect(actual).toEqual(EXPECTED_EXPORTS)
    })
})
