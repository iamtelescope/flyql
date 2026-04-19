// Filter messages that match (case-insensitive) 'error' but not 'warning'.
//
// FlyQL query: message ~ "(?i)error" and message !~ "(?i)warning"
//
// The `~` operator is regex match; `!~` is regex non-match. The `(?i)` inline
// flag enables case-insensitive matching.

import { parse } from 'flyql'
import { generateWhere, newColumn } from 'flyql/generators/clickhouse'

const result = parse('message ~ "(?i)error" and message !~ "(?i)warning"')

const columns = {
    message: newColumn({ name: 'message', type: 'String' }),
}

const sql = generateWhere(result.root, columns)
console.log(sql)
