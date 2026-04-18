# flyql

A lightweight, injection-proof query language that parses human-readable filter expressions into a portable AST, transpiles to SQL across ClickHouse, PostgreSQL, and StarRocks, and evaluates in-memory.

## Installation

```bash
npm install flyql
# or
pnpm add flyql
```

Requires Node.js 16+.

## Quick Start

### Parse a query

```javascript
import { parse } from 'flyql'

const result = parse("status = 200 and active")
console.log(result.root)
```

### Generate SQL

```javascript
import { parse } from 'flyql'
import { generateWhere, newColumn } from 'flyql/generators/clickhouse'

const result = parse("status >= 400 and host like 'prod%'")

const columns = {
    status: newColumn({ name: 'status', type: 'UInt32' }),
    host: newColumn({ name: 'host', type: 'String' }),
}

const sql = generateWhere(result.root, columns)
console.log(sql)
```

Generators are available for ClickHouse, PostgreSQL, and StarRocks:

```javascript
import { generateWhere, newColumn } from 'flyql/generators/clickhouse'
import { generateWhere, newColumn } from 'flyql/generators/postgresql'
import { generateWhere, newColumn } from 'flyql/generators/starrocks'
```

### Match in-memory data

```javascript
import { match } from 'flyql/matcher'

const data = {
    status: 200,
    active: true,
    host: "prod-api-01",
}

const matches = match("status = 200 and active", data)
console.log(`Matches: ${matches}`) // true
```

### Transformers

```javascript
import { parse } from 'flyql'
import { generateWhere, newColumn } from 'flyql/generators/clickhouse'

const result = parse("message|upper = 'ERROR'")

const columns = { message: newColumn({ name: 'message', type: 'String' }) }
const sql = generateWhere(result.root, columns)
console.log(sql) // equals(upper(message), 'ERROR')
```

### Column parsing

```javascript
import { parse, parseToJson } from 'flyql/columns'

const parsed = parse("message, status")
for (const col of parsed) {
    console.log(`${col.name} (display: ${JSON.stringify(col.displayName)}, segments: ${col.segments})`)
}

// Enable transformers
const withTransforms = parse("message|chars(25) as msg, status", { transformers: true })

// Serialize to JSON
const json = parseToJson("message, status|upper", { transformers: true })
console.log(json)
```

> The Vue 3 editor ships as a separate package: [`flyql-vue`](https://www.npmjs.com/package/flyql-vue). See docs.flyql.dev for details.

## Package Exports

| Import path | Description |
|---|---|
| `flyql` | Core parser, AST types, transformers |
| `flyql/core` | Parser and AST types only |
| `flyql/matcher` | In-memory query evaluation |
| `flyql/columns` | Column expression parsing |
| `flyql/transformers` | Transformer registry |
| `flyql/generators/clickhouse` | ClickHouse SQL generation |
| `flyql/generators/postgresql` | PostgreSQL SQL generation |
| `flyql/generators/starrocks` | StarRocks SQL generation |
| `flyql/highlight` | Syntax highlighting |

## Links

- Documentation: [docs.flyql.dev](https://docs.flyql.dev)
- Source: [github.com/iamtelescope/flyql](https://github.com/iamtelescope/flyql)
- Issues: [github.com/iamtelescope/flyql/issues](https://github.com/iamtelescope/flyql/issues)

## License

MIT
