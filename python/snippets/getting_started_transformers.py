from flyql import parse
from flyql.generators.clickhouse.generator import to_sql_where
from flyql.generators.clickhouse.column import Column

# Parse a transformer query
result = parse("message|upper = 'ERROR'")

# Generate SQL for ClickHouse
columns = {"message": Column("message", False, "String")}
sql = to_sql_where(result.root, columns)
print(sql)  # equals(upper(message), 'ERROR')
