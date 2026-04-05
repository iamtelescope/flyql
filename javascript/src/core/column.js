import { TransformerType } from '../transformers/base.js'

export class Column {
    constructor(
        name,
        jsonString,
        type,
        normalizedType,
        { values = [], displayName = '', rawIdentifier = '', matchName = null } = {},
    ) {
        this.name = name
        this.jsonString = jsonString
        this.type = type
        this.normalizedType = normalizedType
        this.values = values
        this.displayName = displayName
        this.rawIdentifier = rawIdentifier
        this.matchName = matchName !== null ? matchName : name
    }

    withRawIdentifier(identifier) {
        this.rawIdentifier = identifier
        return this
    }
}

export function normalizedToTransformerType(s) {
    if (s == null) return null
    const valid = new Set([
        TransformerType.STRING,
        TransformerType.INT,
        TransformerType.FLOAT,
        TransformerType.BOOL,
        TransformerType.ARRAY,
    ])
    return valid.has(s) ? s : null
}
