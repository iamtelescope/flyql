import unittest

from parameterized import parameterized

from flyql.parser import parse

from flyql.matcher.evaluator import Evaluator
from flyql.matcher.record import Record


TEST_DATA = [
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
]


class TestsMatcher(unittest.TestCase):
    @parameterized.expand(TEST_DATA)
    def test_data(self, query, data, result):
        root = parse(query).root
        ev = Evaluator()
        record = Record(data=data)
        self.assertIs(ev.evaluate(root, record), result)
