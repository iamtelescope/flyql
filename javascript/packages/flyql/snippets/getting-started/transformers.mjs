import { parse } from 'flyql'
import { generateWhere, newColumn } from 'flyql/generators/clickhouse'

// Parse a transformer query
const result = parse("message|upper = 'ERROR'")

// Generate SQL for ClickHouse
const columns = { message: newColumn('message', 'String') }
const sql = generateWhere(result.root, columns)
console.log(sql) // equals(upper(message), 'ERROR')
