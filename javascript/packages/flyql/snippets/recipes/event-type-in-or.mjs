// Filter records where event_type is either 'login' or 'logout'.
//
// FlyQL query: event_type = 'login' or event_type = 'logout'
//
// Text values like 'login' MUST be quoted; without quotes, FlyQL would treat
// `login` as a column reference. See syntax/values for details.

import { parse } from 'flyql'
import { generateWhere, newColumn } from 'flyql/generators/clickhouse'

const result = parse("event_type = 'login' or event_type = 'logout'")

const columns = {
    event_type: newColumn({ name: 'event_type', type: 'String' }),
}

const sql = generateWhere(result.root, columns)
console.log(sql)
