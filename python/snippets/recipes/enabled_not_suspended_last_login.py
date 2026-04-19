"""Filter accounts that are enabled, not suspended, and have a last_login set.

FlyQL query: ``enabled and not suspended and last_login``

All three terms use truthy/falsy semantics: a bare key (no operator, no value)
means "this field is truthy". ``not suspended`` flips the truthy check into a
falsy check.
"""

from flyql import parse
from flyql.generators.clickhouse.column import Column
from flyql.generators.clickhouse.generator import to_sql_where

result = parse("enabled and not suspended and last_login")

columns = {
    "enabled": Column("enabled", "Bool"),
    "suspended": Column("suspended", "Bool"),
    "last_login": Column("last_login", "DateTime"),
}

sql = to_sql_where(result.root, columns)
print(sql)
