import { TransformerType } from '../transformers/base.js'

export class Column {
    constructor(
        name,
        jsonString,
        type,
        normalizedType,
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
        this.normalizedType = normalizedType
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
            // Children are lowercased internally, but we need canonical path
            // Look up in the original columns for canonical casing
            const childCol = col.children[segments[i].toLowerCase()]
            if (childCol == null) return null
            parentPath += '.' + (childCol.name || segments[i])
            col = childCol
        }
        return { column: col, parentPath }
    }

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
    let children = null
    if (raw.children != null && typeof raw.children === 'object') {
        children = {}
        for (const [childName, childRaw] of Object.entries(raw.children)) {
            const child = _columnFromPlainObject(childName, childRaw)
            if (child != null) children[childName] = child
        }
    }
    return new Column(name, false, raw.type || '', raw.normalizedType || null, {
        values: raw.values || [],
        suggest: raw.suggest !== undefined ? raw.suggest : true,
        matchName: name,
        children,
        autocomplete: raw.autocomplete,
        displayName: raw.display_name || raw.displayName || '',
    })
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
