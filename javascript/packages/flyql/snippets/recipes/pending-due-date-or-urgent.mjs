// Filter pending tasks that are either past due or urgent.
//
// FlyQL query: pending and (due_date < '2023-12-31' or priority = 'urgent')
//
// Date comparisons use ISO-8601 string literals; ClickHouse, PostgreSQL, and
// StarRocks all coerce them to DATE/DATETIME values. See syntax/dates for when
// to use string literals versus temporal functions like ago(...).

import { parse } from 'flyql'
import { generateWhere, newColumn } from 'flyql/generators/clickhouse'

const result = parse("pending and (due_date < '2023-12-31' or priority = 'urgent')")

const columns = {
    pending: newColumn({ name: 'pending', type: 'Bool' }),
    due_date: newColumn({ name: 'due_date', type: 'Date' }),
    priority: newColumn({ name: 'priority', type: 'String' }),
}

const sql = generateWhere(result.root, columns)
console.log(sql)
