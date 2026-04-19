"""Demonstrate IN-list type validation across three cases.

FlyQL parsers always accept heterogeneous lists. SQL generators run a
type-consistency check ONLY when (a) the column has a declared type, (b) the
key is not segmented, and (c) the list is homogeneous. Heterogeneous lists
bypass the check at the call site and pass through.

Three demonstrated cases:
  (a) Homogeneous list matching column type — SQL is generated.
  (b) Heterogeneous list against a typed column — SQL is generated (validator
      is skipped because ``len(set(values_types)) > 1``).
  (c) Homogeneous list with the wrong element type — FlyqlError is raised with
      the canonical message ``type mismatch in IN list: ...``.
"""

from flyql import FlyqlError, parse
from flyql.generators.clickhouse.column import Column
from flyql.generators.clickhouse.generator import to_sql_where

columns = {
    "category": Column("category", "String"),
    "status": Column("status", "UInt32"),
}

# (a) Homogeneous list matching column type — SQL is generated.
result_a = parse("category in ['electronics', 'appliances']")
print("(a)", to_sql_where(result_a.root, columns))

# (b) Heterogeneous list — validator is skipped, SQL is generated.
result_b = parse("status in [200, 'ok', 404]")
print("(b)", to_sql_where(result_b.root, columns))

# (c) Homogeneous wrong-type list — FlyqlError is raised.
result_c = parse("status in ['ok', 'fail']")
try:
    to_sql_where(result_c.root, columns)
except FlyqlError as exc:
    print("(c)", exc)
