import { parse } from '../core/parser.js'
import { Evaluator } from './evaluator.js'
import { Record } from './record.js'

export { Evaluator, Record }

export function match(query, data) {
    const result = parse(query)
    if (result.error) {
        throw new Error(`parse error: ${result.error}`)
    }
    const evaluator = new Evaluator()
    const record = new Record(data)
    return evaluator.evaluate(result.root, record)
}
