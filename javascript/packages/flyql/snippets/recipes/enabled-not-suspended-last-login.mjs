// Filter accounts that are enabled, not suspended, and have a last_login set.
//
// FlyQL query: enabled and not suspended and last_login
//
// All three terms use truthy/falsy semantics: a bare key (no operator, no
// value) means "this field is truthy". `not suspended` flips the truthy check
// into a falsy check.

import { parse } from 'flyql'
import { generateWhere, newColumn } from 'flyql/generators/clickhouse'

const result = parse('enabled and not suspended and last_login')

const columns = {
    enabled: newColumn({ name: 'enabled', type: 'Bool' }),
    suspended: newColumn({ name: 'suspended', type: 'Bool' }),
    last_login: newColumn({ name: 'last_login', type: 'DateTime' }),
}

const sql = generateWhere(result.root, columns)
console.log(sql)
