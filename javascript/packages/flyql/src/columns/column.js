export class ParsedColumn {
    constructor(
        name,
        transformers,
        alias,
        key = null,
        displayName = '',
        { nameRange = null, transformerRanges = null, renderers = null, rendererRanges = null } = {},
    ) {
        this.name = name
        this.transformers = transformers
        this.alias = alias
        this.key = key
        this.displayName = displayName
        this.nameRange = nameRange
        this.transformerRanges = transformerRanges
        this.renderers = renderers || []
        this.rendererRanges = rendererRanges
    }

    get segments() {
        return this.key ? this.key.segments : [this.name]
    }

    get isSegmented() {
        return this.key ? this.key.isSegmented : false
    }

    asDict() {
        const result = {
            name: this.name,
            transformers: this.transformers.map((t) => ({ name: t.name, arguments: t.arguments })),
            alias: this.alias,
            segments: this.segments,
            is_segmented: this.isSegmented,
            display_name: this.displayName,
        }
        if (this.renderers && this.renderers.length > 0) {
            result.renderers = this.renderers.map((r) => ({ name: r.name, arguments: r.arguments }))
        }
        return result
    }

    asJson() {
        return JSON.stringify(this.asDict())
    }
}
