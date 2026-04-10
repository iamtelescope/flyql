import { parse } from 'flyql'
import { generateWhere, newColumn } from 'flyql/generators/clickhouse'

const result = parse("status >= 400 and host like 'prod%'")

const columns = {
    status: newColumn("status", false, "UInt32", null),
    host: newColumn("host", false, "String", null),
}

const sql = generateWhere(result.root, columns)
console.log(sql)
