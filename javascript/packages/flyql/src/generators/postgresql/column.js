import { Type } from '../../flyql_type.js'
import { FlyqlError } from '../../core/exceptions.js'

const typeRegexes = {
    [Type.String]: /^(varchar|char|character varying|character)\s*\(\s*\d+\s*\)/i,
    [Type.Float]: /^(numeric|decimal)\s*\(\s*\d+\s*(,\s*\d+)?\s*\)/i,
    [Type.Date]: /^timestamp\s*\(\s*\d+\s*\)/i,
    [Type.Array]: /(\[\]$|^_)/i,
}

const flyqlTypeToPostgreSQLTypes = {
    [Type.String]: new Set([
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
    [Type.Int]: new Set([
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
    [Type.Float]: new Set(['real', 'double precision', 'numeric', 'decimal', 'float4', 'float8', 'money']),
    [Type.Bool]: new Set(['boolean', 'bool']),
    [Type.Date]: new Set([
        'date',
        'timestamp',
        'timestamptz',
        'timestamp without time zone',
        'timestamp with time zone',
        'time',
        'timetz',
    ]),
    [Type.Duration]: new Set(['interval']),
    [Type.JSON]: new Set(['jsonb', 'json']),
    [Type.Map]: new Set(['hstore']),
}

export function normalizePostgreSQLType(pgType) {
    if (!pgType) return Type.Unknown

    const normalized = pgType.trim().toLowerCase()

    if (normalized === 'jsonstring') return Type.JSONString

    if (typeRegexes[Type.Array].test(normalized)) return Type.Array

    if (typeRegexes[Type.String].test(normalized)) return Type.String
    if (flyqlTypeToPostgreSQLTypes[Type.String].has(normalized)) return Type.String

    if (flyqlTypeToPostgreSQLTypes[Type.Int].has(normalized)) return Type.Int

    if (typeRegexes[Type.Float].test(normalized)) return Type.Float
    if (flyqlTypeToPostgreSQLTypes[Type.Float].has(normalized)) return Type.Float

    if (flyqlTypeToPostgreSQLTypes[Type.Bool].has(normalized)) return Type.Bool

    if (typeRegexes[Type.Date].test(normalized)) return Type.Date
    if (flyqlTypeToPostgreSQLTypes[Type.Date].has(normalized)) return Type.Date

    if (flyqlTypeToPostgreSQLTypes[Type.Duration].has(normalized)) return Type.Duration

    if (flyqlTypeToPostgreSQLTypes[Type.JSON].has(normalized)) return Type.JSON

    if (flyqlTypeToPostgreSQLTypes[Type.Map].has(normalized)) return Type.Map

    return Type.Unknown
}

/**
 * Opaque PostgreSQL-dialect Column. Construct via `newColumn({...})` or `new Column({...})`.
 * The flyql semantic type is computed at construction via `normalizePostgreSQLType`.
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
                `Column: 'type' must be a raw-type string (e.g. 'text', 'jsonstring'); got ${typeof type}`,
            )
        }

        this.name = name
        this.values = values || []
        this.displayName = displayName
        this.rawIdentifier = rawIdentifier
        this.matchName = name
        this._rawType = type
        this._flyqlType = normalizePostgreSQLType(type)
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
