"""Filter messages that match (case-insensitive) 'error' but not 'warning'.

FlyQL query: ``message ~ "(?i)error" and message !~ "(?i)warning"``

The ``~`` operator is regex match; ``!~`` is regex non-match. The ``(?i)`` inline
flag enables case-insensitive matching.
"""

from flyql import parse
from flyql.generators.clickhouse.column import Column
from flyql.generators.clickhouse.generator import to_sql_where

result = parse('message ~ "(?i)error" and message !~ "(?i)warning"')

columns = {
    "message": Column("message", "String"),
}

sql = to_sql_where(result.root, columns)
print(sql)
