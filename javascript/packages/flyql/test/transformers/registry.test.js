import { describe, it, expect } from 'vitest'
import { ArgSpec, Transformer, TransformerRegistry } from '../../src/transformers/index.js'
import { Type } from '../../src/flyql_type.js'

class AnyOutputTransformer extends Transformer {
    get name() {
        return 'any_output'
    }
    get inputType() {
        return Type.String
    }
    get outputType() {
        return Type.Any
    }
    sql(dialect, columnRef) {
        return columnRef
    }
    apply(value) {
        return value
    }
}

class AnyArgTransformer extends Transformer {
    get name() {
        return 'any_arg'
    }
    get inputType() {
        return Type.String
    }
    get outputType() {
        return Type.String
    }
    get argSchema() {
        return [new ArgSpec(Type.Any, true)]
    }
    sql(dialect, columnRef) {
        return columnRef
    }
    apply(value) {
        return value
    }
}

describe('TransformerRegistry rejects Type.Any', () => {
    it('rejects Any as outputType at register-time', () => {
        const registry = new TransformerRegistry()
        expect(() => registry.register(new AnyOutputTransformer())).toThrow(/output_type/)
    })

    it('rejects Any as ArgSpec.type at register-time', () => {
        const registry = new TransformerRegistry()
        expect(() => registry.register(new AnyArgTransformer())).toThrow(/ArgSpec\.type/)
    })
})
