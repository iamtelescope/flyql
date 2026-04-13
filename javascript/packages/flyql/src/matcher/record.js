import { parseKey } from '../core/key.js'

function isProbablyJSONString(value) {
    if (typeof value !== 'string') return false
    if (value.startsWith('{') && value.endsWith('}')) return true
    if (value.startsWith('[') && value.endsWith(']')) return true
    return false
}

function extractPath(value, path) {
    let current = value
    for (const key of path) {
        if (current === null || current === undefined || typeof current !== 'object') return null
        if (Array.isArray(current)) {
            const idx = parseInt(key, 10)
            if (isNaN(idx) || idx < 0 || idx >= current.length) return null
            current = current[idx]
        } else {
            if (!(key in current)) return null
            current = current[key]
        }
    }
    return current
}

export class Record {
    constructor(data) {
        this.data = data
    }

    getValue(rawKey) {
        const key = parseKey(rawKey)
        const rootKey = key.segments[0]
        const path = key.segments.slice(1)

        const value = this.data[rootKey]
        if (value === undefined) return null

        if (path.length === 0) return value

        if (isProbablyJSONString(value)) {
            try {
                const parsed = JSON.parse(value)
                return extractPath(parsed, path)
            } catch {
                return null
            }
        }

        if (typeof value === 'object' && value !== null) {
            return extractPath(value, path)
        }

        return null
    }
}
