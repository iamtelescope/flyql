# FlyQL

A lightweight, injection-proof query language that parses human-readable filter expressions into a portable AST, transpiles to SQL across ClickHouse, PostgreSQL, and StarRocks, evaluates in-memory, and ships with a Vue 3 editor.

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
    status: newColumn("status", false, "UInt32", null),
    host: newColumn("host", false, "String", null),
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

const columns = { message: newColumn('message', false, 'String') }
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

### Vue 3 Editor

```javascript
import { EditorEngine } from 'flyql/editor'
import 'flyql/editor/flyql.css'
```

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
| `flyql/editor` | Vue 3 editor component |
| `flyql/highlight` | Syntax highlighting |

## Query Syntax

Queries consist of conditions connected by boolean operators (`and`, `or`, `not`):

```
status=200 and active and not archived
service!=api or user="john doe"
message~"error.*" and not debug
(a=1 or b=2) and not (c=3 and d=4)
status in [200, 201] and method not in ['DELETE', 'PUT']
```

### Operators

| Operator | Syntax |
|---|---|
| Equals | `=` |
| Not equals | `!=` |
| Regex match | `~` |
| Not regex match | `!~` |
| Greater than | `>` |
| Less than | `<` |
| Greater or equals | `>=` |
| Less or equals | `<=` |
| In list | `in` |
| Not in list | `not in` |
| Like | `like` |
| Not like | `not like` |
| Case-insensitive like | `ilike` |
| Case-insensitive not like | `not ilike` |

## Documentation

Full documentation: [docs.flyql.dev](https://docs.flyql.dev)

## License

MIT
