"""Filter active records that are either high priority or critical severity.

FlyQL query: ``active and (priority = 'high' or severity = 'critical')``
"""

from flyql import parse
from flyql.generators.clickhouse.column import Column
from flyql.generators.clickhouse.generator import to_sql_where

result = parse("active and (priority = 'high' or severity = 'critical')")

columns = {
    "active": Column("active", "Bool"),
    "priority": Column("priority", "String"),
    "severity": Column("severity", "String"),
}

sql = to_sql_where(result.root, columns)
print(sql)
