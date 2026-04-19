"""Walk the FlyQL AST and emit an Elasticsearch Query DSL object.

FlyQL query: ``status = 200 and env in ['prod', 'staging']``

Demonstrates a non-SQL custom generator: same AST, different target.
See ``advanced/ast`` for the full custom-generator walkthrough.
"""

import json

from flyql import parse
from flyql.core.constants import BoolOperator, Operator


def generate_es(node):
    if node is None:
        return {"match_all": {}}

    if node.expression is not None:
        result = expression_to_es(node.expression)
    else:
        left = generate_es(node.left)
        right = generate_es(node.right)
        if node.bool_operator == BoolOperator.AND.value:
            result = {"bool": {"must": [left, right]}}
        else:
            result = {"bool": {"should": [left, right], "minimum_should_match": 1}}

    if node.negated:
        result = {"bool": {"must_not": [result]}}

    return result


def expression_to_es(expr):
    field = expr.key.raw
    op = expr.operator
    if op == Operator.EQUALS.value:
        return {"term": {field: expr.value}}
    if op == Operator.IN.value:
        return {"terms": {field: expr.values or []}}
    if op == Operator.GREATER_THAN.value:
        return {"range": {field: {"gt": expr.value}}}
    if op == Operator.TRUTHY.value:
        return {"exists": {"field": field}}
    raise ValueError(f"unsupported operator: {op}")


result = parse("status = 200 and env in ['prod', 'staging']")
es_query = generate_es(result.root)
print(json.dumps(es_query, indent=2))
