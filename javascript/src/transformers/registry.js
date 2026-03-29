import { UpperTransformer, LowerTransformer, LenTransformer, SplitTransformer } from './builtins.js'

export class TransformerRegistry {
    constructor() {
        this._transformers = {}
    }

    get(name) {
        return this._transformers[name] || null
    }

    register(transformer) {
        if (this._transformers[transformer.name]) {
            throw new Error(`Transformer '${transformer.name}' is already registered`)
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
