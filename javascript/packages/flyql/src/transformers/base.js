import { Type } from '../flyql_type.js'

export class ArgSpec {
    constructor(type, required = true) {
        this.type = type
        this.required = required
    }
}

export class Transformer {
    get name() {
        throw new Error('not implemented')
    }

    get inputType() {
        throw new Error('not implemented')
    }

    get outputType() {
        throw new Error('not implemented')
    }

    get argSchema() {
        return []
    }

    sql(dialect, columnRef, _args = []) {
        throw new Error('not implemented')
    }

    apply(value, _args = []) {
        throw new Error('not implemented')
    }
}

// Re-export Type so existing `import { Type } from '../transformers/base.js'`
// patterns continue to work, but new code should import from
// '../flyql_type.js' directly.
export { Type }
