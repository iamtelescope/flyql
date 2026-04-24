import {
    Diagnostic,
    CODE_UNKNOWN_COLUMN,
    CODE_UNKNOWN_TRANSFORMER,
    CODE_UNKNOWN_TRANSFORMER_ARG_COLUMN,
    CODE_ARG_COUNT,
    CODE_ARG_TYPE,
    CODE_CHAIN_TYPE,
    CODE_UNKNOWN_RENDERER,
    CODE_RENDERER_ARG_COUNT,
    CODE_RENDERER_ARG_TYPE,
    jsToFlyQLType,
    makeDiag,
} from '../core/validator.js'
import { Range } from '../core/range.js'
import { Type } from '../flyql_type.js'
import { defaultRegistry } from '../transformers/registry.js'
import { defaultRegistry as defaultRendererRegistry } from '../renderers/registry.js'

export function diagnose(parsedColumns, schema, registry = null, rendererRegistry = null) {
    if (!parsedColumns || parsedColumns.length === 0) return []
    if (registry == null) registry = defaultRegistry()
    if (rendererRegistry == null) rendererRegistry = defaultRendererRegistry()

    const diags = []

    for (const col of parsedColumns) {
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
                diags.push(makeDiag(range, `column '${segment}' is not defined`, 'error', CODE_UNKNOWN_COLUMN))
            }
            prevOutputType = null
        } else {
            prevOutputType = resolved.type && resolved.type !== Type.Unknown ? resolved.type : null
        }

        const transformerRanges = col.transformerRanges || []

        for (let ti = 0; ti < col.transformers.length; ti++) {
            const transformer = col.transformers[ti]
            const ranges = transformerRanges[ti] || {}
            const t = registry.get(transformer.name)

            if (t == null) {
                if (ranges.nameRange) {
                    diags.push(
                        makeDiag(
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
                        makeDiag(
                            fullRange,
                            `${transformer.name} expects ${expectStr}, got ${got}`,
                            'error',
                            CODE_ARG_COUNT,
                        ),
                    )
                }
            }

            const argRanges = ranges.argumentRanges || []
            const transformerArgKinds = transformer.argumentKinds || []
            // Guard against parser-bug or legacy-AST drift: only trust kinds when
            // length matches the argument list. On mismatch fall through to the
            // pre-existing literal type checks.
            const transformerKindsInSync = transformerArgKinds.length === transformer.arguments.length
            for (let j = 0; j < transformer.arguments.length; j++) {
                if (j >= t.argSchema.length) break
                if (transformerKindsInSync && transformerArgKinds[j] === 'col') {
                    const rawRef = transformer.arguments[j]
                    if (
                        typeof rawRef === 'string' &&
                        schema.resolve(rawRef.split('.')) == null &&
                        j < argRanges.length
                    ) {
                        diags.push(
                            makeDiag(
                                argRanges[j],
                                `unknown column in argument: '${rawRef}'`,
                                'error',
                                CODE_UNKNOWN_TRANSFORMER_ARG_COLUMN,
                            ),
                        )
                    }
                    continue
                }
                const expected = t.argSchema[j].type
                const actual = jsToFlyQLType(transformer.arguments[j])
                if (actual == null) continue
                if (actual === expected) continue
                if (actual === Type.Int && expected === Type.Float) continue
                if (j < argRanges.length) {
                    diags.push(
                        makeDiag(
                            argRanges[j],
                            `argument ${j + 1} of ${transformer.name}: expected ${expected}, got ${actual}`,
                            'error',
                            CODE_ARG_TYPE,
                        ),
                    )
                }
            }

            if (prevOutputType != null && prevOutputType !== t.inputType) {
                if (ranges.nameRange) {
                    diags.push(
                        makeDiag(
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

        const rendererRanges = col.rendererRanges || []
        for (let ri = 0; ri < col.renderers.length; ri++) {
            const renderer = col.renderers[ri]
            const ranges = rendererRanges[ri] || {}
            const r = rendererRegistry.get(renderer.name)

            if (r == null) {
                if (ranges.nameRange) {
                    diags.push(
                        makeDiag(
                            ranges.nameRange,
                            `unknown renderer: '${renderer.name}'`,
                            'error',
                            CODE_UNKNOWN_RENDERER,
                        ),
                    )
                }
                continue
            }

            const requiredCount = r.argSchema.filter((s) => s.required).length
            const maxCount = r.argSchema.length
            const got = renderer.arguments.length
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
                        makeDiag(
                            fullRange,
                            `${renderer.name} expects ${expectStr}, got ${got}`,
                            'error',
                            CODE_RENDERER_ARG_COUNT,
                        ),
                    )
                }
            }

            const rArgRanges = ranges.argumentRanges || []
            const rendererArgKinds = renderer.argumentKinds || []
            const rendererKindsInSync = rendererArgKinds.length === renderer.arguments.length
            for (let j = 0; j < renderer.arguments.length; j++) {
                if (j >= r.argSchema.length) break
                if (rendererKindsInSync && rendererArgKinds[j] === 'col') {
                    const rawRef = renderer.arguments[j]
                    if (
                        typeof rawRef === 'string' &&
                        schema.resolve(rawRef.split('.')) == null &&
                        j < rArgRanges.length
                    ) {
                        diags.push(
                            makeDiag(
                                rArgRanges[j],
                                `unknown column in argument: '${rawRef}'`,
                                'error',
                                CODE_UNKNOWN_TRANSFORMER_ARG_COLUMN,
                            ),
                        )
                    }
                    continue
                }
                const expected = r.argSchema[j].type
                const actual = jsToFlyQLType(renderer.arguments[j])
                if (actual == null) continue
                if (actual === expected) continue
                if (actual === Type.Int && expected === Type.Float) continue
                if (j < rArgRanges.length) {
                    diags.push(
                        makeDiag(
                            rArgRanges[j],
                            `argument ${j + 1} of ${renderer.name}: expected ${expected}, got ${actual}`,
                            'error',
                            CODE_RENDERER_ARG_TYPE,
                        ),
                    )
                }
            }

            const hookDiags = r.diagnose ? r.diagnose(renderer.arguments, col, ranges) : []
            if (hookDiags && hookDiags.length > 0) {
                diags.push(...hookDiags)
            }
        }

        const chainHook = rendererRegistry.getDiagnose ? rendererRegistry.getDiagnose() : null
        if (chainHook && col.renderers.length > 0) {
            const chainDiags = chainHook(col, col.renderers)
            if (chainDiags && chainDiags.length > 0) {
                diags.push(...chainDiags)
            }
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
