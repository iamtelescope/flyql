// Filter active records that are either high priority or critical severity.
//
// FlyQL query: active and (priority = 'high' or severity = 'critical')

import { parse } from 'flyql'
import { generateWhere, newColumn } from 'flyql/generators/clickhouse'

const result = parse("active and (priority = 'high' or severity = 'critical')")

const columns = {
    active: newColumn({ name: 'active', type: 'Bool' }),
    priority: newColumn({ name: 'priority', type: 'String' }),
    severity: newColumn({ name: 'severity', type: 'String' }),
}

const sql = generateWhere(result.root, columns)
console.log(sql)
