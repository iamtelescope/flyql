import { Transformer, TransformerType } from './base.js'

export class UpperTransformer extends Transformer {
    get name() {
        return 'upper'
    }

    get inputType() {
        return TransformerType.STRING
    }

    get outputType() {
        return TransformerType.STRING
    }

    sql(dialect, columnRef) {
        if (dialect === 'clickhouse') {
            return `upper(${columnRef})`
        }
        return `UPPER(${columnRef})`
    }

    apply(value) {
        return String(value).toUpperCase()
    }
}

export class LowerTransformer extends Transformer {
    get name() {
        return 'lower'
    }

    get inputType() {
        return TransformerType.STRING
    }

    get outputType() {
        return TransformerType.STRING
    }

    sql(dialect, columnRef) {
        if (dialect === 'clickhouse') {
            return `lower(${columnRef})`
        }
        return `LOWER(${columnRef})`
    }

    apply(value) {
        return String(value).toLowerCase()
    }
}

export class LenTransformer extends Transformer {
    get name() {
        return 'len'
    }

    get inputType() {
        return TransformerType.STRING
    }

    get outputType() {
        return TransformerType.INT
    }

    sql(dialect, columnRef) {
        if (dialect === 'clickhouse') {
            return `length(${columnRef})`
        }
        return `LENGTH(${columnRef})`
    }

    apply(value) {
        return String(value).length
    }
}
