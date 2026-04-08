from flyql import parse
from flyql.generators.clickhouse.generator import to_sql_where
from flyql.generators.clickhouse.column import Column

result = parse("status >= 400 and host = prod*")

columns = {
    "status": Column("status", False, "UInt32"),
    "host": Column("host", False, "String"),
}

sql = to_sql_where(result.root, columns)
print(sql)
