const NormalizedTypeString = 'string'
const NormalizedTypeInt = 'int'
const NormalizedTypeFloat = 'float'
const NormalizedTypeBool = 'bool'
const NormalizedTypeDate = 'date'
const NormalizedTypeArray = 'array'
const NormalizedTypeMap = 'map'
const NormalizedTypeStruct = 'struct'
const NormalizedTypeSpecial = 'special'
const NormalizedTypeJSON = 'json'

export {
    NormalizedTypeString,
    NormalizedTypeInt,
    NormalizedTypeFloat,
    NormalizedTypeBool,
    NormalizedTypeDate,
    NormalizedTypeArray,
    NormalizedTypeMap,
    NormalizedTypeStruct,
    NormalizedTypeSpecial,
    NormalizedTypeJSON,
}

const typeRegexes = {
    [NormalizedTypeString]: /^(varchar|char|string)\s*\(\s*\d+\s*\)/i,
    [NormalizedTypeInt]: /^(tinyint|smallint|int|largeint|bigint)\s*\(\s*\d+\s*\)/i,
    [NormalizedTypeFloat]: /^(decimal|float|double)\d*\s*\(\s*\d+\s*(,\s*\d+)?\s*\)/i,
    [NormalizedTypeDate]: /^datetime/i,
    [NormalizedTypeArray]: /^array\s*</i,
    [NormalizedTypeMap]: /^map\s*</i,
    [NormalizedTypeStruct]: /^struct\s*</i,
    [NormalizedTypeJSON]: /^json/i,
}

const normalizedTypeToStarRocksTypes = {
    [NormalizedTypeString]: new Set(['string', 'varchar', 'char', 'binary', 'varbinary']),
    [NormalizedTypeInt]: new Set(['int', 'tinyint', 'smallint', 'largeint', 'bigint']),
    [NormalizedTypeFloat]: new Set(['float', 'double', 'decimal']),
    [NormalizedTypeBool]: new Set(['bool', 'boolean']),
    [NormalizedTypeDate]: new Set(['date', 'datetime']),
    [NormalizedTypeSpecial]: new Set(['bitmap', 'hll']),
    [NormalizedTypeJSON]: new Set(['json']),
}

export function normalizeStarRocksType(srType) {
    if (!srType) return ''
    const normalized = srType.trim().toLowerCase()

    if (typeRegexes[NormalizedTypeString].test(normalized)) return NormalizedTypeString
    if (normalizedTypeToStarRocksTypes[NormalizedTypeString].has(normalized)) return NormalizedTypeString

    if (typeRegexes[NormalizedTypeInt].test(normalized)) return NormalizedTypeInt
    if (normalizedTypeToStarRocksTypes[NormalizedTypeInt].has(normalized)) return NormalizedTypeInt

    if (typeRegexes[NormalizedTypeFloat].test(normalized)) return NormalizedTypeFloat
    if (normalizedTypeToStarRocksTypes[NormalizedTypeFloat].has(normalized)) return NormalizedTypeFloat

    if (normalizedTypeToStarRocksTypes[NormalizedTypeBool].has(normalized)) return NormalizedTypeBool

    if (typeRegexes[NormalizedTypeDate].test(normalized)) return NormalizedTypeDate
    if (normalizedTypeToStarRocksTypes[NormalizedTypeDate].has(normalized)) return NormalizedTypeDate

    if (typeRegexes[NormalizedTypeJSON].test(normalized)) return NormalizedTypeJSON
    if (normalizedTypeToStarRocksTypes[NormalizedTypeJSON].has(normalized)) return NormalizedTypeJSON

    if (typeRegexes[NormalizedTypeArray].test(normalized)) return NormalizedTypeArray
    if (typeRegexes[NormalizedTypeMap].test(normalized)) return NormalizedTypeMap
    if (typeRegexes[NormalizedTypeStruct].test(normalized)) return NormalizedTypeStruct

    if (normalizedTypeToStarRocksTypes[NormalizedTypeSpecial].has(normalized)) return NormalizedTypeSpecial

    return ''
}

export class Column {
    constructor(name, jsonString, type, values) {
        this.name = name
        this.jsonString = jsonString
        this.type = type
        this.values = values || []
        this.normalizedType = normalizeStarRocksType(type)
        this.isMap = this.normalizedType === NormalizedTypeMap
        this.isArray = this.normalizedType === NormalizedTypeArray
        this.isStruct = this.normalizedType === NormalizedTypeStruct
        this.isJSON = this.normalizedType === NormalizedTypeJSON
        this.rawIdentifier = ''
    }

    withRawIdentifier(identifier) {
        this.rawIdentifier = identifier
        return this
    }
}

export function newColumn(name, jsonString, type, values) {
    return new Column(name, jsonString, type, values)
}
