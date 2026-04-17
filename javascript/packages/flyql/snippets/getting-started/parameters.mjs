import { parse, bindParams } from 'flyql'
import { generateWhere, newColumn } from 'flyql/generators/clickhouse'

// Parse a query with parameter placeholders
const result = parse("status = $code and env in [$env, 'staging']")

// Bind concrete values to the parameters
bindParams(result.root, { code: 200, env: 'prod' })

// Generate SQL
const columns = {
    status: newColumn({ name: 'status', type: 'Int32' }),
    env: newColumn({ name: 'env', type: 'String' }),
}
const sql = generateWhere(result.root, columns)
console.log(sql)
