import unittest

from flyql.expression import Expression
from flyql.constants import VALID_KEY_VALUE_OPERATORS
from flyql.exceptions import FlyqlError


class TestsExpression(unittest.TestCase):
    def test_valid_init(self):
        for op in VALID_KEY_VALUE_OPERATORS:
            e = Expression(key="a", operator=op, value="b", value_is_string=None)
            self.assertEqual(str(e), f"a{op}b")

    def test_invalid_operator_init(self):
        with self.assertRaises(FlyqlError):
            Expression(
                key="a", operator="invalid_operator", value="b", value_is_string=None
            )

    def test_invalid_key_init(self):
        with self.assertRaises(FlyqlError):
            Expression(
                key="", operator="invalid_operator", value="b", value_is_string=None
            )

    def test_invalid_value_init(self):
        with self.assertRaises(FlyqlError):
            Expression(
                key="a", operator="invalid_operator", value="", value_is_string=None
            )
