import { describe, it, expect } from 'vitest'
import { EditorEngine } from '../src/engine.js'
import { Transformer, defaultRegistry } from 'flyql/transformers'
import { Type } from 'flyql'
import { ColumnSchema } from 'flyql/core'

class FirstOctetTransformer extends Transformer {
    get name() {
        return 'firstoctet'
    }
    get inputType() {
        return Type.String
    }
    get outputType() {
        return Type.Int
    }
    sql(dialect, columnRef) {
        if (dialect === 'clickhouse') return `toUInt8(splitByChar('.', ${columnRef})[1])`
        return `CAST(SPLIT_PART(${columnRef}, '.', 1) AS INTEGER)`
    }
    apply(value) {
        return parseInt(String(value).split('.')[0], 10)
    }
}

function customRegistry() {
    const registry = defaultRegistry()
    registry.register(new FirstOctetTransformer())
    return registry
}

describe('Custom Transformer Editor Suggestions', () => {
    it('custom transformer appears in suggestions', async () => {
        const registry = customRegistry()
        const columns = ColumnSchema.fromPlainObject({
            src_ip: { type: 'string', suggest: true, autocomplete: false },
        })
        const engine = new EditorEngine(columns, { registry })
        engine.setQuery('src_ip|')
        engine.setCursorPosition(7)
        await engine.updateSuggestions()
        const labels = engine.suggestions.map((s) => s.label)
        expect(labels).toContain('firstoctet')
        expect(labels).toContain('upper')
    })
})
