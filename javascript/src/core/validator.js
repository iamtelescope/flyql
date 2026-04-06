import { ValueType } from '../types.js'
import { normalizedToTransformerType } from './column.js'
import { Range } from './range.js'
import { TransformerType } from '../transformers/base.js'
import { defaultRegistry } from '../transformers/registry.js'

export const CODE_UNKNOWN_COLUMN = 'unknown_column'
export const CODE_UNKNOWN_TRANSFORMER = 'unknown_transformer'
export const CODE_ARG_COUNT = 'arg_count'
export const CODE_ARG_TYPE = 'arg_type'
export const CODE_CHAIN_TYPE = 'chain_type'
export const CODE_INVALID_AST = 'invalid_ast'
export const CODE_UNKNOWN_COLUMN_VALUE = 'unknown_column_value'

export class Diagnostic {
    constructor(range, message, severity, code) {
        this.range = range
        this.message = message
        this.severity = severity
        this.code = code
    }
}

export function diagnose(ast, columns, registry = null) {
    if (ast == null) return []
    if (registry == null) registry = defaultRegistry()

    const columnsByName = {}
    for (let i = columns.length - 1; i >= 0; i--) {
        columnsByName[columns[i].matchName.toLowerCase()] = columns[i]
    }

    return _walk(ast, columnsByName, registry)
}

function _walk(node, columnsByName, registry) {
    if (node.expression != null) {
        return _diagnoseExpression(node.expression, columnsByName, registry)
    }
    const diags = []
    if (node.left != null) {
        diags.push(..._walk(node.left, columnsByName, registry))
    }
    if (node.right != null) {
        diags.push(..._walk(node.right, columnsByName, registry))
    }
    return diags
}

function _jsToTransformerType(v) {
    if (typeof v === 'boolean') return TransformerType.BOOL
    if (typeof v === 'number' && Number.isInteger(v)) return TransformerType.INT
    if (typeof v === 'number') return TransformerType.FLOAT
    if (typeof v === 'string') return TransformerType.STRING
    return null
}

function _diagnoseExpression(expression, columnsByName, registry) {
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

    const baseName = expression.key.segments[0]
    const column = columnsByName[baseName.toLowerCase()] || null

    let prevOutputType
    if (column == null) {
        diags.push(
            new Diagnostic(
                expression.key.segmentRanges[0],
                `column '${baseName}' is not defined`,
                'error',
                CODE_UNKNOWN_COLUMN,
            ),
        )
        prevOutputType = null
    } else {
        prevOutputType = normalizedToTransformerType(column.normalizedType)
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

        // Arity check
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

        // Per-argument type check
        for (let j = 0; j < transformer.arguments.length; j++) {
            if (j >= t.argSchema.length) break
            const expected = t.argSchema[j].type
            const actual = _jsToTransformerType(transformer.arguments[j])
            if (actual == null) continue
            if (actual === expected) continue
            // int widens to float
            if (actual === TransformerType.INT && expected === TransformerType.FLOAT) continue
            diags.push(
                new Diagnostic(
                    transformer.argumentRanges[j],
                    `argument ${j + 1} of ${transformer.name}: expected ${expected}, got ${actual}`,
                    'error',
                    CODE_ARG_TYPE,
                ),
            )
        }

        // Chain type check
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

    // COLUMN value validation
    if (expression.valueType === ValueType.COLUMN && typeof expression.value === 'string' && expression.value !== '') {
        if (columnsByName[expression.value.toLowerCase()] == null) {
            if (expression.valueRange != null) {
                diags.push(
                    new Diagnostic(
                        expression.valueRange,
                        `column '${expression.value}' is not defined`,
                        'warning',
                        CODE_UNKNOWN_COLUMN_VALUE,
                    ),
                )
            }
        }
    }

    // IN-list COLUMN value validation
    if (expression.valuesTypes != null) {
        for (let i = 0; i < expression.valuesTypes.length; i++) {
            if (expression.valuesTypes[i] === ValueType.COLUMN && typeof expression.values[i] === 'string') {
                if (columnsByName[expression.values[i].toLowerCase()] == null) {
                    if (expression.valueRanges != null && i < expression.valueRanges.length) {
                        diags.push(
                            new Diagnostic(
                                expression.valueRanges[i],
                                `column '${expression.values[i]}' is not defined`,
                                'warning',
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
