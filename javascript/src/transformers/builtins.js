import { ArgSpec, Transformer, TransformerType } from './base.js'

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

export class SplitTransformer extends Transformer {
    get name() {
        return 'split'
    }

    get inputType() {
        return TransformerType.STRING
    }

    get outputType() {
        return TransformerType.ARRAY
    }

    get argSchema() {
        return [new ArgSpec(TransformerType.STRING, false)]
    }

    sql(dialect, columnRef, args = []) {
        const delimiter = args[0] || ','
        const escaped = "'" + delimiter.replace(/'/g, "\\'") + "'"
        if (dialect === 'clickhouse') {
            if (delimiter.length === 1) {
                return `splitByChar(${escaped}, ${columnRef})`
            }
            return `splitByString(${escaped}, ${columnRef})`
        }
        if (dialect === 'starrocks') {
            return `SPLIT(${columnRef}, ${escaped})`
        }
        return `STRING_TO_ARRAY(${columnRef}, ${escaped})`
    }

    apply(value, args = []) {
        const delimiter = args[0] || ','
        return String(value).split(delimiter)
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
