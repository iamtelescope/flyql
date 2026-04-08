import json
from pathlib import Path

import pytest

from flyql.core.parser import parse
from flyql.core.exceptions import FlyqlError
from flyql.matcher.evaluator import Evaluator
from flyql.matcher.record import Record


def load_matcher_test_data(filename: str) -> list:
    test_data_path = (
        Path(__file__).resolve().parent.parent.parent.parent
        / "tests-data"
        / "matcher"
        / filename
    )
    with open(test_data_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data["tests"]


@pytest.mark.parametrize(
    "query,data,expected_result",
    [
        ("message=hello", {"message": "hello"}, True),
        ("message=hello", {"message": "hllo"}, False),
        ("message!=hello", {"message": "hello"}, False),
        ("message!=hello", {"message": "hellohello"}, True),
        ("message~hello", {"message": "hello"}, True),
        ("message!~hello", {"message": "hello"}, False),
        ("message=1", {"message": 1}, True),
        ("message='1'", {"message": 1}, False),
        ("message='1'", {"message": "1"}, True),
        ("message=1.0", {"message": 1.0}, True),
        ('message="1.0"', {"message": 1.0}, False),
        ("message='1.0'", {"message": 1.0}, False),
        ("message=1.0", {"message": 1.0}, True),
    ],
)
def test_matcher_evaluates_correctly(query, data, expected_result):
    root = parse(query).root
    evaluator = Evaluator()
    record = Record(data=data)
    result = evaluator.evaluate(root, record)
    assert result is expected_result


@pytest.mark.parametrize(
    "query,data,expected_result",
    [
        # Simple column-to-column match
        ("field=other", {"field": "hello", "other": "hello"}, True),
        ("field=other", {"field": "hello", "other": "world"}, False),
        # Column not equals
        ("field!=other", {"field": "hello", "other": "world"}, True),
        ("field!=other", {"field": "hello", "other": "hello"}, False),
        # Numeric column comparison
        ("count>threshold", {"count": 10, "threshold": 5}, True),
        ("count>threshold", {"count": 3, "threshold": 5}, False),
        ("count<=threshold", {"count": 5, "threshold": 5}, True),
        # Dot-path column reference
        ("field=nested.value", {"field": "x", "nested": {"value": "x"}}, True),
        ("field=nested.value", {"field": "x", "nested": {"value": "y"}}, False),
        # Column ref that doesn't exist in data falls back to literal
        ("field=unknown", {"field": "unknown"}, True),
        ("field=unknown", {"field": "other"}, False),
    ],
)
def test_matcher_column_to_column(query, data, expected_result):
    root = parse(query).root
    evaluator = Evaluator()
    record = Record(data=data)
    result = evaluator.evaluate(root, record)
    assert result is expected_result


def test_matcher_with_complex_query():
    query = "status=200 and message=hello"
    data = {"status": 200, "message": "hello"}
    root = parse(query).root
    evaluator = Evaluator()
    record = Record(data=data)
    result = evaluator.evaluate(root, record)
    assert result is True


def test_matcher_with_or_operator():
    query = "status=200 or status=404"
    data = {"status": 404}
    root = parse(query).root
    evaluator = Evaluator()
    record = Record(data=data)
    result = evaluator.evaluate(root, record)
    assert result is True


def test_matcher_with_nested_json():
    query = "user.name=john"
    data = {"user": {"name": "john"}}
    root = parse(query).root
    evaluator = Evaluator()
    record = Record(data=data)
    result = evaluator.evaluate(root, record)
    assert result is True


def test_matcher_with_json_string():
    query = "metadata.user.name=john"
    data = {"metadata": '{"user": {"name": "john"}}'}
    root = parse(query).root
    evaluator = Evaluator()
    record = Record(data=data)
    result = evaluator.evaluate(root, record)
    assert result is True


def test_matcher_with_regex():
    query = "message~^hello.*world$"
    data = {"message": "hello beautiful world"}
    root = parse(query).root
    evaluator = Evaluator()
    record = Record(data=data)
    result = evaluator.evaluate(root, record)
    assert result is True


def test_matcher_with_comparison_operators():
    query = "count>10 and price<=100.5"
    data = {"count": 15, "price": 99.99}
    root = parse(query).root
    evaluator = Evaluator()
    record = Record(data=data)
    result = evaluator.evaluate(root, record)
    assert result is True


def test_regex_re2():
    """Test that RE2 regex matching works"""
    query = "message~^hello"
    data = {"message": "hello world"}
    root = parse(query).root
    evaluator = Evaluator()
    record = Record(data=data)
    result = evaluator.evaluate(root, record)
    assert result is True


def test_regex_re2_backreference_rejected():
    """Test that RE2 rejects backreferences (safety guarantee)"""
    query = r'message~"(\w+)\s+\1"'  # Backreference not supported in RE2
    data = {"message": "hello hello"}
    root = parse(query).root
    evaluator = Evaluator()
    record = Record(data=data)

    with pytest.raises(FlyqlError, match="invalid regex"):
        evaluator.evaluate(root, record)


@pytest.mark.parametrize("test_case", load_matcher_test_data("has.json"))
def test_has_matcher(test_case: dict) -> None:
    root = parse(test_case["query"]).root
    evaluator = Evaluator()
    record = Record(data=test_case["data"])
    result = evaluator.evaluate(root, record)
    assert result is test_case["expected"], (
        f"query={test_case['query']!r}, data={test_case['data']!r}: "
        f"got {result}, want {test_case['expected']}"
    )


@pytest.mark.parametrize("test_case", load_matcher_test_data("transformers.json"))
def test_transformers_matcher(test_case: dict) -> None:
    root = parse(test_case["query"]).root
    evaluator = Evaluator()
    record = Record(data=test_case["data"])
    result = evaluator.evaluate(root, record)
    assert result is test_case["expected"], (
        f"query={test_case['query']!r}, data={test_case['data']!r}: "
        f"got {result}, want {test_case['expected']}"
    )


@pytest.mark.parametrize("test_case", load_matcher_test_data("types.json"))
def test_types_matcher(test_case: dict) -> None:
    root = parse(test_case["query"]).root
    evaluator = Evaluator()
    record = Record(data=test_case["data"])
    result = evaluator.evaluate(root, record)
    assert result is test_case["expected"], (
        f"query={test_case['query']!r}, data={test_case['data']!r}: "
        f"got {result}, want {test_case['expected']}"
    )


@pytest.mark.parametrize("test_case", load_matcher_test_data("like.json"))
def test_like_matcher(test_case: dict) -> None:
    root = parse(test_case["query"]).root
    evaluator = Evaluator()
    record = Record(data=test_case["data"])
    result = evaluator.evaluate(root, record)
    assert result is test_case["expected"], (
        f"query={test_case['query']!r}, data={test_case['data']!r}: "
        f"got {result}, want {test_case['expected']}"
    )


@pytest.mark.parametrize("test_case", load_matcher_test_data("regex.json"))
def test_regex_matcher(test_case: dict) -> None:
    root = parse(test_case["query"]).root
    evaluator = Evaluator()
    record = Record(data=test_case["data"])
    result = evaluator.evaluate(root, record)
    assert result is test_case["expected"], (
        f"query={test_case['query']!r}, data={test_case['data']!r}: "
        f"got {result}, want {test_case['expected']}"
    )
