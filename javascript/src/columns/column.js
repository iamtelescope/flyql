export class ParsedColumn {
    constructor(name, modifiers, alias, key = null) {
        this.name = name
        this.modifiers = modifiers
        this.alias = alias
        this.key = key
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
            modifiers: this.modifiers,
            alias: this.alias,
            segments: this.segments,
            is_segmented: this.isSegmented,
        }
    }
}
