from typing import List, Mapping, Optional


from flyql.exceptions import FlyqlError
from flyql.expression import Expression
from flyql.tree import Node


class ClickhouseField:
    def __init__(
        self,
        name: str,
        _type: str,
        display_name: Optional[str] = None,
        values: List[str] = [],
    ):
        self.name = name
        self.type = _type
        self.display_name = name
        self.values = values


def to_text(root: Node) -> str:
    left = ""
    right = ""
    text = ""

    if root.expression is not None:
        text = str(root.expression)

    if root.left is not None:
        left = to_text(root.left)

    if root.right is not None:
        right = to_text(root.right)

    if len(left) > 0 and len(right) > 0:
        text = f"({left} {root.bool_operator} {right})"
    elif len(left) > 0:
        text = left
    elif len(right) > 0:
        text = right

    return text


def expression_to_clickhouse_sql(expression: Expression, fields: Mapping[str, ClickhouseField]) -> str:
    if ':' in expression.key:
        pass
    else:
        pass

    return f'{expression.key}{expression.operator}{expression.value}'


def to_clickhouse_sql(root: Node, fields: Mapping[str, ClickhouseField]) -> str:
    """
    Returns ClickHouse WHERE clause for given tree and fields
    """
    left = ""
    right = ""
    text = ""

    if root.expression is not None:
        text = expression_to_clickhouse_sql(root.expression, fields)

    if root.left is not None:
        left = to_clickhouse_sql(root.left, fields)

    if root.right is not None:
        right = to_clickhouse_sql(root.right, fields)

    if len(left) > 0 and len(right) > 0:
        text = f"({left} {root.bool_operator} {right})"
    elif len(left) > 0:
        text = left
    elif len(right) > 0:
        text = right

    return text
