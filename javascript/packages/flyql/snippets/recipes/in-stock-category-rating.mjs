// Filter products that are in stock, in selected categories, with high rating.
//
// FlyQL query:
//   in_stock and category in ['electronics', 'appliances'] and rating > 4.5
//
// Combines truthy (in_stock), list membership (in [...]), and a numeric
// comparison in a single query.

import { parse } from 'flyql'
import { generateWhere, newColumn } from 'flyql/generators/clickhouse'

const result = parse("in_stock and category in ['electronics', 'appliances'] and rating > 4.5")

const columns = {
    in_stock: newColumn({ name: 'in_stock', type: 'Bool' }),
    category: newColumn({ name: 'category', type: 'String' }),
    rating: newColumn({ name: 'rating', type: 'Float64' }),
}

const sql = generateWhere(result.root, columns)
console.log(sql)
