import { Type } from '../../flyql_type.js'
import { FlyqlError } from '../../core/exceptions.js'

const wrapperRegex = /^(nullable|lowcardinality|simpleaggregatefunction|aggregatefunction)\(/i

const typeRegexes = {
    [Type.String]: /^(varchar|char|fixedstring)\s*\(\s*\d+\s*\)/i,
    [Type.Int]: /^(tinyint|smallint|mediumint|int|integer|bigint)\s*\(\s*\d+\s*\)/i,
    [Type.Float]: /^(decimal|numeric|dec)\d*\s*\(\s*\d+\s*(,\s*\d+)?\s*\)/i,
    [Type.Date]: /^datetime64\s*\(\s*\d+\s*(,\s*.+)?\s*\)/i,
    [Type.Array]: /^array\s*\(/i,
    [Type.Map]: /^map\s*\(/i,
    [Type.Struct]: /^tuple\s*\(/i,
    [Type.JSON]: /^json\s*\(/i,
}

const flyqlTypeToClickHouseTypes = {
    [Type.String]: new Set([
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
    [Type.Int]: new Set([
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
    [Type.Float]: new Set([
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
    [Type.Bool]: new Set(['bool', 'boolean']),
    [Type.Date]: new Set(['date', 'date32', 'datetime', 'datetime32', 'datetime64', 'timestamp', 'year']),
    [Type.Duration]: new Set([
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
    [Type.Unknown]: new Set([
        'geometry',
        'point',
        'polygon',
        'multipolygon',
        'linestring',
        'ring',
        'nothing',
        'nested',
        'object',
        'dynamic',
        'variant',
    ]),
    [Type.JSON]: new Set(['json']),
}

export function normalizeClickHouseType(chType) {
    if (!chType) return Type.Unknown

    let normalized = chType.trim().toLowerCase()

    if (normalized === 'jsonstring') return Type.JSONString

    const wrapperMatch = normalized.match(wrapperRegex)
    if (wrapperMatch) {
        const afterKeyword = normalized.slice(wrapperMatch[0].length)
        const lastParen = afterKeyword.lastIndexOf(')')
        normalized = (lastParen >= 0 ? afterKeyword.slice(0, lastParen) : afterKeyword).trim()
    }

    if (typeRegexes[Type.String].test(normalized)) return Type.String
    if (flyqlTypeToClickHouseTypes[Type.String].has(normalized)) return Type.String

    if (typeRegexes[Type.Int].test(normalized)) return Type.Int
    if (flyqlTypeToClickHouseTypes[Type.Int].has(normalized)) return Type.Int

    if (typeRegexes[Type.Float].test(normalized)) return Type.Float
    if (flyqlTypeToClickHouseTypes[Type.Float].has(normalized)) return Type.Float

    if (flyqlTypeToClickHouseTypes[Type.Bool].has(normalized)) return Type.Bool

    if (typeRegexes[Type.Date].test(normalized)) return Type.Date
    if (flyqlTypeToClickHouseTypes[Type.Date].has(normalized)) return Type.Date

    if (typeRegexes[Type.JSON].test(normalized)) return Type.JSON
    if (flyqlTypeToClickHouseTypes[Type.JSON].has(normalized)) return Type.JSON

    if (typeRegexes[Type.Array].test(normalized)) return Type.Array

    if (typeRegexes[Type.Map].test(normalized)) return Type.Map

    if (typeRegexes[Type.Struct].test(normalized)) return Type.Struct

    if (flyqlTypeToClickHouseTypes[Type.Unknown].has(normalized)) return Type.Unknown

    if (flyqlTypeToClickHouseTypes[Type.Duration].has(normalized)) return Type.Duration

    return Type.Unknown
}

function escapeIdentifier(name) {
    if (/^[0-9]/.test(name) || /[^a-zA-Z0-9_]/.test(name)) {
        const escaped = name.replace(/`/g, '``')
        return `\`${escaped}\``
    }
    return name
}

/**
 * Opaque ClickHouse-dialect Column. Construct via `newColumn({...})` or `new Column({...})`.
 * The flyql semantic type is computed at construction via `normalizeClickHouseType`.
 */
export class Column {
    constructor(opts) {
        if (opts == null || typeof opts !== 'object' || Array.isArray(opts)) {
            throw new FlyqlError(`Column: expected an options object ({ name, type, values? }); got ${typeof opts}`)
        }
        const { name, type, values = null, displayName = '', rawIdentifier = '' } = opts
        if (typeof name !== 'string' || !name) {
            throw new FlyqlError(`Column: 'name' must be a non-empty string`)
        }
        if (typeof type !== 'string') {
            throw new FlyqlError(
                `Column: 'type' must be a raw-type string (e.g. 'String', 'jsonstring'); got ${typeof type}`,
            )
        }

        this.name = escapeIdentifier(name)
        this.values = values || []
        this.displayName = displayName
        this.rawIdentifier = rawIdentifier
        this.matchName = name
        this._rawType = type
        this._flyqlType = normalizeClickHouseType(type)
    }

    rawType() {
        return this._rawType
    }

    flyqlType() {
        return this._flyqlType
    }

    /** @deprecated Pass `rawIdentifier` in the options object to `newColumn()` / `new Column()` instead. Slated for removal in a follow-up. */
    withRawIdentifier(identifier) {
        this.rawIdentifier = identifier
        return this
    }
}

export function newColumn(opts) {
    if (opts == null || typeof opts !== 'object' || Array.isArray(opts)) {
        throw new FlyqlError(`newColumn: expected an options object ({ name, type, values? }); got ${typeof opts}`)
    }
    return new Column(opts)
}
