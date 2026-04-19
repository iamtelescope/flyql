// Filter records by price greater than 50.00 and quantity at most 10.
//
// FlyQL query: price > 50.00 and quantity <= 10

import { parse } from 'flyql'
import { generateWhere, newColumn } from 'flyql/generators/clickhouse'

const result = parse('price > 50.00 and quantity <= 10')

const columns = {
    price: newColumn({ name: 'price', type: 'Float64' }),
    quantity: newColumn({ name: 'quantity', type: 'UInt32' }),
}

const sql = generateWhere(result.root, columns)
console.log(sql)
