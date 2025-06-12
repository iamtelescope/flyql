import pytest

from flyql.core.parser import parse
from flyql.matcher.evaluator import Evaluator
from flyql.matcher.record import Record


@pytest.mark.parametrize(
    "query,data,expected_result",
    [
        ("message=hello", {"message": "hello"}, True),
        ("message=hello", {"message": "hllo"}, False),
        ("message='hello", {"message": "hello"}, True),
        ("message!=hello", {"message": "hello"}, False),
        ("message!=hello", {"message": "hellohello"}, True),
        ("message=~hello", {"message": "hello"}, True),
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
    query = "user:name=john"
    data = {"user": {"name": "john"}}
    root = parse(query).root
    evaluator = Evaluator()
    record = Record(data=data)
    result = evaluator.evaluate(root, record)
    assert result is True


def test_matcher_with_json_string():
    query = "metadata:user:name=john"
    data = {"metadata": '{"user": {"name": "john"}}'}
    root = parse(query).root
    evaluator = Evaluator()
    record = Record(data=data)
    result = evaluator.evaluate(root, record)
    assert result is True


def test_matcher_with_regex():
    query = "message=~^hello.*world$"
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
