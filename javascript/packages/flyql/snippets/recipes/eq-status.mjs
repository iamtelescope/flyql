// Filter records where status field is exactly 200.
//
// FlyQL query: status = 200

import { parse } from 'flyql'
import { generateWhere, newColumn } from 'flyql/generators/clickhouse'

const result = parse('status = 200')

const columns = {
    status: newColumn({ name: 'status', type: 'UInt32' }),
}

const sql = generateWhere(result.root, columns)
console.log(sql)
