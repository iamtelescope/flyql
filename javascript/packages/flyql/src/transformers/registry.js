import { Type } from '../flyql_type.js'
import { UpperTransformer, LowerTransformer, LenTransformer, SplitTransformer } from './builtins.js'

export class TransformerRegistry {
    constructor() {
        this._transformers = {}
    }

    get(name) {
        return Object.hasOwn(this._transformers, name) ? this._transformers[name] : null
    }

    register(transformer) {
        if (this._transformers[transformer.name]) {
            throw new Error(`Transformer '${transformer.name}' is already registered`)
        }
        if (transformer.outputType === Type.Any) {
            throw new Error(`transformer '${transformer.name}': output_type cannot be any input type`)
        }
        const argSchema = transformer.argSchema || []
        for (const spec of argSchema) {
            if (spec && spec.type === Type.Any) {
                throw new Error(`transformer '${transformer.name}': ArgSpec.type cannot be any input type`)
            }
        }
        this._transformers[transformer.name] = transformer
    }

    names() {
        return Object.keys(this._transformers)
    }
}

export function defaultRegistry() {
    const registry = new TransformerRegistry()
    registry.register(new UpperTransformer())
    registry.register(new LowerTransformer())
    registry.register(new LenTransformer())
    registry.register(new SplitTransformer())
    return registry
}
