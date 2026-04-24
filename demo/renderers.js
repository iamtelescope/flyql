/**
 * Demo-only renderer definitions. NOT part of the core flyql package — renderers
 * are a UI-layer concern and every consumer is expected to register their own
 * set. This file shows how to define one and wire it into the editor.
 */
import { Renderer, ArgSpec } from '../javascript/packages/flyql/src/renderers/base.js'
import { RendererRegistry } from '../javascript/packages/flyql/src/renderers/registry.js'
import { Type } from '../javascript/packages/flyql/src/flyql_type.js'
import { makeDiag } from '../javascript/packages/flyql/src/core/validator.js'

export const TAG_COLORS = ['gray', 'red', 'green', 'blue', 'yellow']
const TAG_COLORS_SET = new Set(TAG_COLORS)

export class TagRenderer extends Renderer {
    get name() {
        return 'tag'
    }

    get argSchema() {
        return [new ArgSpec(Type.String, false)]
    }

    get metadata() {
        return {
            display: 'tag',
            description: 'Render value as a colored tag/badge',
        }
    }

    diagnose(args, _parsedColumn, ranges) {
        const out = []
        if (!args || args.length === 0) return out
        const raw = args[0]
        // Type mismatches are caught by the core validator's arg-type check;
        // here we only validate the allowlist for string values.
        if (typeof raw !== 'string') return out
        if (TAG_COLORS_SET.has(raw)) return out
        const argRanges = (ranges && ranges.argumentRanges) || []
        const range = argRanges[0]
        if (!range) return out
        out.push(
            makeDiag(
                range,
                `tag: unknown color '${raw}', expected one of ${TAG_COLORS.join(', ')}`,
                'error',
                'demo_tag_unknown_color',
            ),
        )
        return out
    }
}

export function demoRendererRegistry() {
    const reg = new RendererRegistry()
    reg.register(new TagRenderer())
    return reg
}
