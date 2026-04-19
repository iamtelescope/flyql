// Demonstrate IN-list type validation across three cases.
//
// FlyQL parsers always accept heterogeneous lists. SQL generators run a
// type-consistency check ONLY when (a) the column has a declared type, (b) the
// key is not segmented, and (c) the list is homogeneous. Heterogeneous lists
// bypass the check at the call site and pass through.
//
// Three demonstrated cases:
//   (a) Homogeneous list matching column type — SQL is generated.
//   (b) Heterogeneous list against a typed column — SQL is generated (validator
//       is skipped because the values_types set has more than one entry).
//   (c) Homogeneous list with the wrong element type — error is thrown with
//       the canonical message "type mismatch in IN list: ...".

import { parse } from 'flyql'
import { generateWhere, newColumn } from 'flyql/generators/clickhouse'

const columns = {
    category: newColumn({ name: 'category', type: 'String' }),
    status: newColumn({ name: 'status', type: 'UInt32' }),
}

// (a) Homogeneous list matching column type — SQL is generated.
console.log('(a)', generateWhere(parse("category in ['electronics', 'appliances']").root, columns))

// (b) Heterogeneous list — validator is skipped, SQL is generated.
console.log('(b)', generateWhere(parse("status in [200, 'ok', 404]").root, columns))

// (c) Homogeneous wrong-type list — error is thrown.
try {
    generateWhere(parse("status in ['ok', 'fail']").root, columns)
} catch (err) {
    if (err.message.includes('type mismatch in IN list:')) {
        console.log('(c)', err.message)
    } else {
        throw err
    }
}
