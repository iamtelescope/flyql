"""Filter pending tasks that are either past due or urgent.

FlyQL query: ``pending and (due_date < '2023-12-31' or priority = 'urgent')``

Date comparisons use ISO-8601 string literals; ClickHouse, PostgreSQL, and
StarRocks all coerce them to DATE/DATETIME values. See ``syntax/dates`` for
when to use string literals versus temporal functions like ``ago(...)``.
"""

from flyql import parse
from flyql.generators.clickhouse.column import Column
from flyql.generators.clickhouse.generator import to_sql_where

result = parse("pending and (due_date < '2023-12-31' or priority = 'urgent')")

columns = {
    "pending": Column("pending", "Bool"),
    "due_date": Column("due_date", "Date"),
    "priority": Column("priority", "String"),
}

sql = to_sql_where(result.root, columns)
print(sql)
