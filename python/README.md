# FlyQL

A lightweight, injection-proof query language that parses human-readable filter expressions into a portable AST, transpiles to SQL across ClickHouse, PostgreSQL, and StarRocks, and evaluates in-memory.

## Installation

```bash
pip install flyql
```

Requires Python 3.10+.

## Quick Start

### Parse a query

```python
from flyql import parse

result = parse("status = 200 and active")
print(result.root)
```

### Generate SQL

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
print(sql)
```

Generators are available for ClickHouse, PostgreSQL, and StarRocks:

```python
from flyql.generators.clickhouse.generator import to_sql_where
from flyql.generators.postgresql.generator import to_sql_where
from flyql.generators.starrocks.generator import to_sql_where
```

### Match in-memory data

```python
from flyql import parse
from flyql.matcher import Evaluator, Record

result = parse("status = 200 and active")

data = {
    "status": 200,
    "active": True,
    "host": "prod-api-01",
}

evaluator = Evaluator()
matches = evaluator.evaluate(result.root, Record(data))
print(f"Matches: {matches}")  # True
```

### Transformers

```python
from flyql import parse
from flyql.generators.clickhouse.generator import to_sql_where
from flyql.generators.clickhouse.column import Column

result = parse("message|upper = 'ERROR'")

columns = {"message": Column("message", "String")}
sql = to_sql_where(result.root, columns)
print(sql)  # equals(upper(message), 'ERROR')
```

### Column parsing

```python
from flyql.columns import parse, parse_to_json

parsed = parse("message, status")
for col in parsed:
    print(f"{col.name} (display: {col.display_name!r}, segments: {col.segments})")

# Enable transformers
with_transforms = parse(
    "message|chars(25) as msg, status", capabilities={"transformers": True}
)

# Serialize to JSON
json_str = parse_to_json("message, status|upper", capabilities={"transformers": True})
print(json_str)
```

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
