/**
 * flyql.literal.LiteralKind — parser AST literal-kind vocabulary.
 *
 * Records what kind of literal a parsed value represents (number, null,
 * column reference, function call, parameter, etc.). Unrelated to
 * flyql.Type which is the column/value semantic-type vocabulary; the two
 * were merged in name historically (both formerly called ValueType-ish)
 * but represent different concepts. See unify-column-type-system spec,
 * Tech Decision #2.
 */
export const LiteralKind = Object.freeze({
    INTEGER: 'integer',
    BIGINT: 'bigint',
    FLOAT: 'float',
    STRING: 'string',
    BOOLEAN: 'boolean',
    NULL: 'null',
    ARRAY: 'array',
    COLUMN: 'column',
    FUNCTION: 'function',
    PARAMETER: 'parameter',
})
