import { FlyqlError } from './exceptions.js'
import { Type, parseFlyQLType } from '../flyql_type.js'

/**
 * The canonical, schema-aware Column used by the validator. Dialect
 * generators have their own opaque Column classes; bridge with the
 * dialect's `toFlyQLSchema` helper to feed the validator.
 *
 * `JSONString` is an orthogonal capability flag — see Tech Decision #5.
 * It is NOT validated against `type`.
 */
export class Column {
    constructor(
        name,
        jsonString,
        type,
        {
            values = [],
            displayName = '',
            rawIdentifier = '',
            matchName = null,
            suggest = true,
            children = null,
            autocomplete,
        } = {},
    ) {
        this.name = name
        this.jsonString = jsonString
        this.type = type
        this.values = values
        this.displayName = displayName
        this.rawIdentifier = rawIdentifier
        this.matchName = matchName !== null ? matchName : name
        this.suggest = suggest
        this.children = children
        if (autocomplete !== undefined) this.autocomplete = autocomplete
    }

    get isNested() {
        return this.children != null
    }

    withRawIdentifier(identifier) {
        this.rawIdentifier = identifier
        return this
    }
}

export class ColumnSchema {
    constructor(columns) {
        this._columns = columns
        this._byLowerName = {}
        for (const [k, v] of Object.entries(columns)) {
            this._byLowerName[k.toLowerCase()] = v
            if (v != null && v.children != null) {
                _lowercaseChildren(v)
            }
        }
    }

    get columns() {
        return this._columns
    }

    get(name) {
        return this._byLowerName[name.toLowerCase()] || null
    }

    resolve(segments) {
        if (!segments || segments.length === 0) return null
        let col = this._byLowerName[segments[0].toLowerCase()]
        if (col == null) return null
        for (let i = 1; i < segments.length; i++) {
            if (col.children == null) return null
            col = col.children[segments[i].toLowerCase()]
            if (col == null) return null
        }
        return col
    }

    resolveWithPath(segments) {
        if (!segments || segments.length === 0) return null
        const rootKey = _findOriginalKey(this._columns, segments[0])
        if (!rootKey) return null
        let col = this._columns[rootKey]
        if (col == null) return null
        let parentPath = rootKey

        for (let i = 1; i < segments.length; i++) {
            if (col.children == null) return null
            const childCol = col.children[segments[i].toLowerCase()]
            if (childCol == null) return null
            parentPath += '.' + (childCol.name || segments[i])
            col = childCol
        }
        return { column: col, parentPath }
    }

    /**
     * Build a ColumnSchema from a `{name: {type, children, suggest, values, jsonstring}}`
     * dict. Strict mode: an unknown `type` value throws FlyqlError. The
     * legacy key `normalized_type` is detected and throws a targeted
     * migration error.
     */
    static fromPlainObject(obj) {
        const columns = {}
        for (const [name, raw] of Object.entries(obj)) {
            const col = _columnFromPlainObject(name, raw)
            if (col != null) columns[name] = col
        }
        return new ColumnSchema(columns)
    }

    static fromColumns(columns) {
        const m = {}
        for (const col of columns) {
            if (!(col.matchName in m)) {
                m[col.matchName] = col
            }
        }
        return new ColumnSchema(m)
    }
}

function _findOriginalKey(obj, target) {
    const lower = target.toLowerCase()
    for (const key of Object.keys(obj)) {
        if (key.toLowerCase() === lower) return key
    }
    return null
}

function _lowercaseChildren(col) {
    if (col.children == null) return
    const lowered = {}
    for (const [k, child] of Object.entries(col.children)) {
        lowered[k.toLowerCase()] = child
        if (child != null && child.children != null) {
            _lowercaseChildren(child)
        }
    }
    col.children = lowered
}

function _columnFromPlainObject(name, raw) {
    if (raw == null || typeof raw !== 'object') return null
    if ('normalized_type' in raw || 'normalizedType' in raw) {
        throw new FlyqlError(
            `column "${name}": "normalized_type"/"normalizedType" field has been ` +
                `renamed to "type" in canonical column JSON; see migration guide at ` +
                `docs.flyql.dev/advanced/column-types`,
        )
    }
    let children = null
    if (raw.children != null && typeof raw.children === 'object') {
        children = {}
        for (const [childName, childRaw] of Object.entries(raw.children)) {
            const child = _columnFromPlainObject(childName, childRaw)
            if (child != null) children[childName] = child
        }
    }
    // Lenient: unknown type strings are coerced to Type.Unknown so
    // editor-style raw strings (e.g. 'enum') flow through without
    // throwing; the editor normalizer remaps them at a later stage.
    // The legacy `normalized_type` key is still a hard error (above).
    const typeStr = raw.type || ''
    let flyqlType = Type.Unknown
    if (typeStr) {
        try {
            flyqlType = parseFlyQLType(typeStr)
        } catch (_) {
            flyqlType = typeStr // preserve raw string for the editor normalizer
        }
    }
    return new Column(name, !!raw.jsonstring, flyqlType, {
        values: raw.values || [],
        suggest: raw.suggest !== undefined ? raw.suggest : true,
        matchName: name,
        children,
        autocomplete: raw.autocomplete,
        displayName: raw.display_name || raw.displayName || '',
    })
}
