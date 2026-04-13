import { parse } from '../core/parser.js'
import { Evaluator } from './evaluator.js'
import { Record } from './record.js'

export { Evaluator, Record }

export function match(query, data, registry = null, { defaultTimezone = 'UTC' } = {}) {
    const result = parse(query)
    if (result.error) {
        throw new Error(`parse error: ${result.error}`)
    }
    const evaluator = new Evaluator(registry, { defaultTimezone })
    const record = new Record(data)
    return evaluator.evaluate(result.root, record)
}
