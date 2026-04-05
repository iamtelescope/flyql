export const TransformerType = Object.freeze({
    STRING: 'string',
    INT: 'int',
    FLOAT: 'float',
    BOOL: 'bool',
    ARRAY: 'array',
})

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

    sql(dialect, columnRef, args = []) {
        throw new Error('not implemented')
    }

    apply(value, args = []) {
        throw new Error('not implemented')
    }
}
