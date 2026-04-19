"""Filter products that are in stock, in selected categories, with high rating.

FlyQL query: ``in_stock and category in ['electronics', 'appliances'] and rating > 4.5``

Combines truthy (``in_stock``), list membership (``in [...]``), and a numeric
comparison in a single query.
"""

from flyql import parse
from flyql.generators.clickhouse.column import Column
from flyql.generators.clickhouse.generator import to_sql_where

result = parse(
    "in_stock and category in ['electronics', 'appliances'] and rating > 4.5"
)

columns = {
    "in_stock": Column("in_stock", "Bool"),
    "category": Column("category", "String"),
    "rating": Column("rating", "Float64"),
}

sql = to_sql_where(result.root, columns)
print(sql)
