import { Type } from '../../flyql_type.js'
import { FlyqlError } from '../../core/exceptions.js'

const typeRegexes = {
    [Type.String]: /^(varchar|char|string)\s*\(\s*\d+\s*\)/i,
    [Type.Int]: /^(tinyint|smallint|int|largeint|bigint)\s*\(\s*\d+\s*\)/i,
    [Type.Float]: /^(decimal|float|double)\d*\s*\(\s*\d+\s*(,\s*\d+)?\s*\)/i,
    [Type.Date]: /^datetime/i,
    [Type.Array]: /^array\s*</i,
    [Type.Map]: /^map\s*</i,
    [Type.Struct]: /^struct\s*</i,
    [Type.JSON]: /^json/i,
}

const flyqlTypeToStarRocksTypes = {
    [Type.String]: new Set(['string', 'varchar', 'char', 'binary', 'varbinary']),
    [Type.Int]: new Set(['int', 'tinyint', 'smallint', 'largeint', 'bigint']),
    [Type.Float]: new Set(['float', 'double', 'decimal']),
    [Type.Bool]: new Set(['bool', 'boolean']),
    [Type.Date]: new Set(['date', 'datetime']),
    [Type.Unknown]: new Set(['bitmap', 'hll']),
    [Type.JSON]: new Set(['json']),
}

export function normalizeStarRocksType(srType) {
    if (!srType) return Type.Unknown
    const normalized = srType.trim().toLowerCase()

    if (normalized === 'jsonstring') return Type.JSONString

    if (typeRegexes[Type.String].test(normalized)) return Type.String
    if (flyqlTypeToStarRocksTypes[Type.String].has(normalized)) return Type.String

    if (typeRegexes[Type.Int].test(normalized)) return Type.Int
    if (flyqlTypeToStarRocksTypes[Type.Int].has(normalized)) return Type.Int

    if (typeRegexes[Type.Float].test(normalized)) return Type.Float
    if (flyqlTypeToStarRocksTypes[Type.Float].has(normalized)) return Type.Float

    if (flyqlTypeToStarRocksTypes[Type.Bool].has(normalized)) return Type.Bool

    if (typeRegexes[Type.Date].test(normalized)) return Type.Date
    if (flyqlTypeToStarRocksTypes[Type.Date].has(normalized)) return Type.Date

    if (typeRegexes[Type.JSON].test(normalized)) return Type.JSON
    if (flyqlTypeToStarRocksTypes[Type.JSON].has(normalized)) return Type.JSON

    if (typeRegexes[Type.Array].test(normalized)) return Type.Array
    if (typeRegexes[Type.Map].test(normalized)) return Type.Map
    if (typeRegexes[Type.Struct].test(normalized)) return Type.Struct

    if (flyqlTypeToStarRocksTypes[Type.Unknown].has(normalized)) return Type.Unknown

    return Type.Unknown
}

/**
 * Opaque StarRocks-dialect Column. Construct via `newColumn({...})` or `new Column({...})`.
 * The flyql semantic type is computed at construction via `normalizeStarRocksType`.
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
                `Column: 'type' must be a raw-type string (e.g. 'VARCHAR', 'jsonstring'); got ${typeof type}`,
            )
        }

        this.name = name
        this.values = values || []
        this.displayName = displayName
        this.rawIdentifier = rawIdentifier
        this.matchName = name
        this._rawType = type
        this._flyqlType = normalizeStarRocksType(type)
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
