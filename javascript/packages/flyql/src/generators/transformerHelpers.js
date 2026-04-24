import { Type } from '../flyql_type.js'
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
        const args = tDict.arguments || []
        const requiredCount = transformer.argSchema.filter((s) => s.required).length
        const maxCount = transformer.argSchema.length
        if (args.length < requiredCount || args.length > maxCount) {
            let expectStr
            if (requiredCount === maxCount) {
                expectStr = `${requiredCount} arguments`
            } else {
                expectStr = `${requiredCount}..${maxCount} arguments`
            }
            throw new Error(`${tDict.name} expects ${expectStr}, got ${args.length}`)
        }
        result = transformer.sql(dialect, result, args)
    }
    return result
}

export function getTransformerOutputType(transformers, registry = null) {
    if (!transformers || transformers.length === 0) return null
    if (!registry) registry = defaultRegistry()
    const last = registry.get(transformers[transformers.length - 1].name)
    return last ? last.outputType : null
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
        if (transformer.inputType !== Type.Any && transformer.inputType !== currentType) {
            throw new Error(
                `transformer chain type error: '${tDict.name}' at position ${i} ` +
                    `requires ${transformer.inputType} input, ` +
                    `but received ${currentType}`,
            )
        }
        currentType = transformer.outputType
    }
}
