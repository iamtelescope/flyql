import { parse } from 'flyql'
import { generateWhere, newColumn } from 'flyql/generators/clickhouse'

const result = parse("status >= 400 and host like 'prod%'")

const columns = {
    status: newColumn('status', 'UInt32'),
    host: newColumn('host', 'String'),
}

const sql = generateWhere(result.root, columns)
console.log(sql)
