# <img src="docs/public/icons/flyql.svg" width="28" height="28" style="vertical-align: middle;" /> FlyQL

[![Tests](https://github.com/iamtelescope/flyql/actions/workflows/test.yml/badge.svg)](https://github.com/iamtelescope/flyql/actions/workflows/test.yml)
[![E2E](https://github.com/iamtelescope/flyql/actions/workflows/e2e.yml/badge.svg)](https://github.com/iamtelescope/flyql/actions/workflows/e2e.yml)
[![npm](https://img.shields.io/npm/v/flyql)](https://www.npmjs.com/package/flyql)
[![PyPI](https://img.shields.io/pypi/v/flyql)](https://pypi.org/project/flyql/)
[![Go](https://img.shields.io/github/v/tag/iamtelescope/flyql?filter=golang*)](https://pkg.go.dev/github.com/iamtelescope/flyql/golang)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A lightweight, injection-proof query language that parses human-readable filter expressions into a portable AST, transpiles to SQL across ClickHouse, PostgreSQL, and StarRocks, evaluates in-memory, and ships with a Vue 3 editor — with full cross-language parity in Go, Python, and JavaScript.

> **Pre-1.0 notice** — FlyQL is actively preparing for a stable 1.0.0 release. Until then, minor versions may contain breaking changes to the public API.

## Installation

**Go:**
```bash
go get github.com/iamtelescope/flyql/golang
```

**Python:**
```bash
pip install flyql
# or
uv add flyql
```

**JavaScript:**
```bash
npm install flyql
```

## Quick Start

**Python:**
```python
from flyql import parse
from flyql.generators.clickhouse.generator import to_sql_where
from flyql.generators.clickhouse.column import Column

result = parse("status >= 400 and host like 'prod%'")

columns = {
    "status": Column("status", "UInt32"),
    "host": Column("host", "String"),
}

sql = to_sql_where(result.root, columns)
```

**JavaScript:**
```javascript
import { parse } from 'flyql'
import { generateWhere, newColumn } from 'flyql/generators/clickhouse'

const result = parse("status >= 400 and host like 'prod%'")

const columns = {
    status: newColumn({ name: 'status', type: 'UInt32' }),
    host: newColumn({ name: 'host', type: 'String' }),
}

const sql = generateWhere(result.root, columns)
```

**Go:**
```go
import (
	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/generators/clickhouse"
)

result, err := flyql.Parse("status >= 400 and host like 'prod%'")

columns := map[string]*clickhouse.Column{
	"status": clickhouse.NewColumn(clickhouse.ColumnDef{Name: "status", Type: "UInt32"}),
	"host":   clickhouse.NewColumn(clickhouse.ColumnDef{Name: "host", Type: "String"}),
}

sql, err := clickhouse.ToSQLWhere(result.Root, columns)
```

## Basic Query Structure

A query consists of one or more conditions connected by boolean operators (**and**, **or**, **not**). Conditions can be comparisons or truthy checks.

```sql
status=200 and active and not archived
```

More examples:
```sql
-- comparisons with or
service!=api or user="john doe"

-- regex match and negation
message~"error.*" and not debug

-- grouped conditions
(a=1 or b=2) and not (c=3 and d=4)

-- list membership
status in [200, 201] and method not in ['DELETE', 'PUT']

-- temporal functions
timestamp > ago(1h) and level = 'error'

-- timezone-aware date
date = today('Europe/Berlin')

-- start of week
created_at > startOf('week')
```

For more examples, see the [E2E report](https://flyql.dev/e2e-report/).

## Syntax

### Operators

FlyQL supports the following comparison operators:

| Operator | Syntax |
|----------|--------|
| Equals | `=` |
| Not equals | `!=` |
| Regex match | `~` |
| Not regex match | `!~` |
| Greater than | `>` |
| Less than | `<` |
| Greater or equal | `>=` |
| Less or equal | `<=` |
| In list | `in` |
| Not in list | `not in` |
| Like pattern | `like` |
| Not like pattern | `not like` |
| Case-insensitive like | `ilike` |
| Case-insensitive not like | `not ilike` |

### List Operators

Use `in` and `not in` to check if a value is in a list:

```sql
status in [200, 201, 204]
env not in ['prod', 'staging']
```

Rules:
- Values are enclosed in square brackets `[]` and separated by commas
- Values can be mixed types: `[200, 'ok', true, null]`
- String values must be quoted: `['a', 'b']`
- Number values are unquoted: `[1, 2, 3]`
- Empty list `[]` is allowed (`in []` is always false, `not in []` is always true)

### Like Operators

Use `like` and `ilike` for SQL-style pattern matching:

```sql
-- starts with "error"
message like 'error%'

-- contains "prod"
host like '%prod%'

-- _ matches any single character
path like '/api/_/status'

-- case-insensitive
message ilike '%Error%'

-- negated
host not like 'test%'
```

Wildcards:
- `%` matches any sequence of characters (including empty)
- `_` matches exactly one character
- `\%` and `\_` match literal `%` and `_`

### Truthy Checks

A standalone key without an operator checks if the field has a truthy value:

```sql
active
message and status
```

A value is considered **falsy** if it is:
- `null` / `None` / missing
- Empty string `""`
- Zero `0`
- Boolean `false`

Everything else is **truthy**.

### Negation Operator

Use `not` to negate any expression:

```sql
-- field is falsy
not active

-- status is not 200
not status=200

-- negates the grouped expression
not (a=1 and b=2)

-- combine with other conditions
active and not archived
```

Double negation cancels out: `not not active` is equivalent to `active`.

### Boolean Operators and Parentheses
- **Boolean operators** - Use `and` to require all conditions to be true and `or` to allow for either condition.
- **Negation** - Use `not` before any expression to negate it.
- **Parentheses** - Use `(` and `)` to group conditions and set the precedence of operations (parentheses must be matched on both sides to avoid errors).

### Temporal Functions

FlyQL supports temporal function calls as values for time-relative filters:

```sql
-- last 1 hour
timestamp > ago(1h)

-- compound: 1 hour 30 minutes
timestamp > ago(1h30m)

-- before current time
updated_at < now()

-- today's date
date = today()

-- today in timezone
date = today('Europe/Berlin')

-- start of today
created_at > startOf('day')

-- Monday 00:00
created_at > startOf('week')

-- first of month
created_at > startOf('month', 'UTC')
```

- **Duration units:** `s` (seconds), `m` (minutes), `h` (hours), `d` (days), `w` (weeks)
- **Timezones:** IANA timezone names (e.g., `'Europe/Berlin'`, `'Asia/Tokyo'`)
- **Operators:** Only comparison operators (`=`, `!=`, `>`, `>=`, `<`, `<=`) work with functions
- **Bare names:** `field=ago` (no parens) is a column reference, not a function

### Nested Keys

Use dot-separated paths to access nested fields in JSON, Map, or structured data:

```sql
request.url = "/api/users"
response.headers.content_type = "application/json"
metadata.labels.env = prod
```

When a key segment itself contains a dot, wrap it in quotes so the dot is not treated as a separator:

```sql
"app.config".debug = true
metadata."dotted.key".value = 123
```

Nested keys work with all operators:

```sql
request.status >= 400 and response.body ~ "error" and not request.internal
```

### Transformers

Transformers modify column values before comparison using the pipe (`|`) syntax. They can be chained left-to-right:

```sql
-- convert to uppercase before comparing
message|upper = "ERROR"

-- chain multiple transformers
message|lower|len > 100
```

Built-in transformers:

| Transformer | Input | Output | Example |
|-------------|-------|--------|---------|
| `upper` | string | string | `name\|upper = "ALICE"` |
| `lower` | string | string | `name\|lower = "alice"` |
| `len` | string | int | `message\|len > 100` |
| `split(delimiter)` | string | array | `path\|split("/")` |

### General Query Syntax Rules
- **Standalone keys** - A key without an operator is treated as a truthy check.
- **Comparisons** - A key with an operator must have a corresponding value.
- **Spaces** - Spaces around operators are allowed (`status=200` and `status = 200` are equivalent).

### Handling values
- **Without spaces** - If the value contains no spaces, you can write it directly (e.g., `status=200`).
- **With spaces** - If the value includes spaces, enclose it in single (`'`) or double (`"`) quotes (e.g., `user="John Doe"` or `user='John Doe'`).
- **Escaping quotes** - If the value itself contains quotes, these must be properly escaped (e.g. `user='John\'s Doe'`).

## Compatibility

| | Supported Versions |
|---|---|
| **Go** | 1.21+ |
| **Python** | 3.10+ |
| **Node.js** | 16+ |

**SQL Dialects:** ClickHouse, PostgreSQL, StarRocks

## Editor

FlyQL ships with a Vue 3 editor component that provides syntax highlighting, autocomplete, and schema-driven value suggestions:

```javascript
import { FlyqlEditor } from 'flyql-vue'
import 'flyql-vue/flyql.css'
```

```html
<FlyqlEditor v-model="query" :columns="columns" :dark="true" @submit="onSubmit" />
```

See the [editor documentation](https://docs.flyql.dev/editor/) for the full API reference.

## Documentation

Full documentation: [docs.flyql.dev](https://docs.flyql.dev)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines and requirements.

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## License

MIT
