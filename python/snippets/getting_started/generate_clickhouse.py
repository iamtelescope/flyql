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
