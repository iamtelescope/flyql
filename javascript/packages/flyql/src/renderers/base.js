import { ArgSpec } from '../transformers/base.js'

export class Renderer {
    get name() {
        throw new Error('not implemented')
    }

    get argSchema() {
        return []
    }

    get metadata() {
        return {}
    }

    diagnose(_args, _parsedColumn, _ranges) {
        return []
    }
}

export { ArgSpec }
