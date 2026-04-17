import json
from pathlib import Path
from typing import Dict, Any, Optional, List

from flyql.core.expression import FunctionCall, Parameter


def get_expression(node):
    """Helper to get expression from node (handles different AST structures)"""
    if node.expression is not None:
        return node.expression
    elif node.left is not None and node.left.expression is not None:
        return node.left.expression
    else:
        raise AssertionError("No expression found in node")


def has_expression(node):
    """Helper to check if node has expression directly or in children"""
    if node is None:
        return False
    if node.expression is not None:
        return True
    if node.left is not None and node.left.expression is not None:
        return True
    return False


def load_test_data(filename: str) -> Dict[str, Any]:
    """Load test data from JSON file in tests-data directory"""
    test_data_path = (
        Path(__file__).parent.parent.parent.parent
        / "tests-data"
        / "core"
        / "parser"
        / filename
    )
    with open(test_data_path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_tokenize_data(filename: str) -> Dict[str, Any]:
    """Load tokenizer test data from tests-data/tokenize directory"""
    test_data_path = (
        Path(__file__).parent.parent.parent.parent
        / "tests-data"
        / "tokenize"
        / filename
    )
    with open(test_data_path, "r", encoding="utf-8") as f:
        return json.load(f)


def ast_to_dict(node) -> Optional[Dict[str, Any]]:
    """Convert AST node to dictionary for comparison"""
    if node is None:
        return None

    result = {
        "bool_operator": node.bool_operator,
        "negated": getattr(node, "negated", False),
        "expression": None,
        "left": None,
        "right": None,
    }

    if node.expression is not None:
        value = node.expression.value
        if isinstance(value, FunctionCall):
            fc_dict: dict = {
                "name": value.name,
                "duration_args": [
                    {"value": d.value, "unit": d.unit} for d in value.duration_args
                ],
                "unit": value.unit,
                "timezone": value.timezone,
            }
            if value.parameter_args:
                fc_dict["parameter_args"] = [
                    {"name": p.name, "positional": p.positional}
                    for p in value.parameter_args
                ]
            value = fc_dict
        elif isinstance(value, Parameter):
            value = {"name": value.name, "positional": value.positional}
        expr = {
            "key": node.expression.key.raw,
            "operator": node.expression.operator,
            "value": value,
            "value_type": (
                node.expression.value_type.value
                if node.expression.value_type is not None
                else None
            ),
        }
        if node.expression.values is not None:
            serialized_values = []
            for v in node.expression.values:
                if isinstance(v, Parameter):
                    serialized_values.append(
                        {"name": v.name, "positional": v.positional}
                    )
                else:
                    serialized_values.append(v)
            expr["values"] = serialized_values
            expr["values_type"] = node.expression.values_type
            expr["values_types"] = (
                [vt.value for vt in node.expression.values_types]
                if node.expression.values_types is not None
                else None
            )
        result["expression"] = expr

    if node.left is not None:
        result["left"] = ast_to_dict(node.left)

    if node.right is not None:
        result["right"] = ast_to_dict(node.right)

    return result


def normalize_ast_for_comparison(node_dict) -> Optional[Dict[str, Any]]:
    """Normalize AST structure to cope with two parser wrapper shapes.

    Two live cases, both required for root shapes the parser still emits
    after the standard-precedence rewrite:

    - Case 1 — trivial single-leaf wrapper: `{bool_op=any, expr=None,
      left=<leaf>, right=None}`. Emitted for queries with a single
      key=value expression (e.g. `a=1`). Collapsed to the leaf.
    - Case 2 — grouped-prefix wrapper: `{bool_op=any, expr=None, left=None,
      right=<sub-tree>}`. Emitted for root-only grouped expressions with
      no continuation (e.g. `(a=1 or b=2)`). Collapsed to the sub-tree.

    Case 3 that previously lived here was dead code — its precondition
    was a strict subset of Case 2's and therefore unreachable.

    The recursive default below only structurally recurses into children
    — it does not flatten operators, reorder, or merge ranges — so it is
    a no-op on any canonical precedence-correct tree."""
    if node_dict is None:
        return None

    # Case 1: trivial single-leaf wrapper
    if (
        node_dict["expression"] is None
        and node_dict["left"] is not None
        and node_dict["left"]["expression"] is not None
        and node_dict["right"] is None
        and node_dict["left"]["left"] is None
        and node_dict["left"]["right"] is None
    ):
        return {
            "bool_operator": "",
            "negated": node_dict["left"].get("negated", False),
            "expression": node_dict["left"]["expression"],
            "left": None,
            "right": None,
        }

    # Case 2: root-only grouped-prefix wrapper
    if (
        node_dict["expression"] is None
        and node_dict["left"] is None
        and node_dict["right"] is not None
    ):
        return normalize_ast_for_comparison(node_dict["right"])

    # Recursively normalize children (structural recursion, no reshaping)
    result = node_dict.copy()
    if result["left"] is not None:
        result["left"] = normalize_ast_for_comparison(result["left"])
    if result["right"] is not None:
        result["right"] = normalize_ast_for_comparison(result["right"])

    return result


def _expressions_equal(actual: Dict[str, Any], expected: Dict[str, Any]) -> bool:
    if actual["key"] != expected["key"]:
        return False
    if actual["operator"] != expected["operator"]:
        return False
    # Skip value/value_type comparison for IN expressions (they use values/values_type)
    if "values" not in expected:
        if actual["value_type"] != expected["value_type"]:
            return False
        # Large integer values are stored as strings in test data to avoid JSON
        # precision loss. Compare by converting both sides to string.
        if actual["value_type"] in ("number", "int", "bigint") and isinstance(
            expected["value"], str
        ):
            if str(actual["value"]) != expected["value"]:
                return False
        elif actual["value"] != expected["value"]:
            return False
    else:
        if "values" not in actual:
            return False
        if actual["values"] != expected["values"]:
            return False
        if actual.get("values_type") != expected.get("values_type"):
            return False
        if "values_types" in expected and expected["values_types"] is not None:
            if actual.get("values_types") != expected["values_types"]:
                return False
    return True


def compare_ast(
    actual: Optional[Dict[str, Any]], expected: Optional[Dict[str, Any]]
) -> bool:
    """Recursively compare two AST dictionaries"""
    if actual is None and expected is None:
        return True

    if actual is None or expected is None:
        return False

    if actual["bool_operator"] != expected["bool_operator"]:
        return False

    if actual.get("negated", False) != expected.get("negated", False):
        return False

    actual_expr = actual["expression"]
    expected_expr = expected["expression"]
    if actual_expr is None and expected_expr is None:
        pass
    elif actual_expr is None or expected_expr is None:
        return False
    elif not _expressions_equal(actual_expr, expected_expr):
        return False

    if not compare_ast(actual["left"], expected["left"]):
        return False

    if not compare_ast(actual["right"], expected["right"]):
        return False

    return True


def create_test_cases_from_data(test_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Extract test cases from loaded test data"""
    return test_data["tests"]


def validate_error(exc_info, expected_error):
    """Validate that the raised exception matches expected error criteria"""
    if "errno" in expected_error:
        assert (
            exc_info.value.errno == expected_error["errno"]
        ), f"Expected errno {expected_error['errno']}, got {exc_info.value.errno}"

    if "errno_options" in expected_error:
        assert (
            exc_info.value.errno in expected_error["errno_options"]
        ), f"Expected errno to be one of {expected_error['errno_options']}, got {exc_info.value.errno}"

    if "message_contains" in expected_error and expected_error["message_contains"]:
        assert expected_error["message_contains"] in str(exc_info.value), (
            f"Expected message to contain '{expected_error['message_contains']}', "
            f"got '{str(exc_info.value)}'"
        )


def format_ast_mismatch_message(
    test_name: str, input_text: str, expected: Dict[str, Any], actual: Dict[str, Any]
) -> str:
    """Format a detailed error message for AST mismatches"""
    return (
        f"AST mismatch for test '{test_name}':\n"
        f"Input: {input_text}\n"
        f"Expected: {json.dumps(expected, indent=2)}\n"
        f"Actual: {json.dumps(actual, indent=2)}"
    )
