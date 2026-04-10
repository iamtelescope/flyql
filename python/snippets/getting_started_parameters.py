from flyql import parse, bind_params
from flyql.generators.clickhouse.generator import to_sql_where
from flyql.generators.clickhouse.column import Column

# Parse a query with parameter placeholders
result = parse("status = $code and env in [$env, 'staging']")

# Bind concrete values to the parameters
bind_params(result.root, {"code": 200, "env": "prod"})

# Generate SQL
columns = {
    "status": Column("status", False, "Int32"),
    "env": Column("env", False, "String"),
}
sql = to_sql_where(result.root, columns)
print(sql)
