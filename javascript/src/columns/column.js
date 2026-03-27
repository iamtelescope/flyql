export class ParsedColumn {
    constructor(name, transformers, alias, key = null, displayName = '') {
        this.name = name
        this.transformers = transformers
        this.alias = alias
        this.key = key
        this.displayName = displayName
    }

    get segments() {
        return this.key ? this.key.segments : [this.name]
    }

    get isSegmented() {
        return this.key ? this.key.isSegmented : false
    }

    asDict() {
        return {
            name: this.name,
            transformers: this.transformers,
            alias: this.alias,
            segments: this.segments,
            is_segmented: this.isSegmented,
            display_name: this.displayName,
        }
    }

    asJson() {
        return JSON.stringify(this.asDict())
    }
}
