import { LiteralKind } from '../literal/literal_kind.js'
import { Type } from '../flyql_type.js'
import { ColumnSchema } from './column.js'
import { Range } from './range.js'
import { defaultRegistry } from '../transformers/registry.js'

export const CODE_UNKNOWN_COLUMN = 'unknown_column'
export const CODE_UNKNOWN_TRANSFORMER = 'unknown_transformer'
export const CODE_ARG_COUNT = 'arg_count'
export const CODE_ARG_TYPE = 'arg_type'
export const CODE_CHAIN_TYPE = 'chain_type'
export const CODE_INVALID_AST = 'invalid_ast'
export const CODE_UNKNOWN_COLUMN_VALUE = 'unknown_column_value'
export const CODE_INVALID_COLUMN_VALUE = 'invalid_column_value'

const VALID_COLUMN_NAME_RE = /^[a-zA-Z0-9_.:/@|-]+$/

export class Diagnostic {
    constructor(range, message, severity, code) {
        this.range = range
        this.message = message
        this.severity = severity
        this.code = code
    }
}

export function diagnose(ast, schema, registry = null) {
    if (ast == null) return []
    if (registry == null) registry = defaultRegistry()

    return _walk(ast, schema, registry)
}

function _walk(node, schema, registry) {
    if (node.expression != null) {
        return _diagnoseExpression(node.expression, schema, registry)
    }
    const diags = []
    if (node.left != null) {
        diags.push(..._walk(node.left, schema, registry))
    }
    if (node.right != null) {
        diags.push(..._walk(node.right, schema, registry))
    }
    return diags
}

export function jsToFlyQLType(v) {
    if (typeof v === 'boolean') return Type.Bool
    if (typeof v === 'number' && Number.isInteger(v)) return Type.Int
    if (typeof v === 'number') return Type.Float
    if (typeof v === 'string') return Type.String
    return null
}

function _diagnoseExpression(expression, schema, registry) {
    const diags = []

    if (!expression.key.segments || !expression.key.segmentRanges || expression.key.segmentRanges.length < 1) {
        diags.push(
            new Diagnostic(
                new Range(0, 0),
                'AST missing source ranges \u2014 diagnose() requires a parser-produced AST',
                'error',
                CODE_INVALID_AST,
            ),
        )
        return diags
    }

    let col = schema.get(expression.key.segments[0])
    let prevOutputType

    if (col == null) {
        diags.push(
            new Diagnostic(
                expression.key.segmentRanges[0],
                `column '${expression.key.segments[0]}' is not defined`,
                'error',
                CODE_UNKNOWN_COLUMN,
            ),
        )
        prevOutputType = null
    } else {
        for (let i = 1; i < expression.key.segments.length; i++) {
            const seg = expression.key.segments[i]
            if (seg === '') break
            if (col.children == null) {
                diags.push(
                    new Diagnostic(
                        expression.key.segmentRanges[i],
                        `column '${seg}' is not defined`,
                        'error',
                        CODE_UNKNOWN_COLUMN,
                    ),
                )
                col = null
                break
            }
            const child = col.children[seg.toLowerCase()] || null
            if (child == null) {
                diags.push(
                    new Diagnostic(
                        expression.key.segmentRanges[i],
                        `column '${seg}' is not defined`,
                        'error',
                        CODE_UNKNOWN_COLUMN,
                    ),
                )
                col = null
                break
            }
            col = child
        }
        prevOutputType = col != null && col.type && col.type !== Type.Unknown ? col.type : null
    }

    for (const transformer of expression.key.transformers) {
        const t = registry.get(transformer.name)

        if (t == null) {
            diags.push(
                new Diagnostic(
                    transformer.nameRange,
                    `unknown transformer: '${transformer.name}'`,
                    'error',
                    CODE_UNKNOWN_TRANSFORMER,
                ),
            )
            prevOutputType = null
            continue
        }

        const requiredCount = t.argSchema.filter((s) => s.required).length
        const maxCount = t.argSchema.length
        const got = transformer.arguments.length
        if (got < requiredCount || got > maxCount) {
            let expectStr
            if (requiredCount === maxCount) {
                expectStr = `${requiredCount} arguments`
            } else {
                expectStr = `${requiredCount}..${maxCount} arguments`
            }
            diags.push(
                new Diagnostic(
                    transformer.range,
                    `${transformer.name} expects ${expectStr}, got ${got}`,
                    'error',
                    CODE_ARG_COUNT,
                ),
            )
        }

        for (let j = 0; j < transformer.arguments.length; j++) {
            if (j >= t.argSchema.length) break
            const expected = t.argSchema[j].type
            const actual = jsToFlyQLType(transformer.arguments[j])
            if (actual == null) continue
            if (actual === expected) continue
            if (actual === Type.Int && expected === Type.Float) continue
            diags.push(
                new Diagnostic(
                    transformer.argumentRanges[j],
                    `argument ${j + 1} of ${transformer.name}: expected ${expected}, got ${actual}`,
                    'error',
                    CODE_ARG_TYPE,
                ),
            )
        }

        if (prevOutputType != null && prevOutputType !== t.inputType) {
            diags.push(
                new Diagnostic(
                    transformer.nameRange,
                    `${transformer.name} expects ${t.inputType} input, got ${prevOutputType}`,
                    'error',
                    CODE_CHAIN_TYPE,
                ),
            )
        }

        prevOutputType = t.outputType
    }

    if (
        expression.valueType === LiteralKind.COLUMN &&
        typeof expression.value === 'string' &&
        expression.value !== ''
    ) {
        if (!VALID_COLUMN_NAME_RE.test(expression.value)) {
            if (expression.valueRange != null) {
                diags.push(
                    new Diagnostic(
                        expression.valueRange,
                        `invalid character in column name '${expression.value}'`,
                        'error',
                        CODE_INVALID_COLUMN_VALUE,
                    ),
                )
            }
        } else if (schema.resolve(expression.value.split('.')) == null) {
            if (expression.valueRange != null) {
                diags.push(
                    new Diagnostic(
                        expression.valueRange,
                        `column '${expression.value}' is not defined`,
                        'error',
                        CODE_UNKNOWN_COLUMN_VALUE,
                    ),
                )
            }
        }
    }

    if (expression.valuesTypes != null) {
        for (let i = 0; i < expression.valuesTypes.length; i++) {
            if (expression.valuesTypes[i] === LiteralKind.COLUMN && typeof expression.values[i] === 'string') {
                const val = expression.values[i]
                if (!VALID_COLUMN_NAME_RE.test(val)) {
                    if (expression.valueRanges != null && i < expression.valueRanges.length) {
                        diags.push(
                            new Diagnostic(
                                expression.valueRanges[i],
                                `invalid character in column name '${val}'`,
                                'error',
                                CODE_INVALID_COLUMN_VALUE,
                            ),
                        )
                    }
                } else if (schema.resolve(val.split('.')) == null) {
                    if (expression.valueRanges != null && i < expression.valueRanges.length) {
                        diags.push(
                            new Diagnostic(
                                expression.valueRanges[i],
                                `column '${val}' is not defined`,
                                'error',
                                CODE_UNKNOWN_COLUMN_VALUE,
                            ),
                        )
                    }
                }
            }
        }
    }

    return diags
}
