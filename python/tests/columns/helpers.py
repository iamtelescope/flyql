import json
from pathlib import Path
from typing import Dict, Any, List
from flyql.columns import ParsedColumn


def load_test_data(filename: str) -> Dict[str, Any]:
    """Load test data from JSON file in tests-data directory"""
    test_data_path = (
        Path(__file__).parent.parent.parent.parent
        / "tests-data"
        / "columns"
        / "parser"
        / filename
    )
    with open(test_data_path, "r", encoding="utf-8") as f:
        return json.load(f)


def column_to_dict(column: ParsedColumn) -> Dict[str, Any]:
    """Convert ParsedColumn to dict for comparison"""
    return column.as_dict()


def compare_columns(actual: List[ParsedColumn], expected: List[Dict[str, Any]]) -> bool:
    """Compare parsed columns with expected output"""
    if len(actual) != len(expected):
        return False
    for act, exp in zip(actual, expected):
        if column_to_dict(act) != exp:
            return False
    return True


def format_column_mismatch_message(
    test_name: str,
    input_text: str,
    expected: List[Dict[str, Any]],
    actual: List[ParsedColumn],
) -> str:
    """Format a detailed error message for column mismatches"""
    actual_dicts = [column_to_dict(col) for col in actual]
    return (
        f"Column mismatch for test '{test_name}':\n"
        f"Input: {input_text}\n"
        f"Expected: {json.dumps(expected, indent=2)}\n"
        f"Actual: {json.dumps(actual_dicts, indent=2)}"
    )
