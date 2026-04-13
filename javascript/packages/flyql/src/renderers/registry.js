export class RendererRegistry {
    constructor() {
        this._renderers = new Map()
        this._diagnose = null
    }

    get(name) {
        return this._renderers.get(name) || null
    }

    register(renderer) {
        if (this._renderers.has(renderer.name)) {
            throw new Error(`Renderer '${renderer.name}' is already registered`)
        }
        this._renderers.set(renderer.name, renderer)
    }

    names() {
        return Array.from(this._renderers.keys())
    }

    setDiagnose(fn) {
        this._diagnose = fn
    }

    getDiagnose() {
        return this._diagnose
    }
}

export function defaultRegistry() {
    return new RendererRegistry()
}
