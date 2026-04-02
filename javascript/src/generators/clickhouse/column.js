const NormalizedTypeString = 'string'
const NormalizedTypeInt = 'int'
const NormalizedTypeFloat = 'float'
const NormalizedTypeBool = 'bool'
const NormalizedTypeDate = 'date'
const NormalizedTypeArray = 'array'
const NormalizedTypeMap = 'map'
const NormalizedTypeTuple = 'tuple'
const NormalizedTypeGeometry = 'geometry'
const NormalizedTypeInterval = 'interval'
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
    NormalizedTypeTuple,
    NormalizedTypeGeometry,
    NormalizedTypeInterval,
    NormalizedTypeSpecial,
    NormalizedTypeJSON,
}

const typeRegexes = {
    wrapper: /^(nullable|lowcardinality|simpleaggregatefunction|aggregatefunction)\s*\(\s*(.+)\s*\)/i,
    [NormalizedTypeString]: /^(varchar|char|fixedstring)\s*\(\s*\d+\s*\)/i,
    [NormalizedTypeInt]: /^(tinyint|smallint|mediumint|int|integer|bigint)\s*\(\s*\d+\s*\)/i,
    [NormalizedTypeFloat]: /^(decimal|numeric|dec)\d*\s*\(\s*\d+\s*(,\s*\d+)?\s*\)/i,
    [NormalizedTypeDate]: /^datetime64\s*\(\s*\d+\s*(,\s*.+)?\s*\)/i,
    [NormalizedTypeArray]: /^array\s*\(/i,
    [NormalizedTypeMap]: /^map\s*\(/i,
    [NormalizedTypeTuple]: /^tuple\s*\(/i,
    [NormalizedTypeJSON]: /^json\s*\(/i,
}

const normalizedTypeToClickHouseTypes = {
    [NormalizedTypeString]: new Set([
        'string',
        'fixedstring',
        'longtext',
        'mediumtext',
        'tinytext',
        'text',
        'longblob',
        'mediumblob',
        'tinyblob',
        'blob',
        'varchar',
        'char',
        'char large object',
        'char varying',
        'character',
        'character large object',
        'character varying',
        'nchar large object',
        'nchar varying',
        'national character large object',
        'national character varying',
        'national char varying',
        'national character',
        'national char',
        'binary large object',
        'binary varying',
        'clob',
        'nchar',
        'nvarchar',
        'varchar2',
        'binary',
        'varbinary',
        'bytea',
        'uuid',
        'ipv4',
        'ipv6',
        'enum8',
        'enum16',
    ]),
    [NormalizedTypeInt]: new Set([
        'int8',
        'int16',
        'int32',
        'int64',
        'int128',
        'int256',
        'uint8',
        'uint16',
        'uint32',
        'uint64',
        'uint128',
        'uint256',
        'tinyint',
        'smallint',
        'mediumint',
        'int',
        'integer',
        'bigint',
        'tinyint signed',
        'tinyint unsigned',
        'smallint signed',
        'smallint unsigned',
        'mediumint signed',
        'mediumint unsigned',
        'int signed',
        'int unsigned',
        'integer signed',
        'integer unsigned',
        'bigint signed',
        'bigint unsigned',
        'int1',
        'int1 signed',
        'int1 unsigned',
        'byte',
        'signed',
        'unsigned',
        'bit',
        'set',
        'time',
    ]),
    [NormalizedTypeFloat]: new Set([
        'float32',
        'float64',
        'float',
        'double',
        'double precision',
        'real',
        'decimal',
        'decimal32',
        'decimal64',
        'decimal128',
        'decimal256',
        'dec',
        'numeric',
        'fixed',
        'single',
    ]),
    [NormalizedTypeBool]: new Set(['bool', 'boolean']),
    [NormalizedTypeDate]: new Set(['date', 'date32', 'datetime', 'datetime32', 'datetime64', 'timestamp', 'year']),
    [NormalizedTypeInterval]: new Set([
        'intervalday',
        'intervalhour',
        'intervalmicrosecond',
        'intervalmillisecond',
        'intervalminute',
        'intervalmonth',
        'intervalnanosecond',
        'intervalquarter',
        'intervalsecond',
        'intervalweek',
        'intervalyear',
    ]),
    [NormalizedTypeGeometry]: new Set(['geometry', 'point', 'polygon', 'multipolygon', 'linestring', 'ring']),
    [NormalizedTypeSpecial]: new Set(['nothing', 'nested', 'object', 'dynamic', 'variant']),
    [NormalizedTypeJSON]: new Set(['json']),
}

export function normalizeClickHouseType(chType) {
    if (!chType) {
        return ''
    }

    let normalized = chType.trim().toLowerCase()

    const wrapperMatch = normalized.match(typeRegexes.wrapper)
    if (wrapperMatch) {
        normalized = wrapperMatch[2].trim()
    }

    if (typeRegexes[NormalizedTypeString].test(normalized)) {
        return NormalizedTypeString
    }
    if (normalizedTypeToClickHouseTypes[NormalizedTypeString].has(normalized)) {
        return NormalizedTypeString
    }

    if (typeRegexes[NormalizedTypeInt].test(normalized)) {
        return NormalizedTypeInt
    }
    if (normalizedTypeToClickHouseTypes[NormalizedTypeInt].has(normalized)) {
        return NormalizedTypeInt
    }

    if (typeRegexes[NormalizedTypeFloat].test(normalized)) {
        return NormalizedTypeFloat
    }
    if (normalizedTypeToClickHouseTypes[NormalizedTypeFloat].has(normalized)) {
        return NormalizedTypeFloat
    }

    if (normalizedTypeToClickHouseTypes[NormalizedTypeBool].has(normalized)) {
        return NormalizedTypeBool
    }

    if (typeRegexes[NormalizedTypeDate].test(normalized)) {
        return NormalizedTypeDate
    }
    if (normalizedTypeToClickHouseTypes[NormalizedTypeDate].has(normalized)) {
        return NormalizedTypeDate
    }

    if (typeRegexes[NormalizedTypeJSON].test(normalized)) {
        return NormalizedTypeJSON
    }
    if (normalizedTypeToClickHouseTypes[NormalizedTypeJSON].has(normalized)) {
        return NormalizedTypeJSON
    }

    if (typeRegexes[NormalizedTypeArray].test(normalized)) {
        return NormalizedTypeArray
    }

    if (typeRegexes[NormalizedTypeMap].test(normalized)) {
        return NormalizedTypeMap
    }

    if (typeRegexes[NormalizedTypeTuple].test(normalized)) {
        return NormalizedTypeTuple
    }

    if (normalizedTypeToClickHouseTypes[NormalizedTypeGeometry].has(normalized)) {
        return NormalizedTypeGeometry
    }

    if (normalizedTypeToClickHouseTypes[NormalizedTypeInterval].has(normalized)) {
        return NormalizedTypeInterval
    }

    if (normalizedTypeToClickHouseTypes[NormalizedTypeSpecial].has(normalized)) {
        return NormalizedTypeSpecial
    }

    return ''
}

function escapeIdentifier(name) {
    if (/^[0-9]/.test(name) || /[^a-zA-Z0-9_]/.test(name)) {
        const escaped = name.replace(/`/g, '``')
        return `\`${escaped}\``
    }
    return name
}

export class Column {
    constructor(name, jsonString, type, values, displayName = '', rawIdentifier = '') {
        this.name = escapeIdentifier(name)
        this.jsonString = jsonString
        this.type = type
        this.values = values || []
        this.normalizedType = normalizeClickHouseType(type)
        this.isMap = this.normalizedType === NormalizedTypeMap
        this.isArray = this.normalizedType === NormalizedTypeArray
        this.isJSON = this.normalizedType === NormalizedTypeJSON
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
