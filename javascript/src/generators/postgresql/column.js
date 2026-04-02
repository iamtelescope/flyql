const NormalizedTypeString = 'string'
const NormalizedTypeInt = 'int'
const NormalizedTypeFloat = 'float'
const NormalizedTypeBool = 'bool'
const NormalizedTypeDate = 'date'
const NormalizedTypeArray = 'array'
const NormalizedTypeJSON = 'json'
const NormalizedTypeHstore = 'hstore'

export {
    NormalizedTypeString,
    NormalizedTypeInt,
    NormalizedTypeFloat,
    NormalizedTypeBool,
    NormalizedTypeDate,
    NormalizedTypeArray,
    NormalizedTypeJSON,
    NormalizedTypeHstore,
}

const typeRegexes = {
    [NormalizedTypeString]: /^(varchar|char|character varying|character)\s*\(\s*\d+\s*\)/i,
    [NormalizedTypeFloat]: /^(numeric|decimal)\s*\(\s*\d+\s*(,\s*\d+)?\s*\)/i,
    [NormalizedTypeDate]: /^timestamp\s*\(\s*\d+\s*\)/i,
    [NormalizedTypeArray]: /(\[\]$|^_)/i,
}

const normalizedTypeToPostgreSQLTypes = {
    [NormalizedTypeString]: new Set([
        'text',
        'varchar',
        'char',
        'character varying',
        'character',
        'name',
        'uuid',
        'citext',
        'inet',
        'cidr',
        'macaddr',
    ]),
    [NormalizedTypeInt]: new Set([
        'smallint',
        'integer',
        'bigint',
        'int2',
        'int4',
        'int8',
        'serial',
        'bigserial',
        'smallserial',
    ]),
    [NormalizedTypeFloat]: new Set(['real', 'double precision', 'numeric', 'decimal', 'float4', 'float8', 'money']),
    [NormalizedTypeBool]: new Set(['boolean', 'bool']),
    [NormalizedTypeDate]: new Set([
        'date',
        'timestamp',
        'timestamptz',
        'timestamp without time zone',
        'timestamp with time zone',
        'time',
        'timetz',
        'interval',
    ]),
    [NormalizedTypeJSON]: new Set(['jsonb', 'json']),
    [NormalizedTypeHstore]: new Set(['hstore']),
}

export function normalizePostgreSQLType(pgType) {
    if (!pgType) {
        return ''
    }

    const normalized = pgType.trim().toLowerCase()

    if (typeRegexes[NormalizedTypeArray].test(normalized)) {
        return NormalizedTypeArray
    }

    if (typeRegexes[NormalizedTypeString].test(normalized)) {
        return NormalizedTypeString
    }
    if (normalizedTypeToPostgreSQLTypes[NormalizedTypeString].has(normalized)) {
        return NormalizedTypeString
    }

    if (normalizedTypeToPostgreSQLTypes[NormalizedTypeInt].has(normalized)) {
        return NormalizedTypeInt
    }

    if (typeRegexes[NormalizedTypeFloat].test(normalized)) {
        return NormalizedTypeFloat
    }
    if (normalizedTypeToPostgreSQLTypes[NormalizedTypeFloat].has(normalized)) {
        return NormalizedTypeFloat
    }

    if (normalizedTypeToPostgreSQLTypes[NormalizedTypeBool].has(normalized)) {
        return NormalizedTypeBool
    }

    if (typeRegexes[NormalizedTypeDate].test(normalized)) {
        return NormalizedTypeDate
    }
    if (normalizedTypeToPostgreSQLTypes[NormalizedTypeDate].has(normalized)) {
        return NormalizedTypeDate
    }

    if (normalizedTypeToPostgreSQLTypes[NormalizedTypeJSON].has(normalized)) {
        return NormalizedTypeJSON
    }

    if (normalizedTypeToPostgreSQLTypes[NormalizedTypeHstore].has(normalized)) {
        return NormalizedTypeHstore
    }

    return ''
}

export class Column {
    constructor(name, jsonString, type, values, displayName = '', rawIdentifier = '') {
        this.name = name
        this.jsonString = !!jsonString
        this.type = type
        this.values = values || []
        this.normalizedType = normalizePostgreSQLType(type)
        this.isArray = this.normalizedType === NormalizedTypeArray
        this.isJSONB = this.normalizedType === NormalizedTypeJSON
        this.isHstore = this.normalizedType === NormalizedTypeHstore
        this.displayName = displayName
        this.rawIdentifier = rawIdentifier
    }

    withRawIdentifier(identifier) {
        this.rawIdentifier = identifier
        return this
    }
}

export function newColumn(name, jsonString, type, values) {
    return new Column(name, jsonString, type, values)
}
