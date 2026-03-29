import { defaultRegistry } from '../transformers/index.js'

export function applyTransformerSQL(columnRef, transformers, dialect, registry = null) {
    if (!transformers || transformers.length === 0) return columnRef
    if (!registry) registry = defaultRegistry()

    let result = columnRef
    for (const tDict of transformers) {
        const transformer = registry.get(tDict.name)
        if (!transformer) {
            throw new Error(`unknown transformer: ${tDict.name}`)
        }
        result = transformer.sql(dialect, result, tDict.arguments || [])
    }
    return result
}

export function validateTransformerChain(transformers, registry = null, baseType = 'string') {
    if (!transformers || transformers.length === 0) return
    if (!registry) registry = defaultRegistry()

    let currentType = baseType
    for (let i = 0; i < transformers.length; i++) {
        const tDict = transformers[i]
        const transformer = registry.get(tDict.name)
        if (!transformer) {
            throw new Error(`unknown transformer: ${tDict.name}`)
        }
        if (transformer.inputType !== currentType) {
            throw new Error(
                `transformer chain type error: '${tDict.name}' at position ${i} ` +
                    `requires ${transformer.inputType} input, ` +
                    `but received ${currentType}`,
            )
        }
        currentType = transformer.outputType
    }
}
