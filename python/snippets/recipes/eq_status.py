"""Filter records where status field is exactly 200.

FlyQL query: ``status = 200``
"""

from flyql import parse
from flyql.generators.clickhouse.column import Column
from flyql.generators.clickhouse.generator import to_sql_where

result = parse("status = 200")

columns = {
    "status": Column("status", "UInt32"),
}

sql = to_sql_where(result.root, columns)
print(sql)
