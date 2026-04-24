import { LiteralKind } from '../literal/literal_kind.js'
import { Type } from '../flyql_type.js'
import { Range } from './range.js'
import { defaultRegistry } from '../transformers/registry.js'

import {
    CODE_ARG_COUNT,
    CODE_ARG_TYPE,
    CODE_CHAIN_TYPE,
    CODE_INVALID_AST,
    CODE_INVALID_COLUMN_VALUE,
    CODE_INVALID_DATETIME_LITERAL,
    CODE_RENDERER_ARG_COUNT,
    CODE_RENDERER_ARG_TYPE,
    CODE_UNKNOWN_COLUMN,
    CODE_UNKNOWN_COLUMN_VALUE,
    CODE_UNKNOWN_RENDERER,
    CODE_UNKNOWN_TRANSFORMER,
    CODE_UNKNOWN_TRANSFORMER_ARG_COLUMN,
    ErrorEntry,
    VALIDATOR_REGISTRY,
} from '../errors_generated.js'
export {
    CODE_ARG_COUNT,
    CODE_ARG_TYPE,
    CODE_CHAIN_TYPE,
    CODE_INVALID_AST,
    CODE_INVALID_COLUMN_VALUE,
    CODE_INVALID_DATETIME_LITERAL,
    CODE_RENDERER_ARG_COUNT,
    CODE_RENDERER_ARG_TYPE,
    CODE_UNKNOWN_COLUMN,
    CODE_UNKNOWN_COLUMN_VALUE,
    CODE_UNKNOWN_RENDERER,
    CODE_UNKNOWN_TRANSFORMER,
    CODE_UNKNOWN_TRANSFORMER_ARG_COLUMN,
    ErrorEntry,
}

const VALID_COLUMN_NAME_RE = /^[a-zA-Z0-9_.:/@|-]+$/

// Lenient iso8601 matcher — parity with matcher's _parseIsoStringToMs.
const ISO8601_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ISO8601_FULL_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/

/**
 * Shape AND calendar-validity check. Inputs that match the shape regex
 * but represent impossible calendar values (e.g. `'2026-13-45'`) are
 * rejected — the matcher will reject them at coerce time, so the
 * validator warns now.
 */
function isValidISO8601(s) {
    if (!s) return false
    if (ISO8601_DATE_RE.test(s)) {
        const y = parseInt(s.slice(0, 4), 10)
        const m = parseInt(s.slice(5, 7), 10)
        const d = parseInt(s.slice(8, 10), 10)
        return _isCalendarValid(y, m, d)
    }
    if (ISO8601_FULL_RE.test(s)) {
        const y = parseInt(s.slice(0, 4), 10)
        const m = parseInt(s.slice(5, 7), 10)
        const d = parseInt(s.slice(8, 10), 10)
        const hh = parseInt(s.slice(11, 13), 10)
        const mm = parseInt(s.slice(14, 16), 10)
        const ss = parseInt(s.slice(17, 19), 10)
        return _isCalendarValid(y, m, d) && hh < 24 && mm < 60 && ss < 60
    }
    return false
}

function _isCalendarValid(y, m, d) {
    if (m < 1 || m > 12 || d < 1 || d > 31) return false
    const probe = new Date(Date.UTC(y, m - 1, d))
    return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d
}

export class Diagnostic {
    constructor(range, message, severity, code, error = null) {
        this.range = range
        this.message = message
        this.severity = severity
        this.code = code
        this.error = error
    }
}

