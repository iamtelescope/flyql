"""Filter records by price greater than 50.00 and quantity at most 10.

FlyQL query: ``price > 50.00 and quantity <= 10``
"""

from flyql import parse
from flyql.generators.clickhouse.column import Column
from flyql.generators.clickhouse.generator import to_sql_where

result = parse("price > 50.00 and quantity <= 10")

columns = {
    "price": Column("price", "Float64"),
    "quantity": Column("quantity", "UInt32"),
}

sql = to_sql_where(result.root, columns)
print(sql)
