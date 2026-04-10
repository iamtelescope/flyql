"""Tests for bind_params() — uses shared JSON test data."""

import json
from pathlib import Path
from typing import Any, Dict

import pytest

from flyql import parse, bind_params, FlyqlError
from flyql.core.expression import Parameter
from flyql.types import ValueType


def load_bind_test_data() -> Dict[str, Any]:
    test_data_path = (
        Path(__file__).parent.parent.parent.parent
        / "tests-data"
        / "core"
        / "bind"
        / "parameters.json"
    )
    with open(test_data_path, "r", encoding="utf-8") as f:
        return json.load(f)


def find_first_expression(node):
    """Recursively find the first leaf expression in the AST."""
    if node is None:
        return None
    if node.expression is not None:
        return node.expression
    return find_first_expression(node.left) or find_first_expression(node.right)


@pytest.mark.parametrize("test_case", load_bind_test_data()["tests"])
def test_bind_parameters(test_case):
    parser = parse(test_case["input"])
    if test_case["expected_result"] == "success":
        bind_params(parser.root, test_case["params"])
        expr = find_first_expression(parser.root)
        assert expr is not None
        assert expr.value == test_case["expected_value"]
        assert expr.value_type.value == test_case["expected_value_type"]
    elif test_case["expected_result"] == "error":
        with pytest.raises(FlyqlError) as exc_info:
            bind_params(parser.root, test_case["params"])
        assert test_case["expected_error_contains"] in str(exc_info.value)


def test_bind_multiple_named():
    parser = parse("a=$x and b=$y")
    bind_params(parser.root, {"x": 1, "y": "hello"})
    assert parser.root.left.expression.value == 1
    assert parser.root.right.expression.value == "hello"


def test_bind_mixed_named_positional():
    parser = parse("a=$1 and b=$name")
    bind_params(parser.root, {"1": 42, "name": "hi"})
    assert parser.root.left.expression.value == 42
    assert parser.root.right.expression.value == "hi"


def test_bind_same_param_twice():
    parser = parse("a=$x or b=$x")
    bind_params(parser.root, {"x": 42})
    assert parser.root.left.expression.value == 42
    assert parser.root.right.expression.value == 42


def test_bind_in_list():
    parser = parse("status in [$x, $y]")
    bind_params(parser.root, {"x": "a", "y": "b"})
    expr = parser.root.left.expression
    assert expr.values == ["a", "b"]
    assert expr.values_types[0].value == "string"
    assert expr.values_types[1].value == "string"


def test_bind_function_ago():
    parser = parse("created=ago($d)")
    bind_params(parser.root, {"d": "5m"})
    fc = parser.root.left.expression.value
    assert fc.parameter_args == []
    assert len(fc.duration_args) == 1
    assert fc.duration_args[0].value == 5
    assert fc.duration_args[0].unit == "m"


def test_bind_returns_node():
    parser = parse("a=$x")
    result = bind_params(parser.root, {"x": 1})
    assert result is parser.root


def test_bind_unsupported_type():
    from decimal import Decimal

    parser = parse("a=$x")
    with pytest.raises(FlyqlError, match="unsupported parameter value type"):
        bind_params(parser.root, {"x": Decimal("3.14")})
