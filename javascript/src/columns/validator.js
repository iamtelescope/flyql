import {
    Diagnostic,
    CODE_UNKNOWN_COLUMN,
    CODE_UNKNOWN_TRANSFORMER,
    CODE_ARG_COUNT,
    CODE_ARG_TYPE,
    CODE_CHAIN_TYPE,
} from '../core/validator.js'
import { Range } from '../core/range.js'
import { normalizedToTransformerType } from '../core/column.js'
import { defaultRegistry } from '../transformers/registry.js'
import { TransformerType } from '../transformers/base.js'

function _jsToTransformerType(v) {
    if (typeof v === 'boolean') return TransformerType.BOOL
    if (typeof v === 'number' && Number.isInteger(v)) return TransformerType.INT
    if (typeof v === 'number') return TransformerType.FLOAT
    if (typeof v === 'string') return TransformerType.STRING
    return null
}

export function diagnose(parsedColumns, schema, registry = null) {
    if (!parsedColumns || parsedColumns.length === 0) return []
    if (registry == null) registry = defaultRegistry()

    const diags = []

    for (const col of parsedColumns) {
        // Use segments for nested traversal; strip empty trailing segment from trailing dot
        const rawSegments = col.segments || col.name.split('.')
        const segments =
            rawSegments.length > 0 && rawSegments[rawSegments.length - 1] === ''
                ? rawSegments.slice(0, -1)
                : rawSegments
        if (segments.length === 0) continue
        const resolved = schema.resolve(segments)

        let prevOutputType
        if (resolved == null) {
            if (col.nameRange) {
                const { segment, range } = _findFailingSegment(col, schema, segments)
                diags.push(new Diagnostic(range, `column '${segment}' is not defined`, 'error', CODE_UNKNOWN_COLUMN))
            }
            prevOutputType = null
        } else {
            prevOutputType = normalizedToTransformerType(resolved.normalizedType)
        }

        const transformerRanges = col.transformerRanges || []

        for (let ti = 0; ti < col.transformers.length; ti++) {
            const transformer = col.transformers[ti]
            const ranges = transformerRanges[ti] || {}
            const t = registry.get(transformer.name)

            if (t == null) {
                if (ranges.nameRange) {
                    diags.push(
                        new Diagnostic(
                            ranges.nameRange,
                            `unknown transformer: '${transformer.name}'`,
                            'error',
                            CODE_UNKNOWN_TRANSFORMER,
                        ),
                    )
                }
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
                if (ranges.nameRange) {
                    const argRangesArr = ranges.argumentRanges || []
                    const fullRange =
                        argRangesArr.length > 0
                            ? new Range(ranges.nameRange.start, argRangesArr[argRangesArr.length - 1].end + 1)
                            : ranges.nameRange
                    diags.push(
                        new Diagnostic(
                            fullRange,
                            `${transformer.name} expects ${expectStr}, got ${got}`,
                            'error',
                            CODE_ARG_COUNT,
                        ),
                    )
                }
            }

            // Per-argument type check
            const argRanges = ranges.argumentRanges || []
            for (let j = 0; j < transformer.arguments.length; j++) {
                if (j >= t.argSchema.length) break
                const expected = t.argSchema[j].type
                const actual = _jsToTransformerType(transformer.arguments[j])
                if (actual == null) continue
                if (actual === expected) continue
                // int widens to float
                if (actual === TransformerType.INT && expected === TransformerType.FLOAT) continue
                if (j < argRanges.length) {
                    diags.push(
                        new Diagnostic(
                            argRanges[j],
                            `argument ${j + 1} of ${transformer.name}: expected ${expected}, got ${actual}`,
                            'error',
                            CODE_ARG_TYPE,
                        ),
                    )
                }
            }

            // Chain type check
            if (prevOutputType != null && prevOutputType !== t.inputType) {
                if (ranges.nameRange) {
                    diags.push(
                        new Diagnostic(
                            ranges.nameRange,
                            `${transformer.name} expects ${t.inputType} input, got ${prevOutputType}`,
                            'error',
                            CODE_CHAIN_TYPE,
                        ),
                    )
                }
            }

            prevOutputType = t.outputType
        }
    }

    return diags
}

function _findFailingSegment(col, schema, segments) {
    let current = null
    for (let i = 0; i < segments.length; i++) {
        if (i === 0) {
            current = schema.get(segments[i])
        } else if (current != null && current.children != null) {
            current = current.children[segments[i].toLowerCase()] || null
        } else {
            current = null
        }
        if (current == null) {
            let offset = col.nameRange.start
            for (let j = 0; j < i; j++) {
                offset += segments[j].length + 1
            }
            return { segment: segments[i], range: new Range(offset, offset + segments[i].length) }
        }
    }
    return { segment: segments[0], range: new Range(col.nameRange.start, col.nameRange.start + segments[0].length) }
}
