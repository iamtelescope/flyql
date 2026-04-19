"""Filter records where event_type is either 'login' or 'logout'.

FlyQL query: ``event_type = 'login' or event_type = 'logout'``

Note: text values like ``'login'`` MUST be quoted. Without quotes, FlyQL would
treat ``login`` as a column reference. See ``syntax/values`` for details.
"""

from flyql import parse
from flyql.generators.clickhouse.column import Column
from flyql.generators.clickhouse.generator import to_sql_where

result = parse("event_type = 'login' or event_type = 'logout'")

columns = {
    "event_type": Column("event_type", "String"),
}

sql = to_sql_where(result.root, columns)
print(sql)
