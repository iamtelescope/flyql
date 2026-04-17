/**
 * Demo-only renderer definitions. NOT part of the core flyql package — renderers
 * are a UI-layer concern and every consumer is expected to register their own
 * set. This file shows how to define one and wire it into the editor.
 */
import { Renderer, ArgSpec } from '../javascript/packages/flyql/src/renderers/base.js'
import { RendererRegistry } from '../javascript/packages/flyql/src/renderers/registry.js'
import { Type } from '../javascript/packages/flyql/src/flyql_type.js'

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
}

export function demoRendererRegistry() {
    const reg = new RendererRegistry()
    reg.register(new TagRenderer())
    return reg
}