// Helper: looks up the registry entry and returns a Diagnostic. On miss
// (code not in registry), returns Diagnostic with error=null — no throw.
// Drift between code constants and registry is caught at build time by
// the parity test, not at runtime. Arg order matches Diagnostic constructor.
export function makeDiag(range, message, severity, code) {
    const entry = VALIDATOR_REGISTRY[code] ?? null
    return new Diagnostic(range, message, severity, code, entry)
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
            makeDiag(
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
            makeDiag(
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
                    makeDiag(
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
                    makeDiag(
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
                makeDiag(
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
                makeDiag(
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
                makeDiag(
                    transformer.argumentRanges[j],
                    `argument ${j + 1} of ${transformer.name}: expected ${expected}, got ${actual}`,
                    'error',
                    CODE_ARG_TYPE,
                ),
            )
        }

        if (prevOutputType != null && t.inputType !== Type.Any && prevOutputType !== t.inputType) {
            diags.push(
                makeDiag(
                    transformer.nameRange,
                    `${transformer.name} expects ${t.inputType} input, got ${prevOutputType}`,
                    'error',
                    CODE_CHAIN_TYPE,
                ),
            )
        }

        prevOutputType = t.outputType
    }

    const emittedRanges = new Set()
    const rangeKey = (r) => `${r.start}:${r.end}`

    if (
        expression.valueType === LiteralKind.COLUMN &&
        typeof expression.value === 'string' &&
        expression.value !== ''
    ) {
        if (!VALID_COLUMN_NAME_RE.test(expression.value)) {
            if (expression.valueRange != null) {
                diags.push(
                    makeDiag(
                        expression.valueRange,
                        `invalid character in column name '${expression.value}'`,
                        'error',
                        CODE_INVALID_COLUMN_VALUE,
                    ),
                )
                emittedRanges.add(rangeKey(expression.valueRange))
            }
        } else if (schema.resolve(expression.value.split('.')) == null) {
            if (expression.valueRange != null) {
                diags.push(
                    makeDiag(
                        expression.valueRange,
                        `column '${expression.value}' is not defined`,
                        'error',
                        CODE_UNKNOWN_COLUMN_VALUE,
                    ),
                )
                emittedRanges.add(rangeKey(expression.valueRange))
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
                            makeDiag(
                                expression.valueRanges[i],
                                `invalid character in column name '${val}'`,
                                'error',
                                CODE_INVALID_COLUMN_VALUE,
                            ),
                        )
                        emittedRanges.add(rangeKey(expression.valueRanges[i]))
                    }
                } else if (schema.resolve(val.split('.')) == null) {
                    if (expression.valueRanges != null && i < expression.valueRanges.length) {
                        diags.push(
                            makeDiag(
                                expression.valueRanges[i],
                                `column '${val}' is not defined`,
                                'error',
                                CODE_UNKNOWN_COLUMN_VALUE,
                            ),
                        )
                        emittedRanges.add(rangeKey(expression.valueRanges[i]))
                    }
                }
            }
        }
    }

    // Decision 16: invalid_datetime_literal for Date/DateTime columns,
    // suppressed when another diagnostic already fired for the range.
    if (col != null && (col.type === Type.Date || col.type === Type.DateTime)) {
        if (
            expression.valueType === LiteralKind.STRING &&
            typeof expression.value === 'string' &&
            expression.valueRange != null
        ) {
            const key = rangeKey(expression.valueRange)
            if (!emittedRanges.has(key) && !isValidISO8601(expression.value)) {
                diags.push(
                    makeDiag(
                        expression.valueRange,
                        `invalid iso8601 datetime literal '${expression.value}' for ${col.type} column '${col.name}'`,
                        'warning',
                        CODE_INVALID_DATETIME_LITERAL,
                    ),
                )
                emittedRanges.add(key)
            }
        }
        if (expression.valuesTypes != null && expression.valueRanges != null) {
            for (let i = 0; i < expression.valuesTypes.length; i++) {
                if (expression.valuesTypes[i] !== LiteralKind.STRING) continue
                if (i >= expression.values.length || i >= expression.valueRanges.length) continue
                const v = expression.values[i]
                if (typeof v !== 'string') continue
                const r = expression.valueRanges[i]
                const key = rangeKey(r)
                if (emittedRanges.has(key)) continue
                if (!isValidISO8601(v)) {
                    diags.push(
                        makeDiag(
                            r,
                            `invalid iso8601 datetime literal '${v}' for ${col.type} column '${col.name}'`,
                            'warning',
                            CODE_INVALID_DATETIME_LITERAL,
                        ),
                    )
                    emittedRanges.add(key)
                }
            }
        }
    }

    return diags
}
