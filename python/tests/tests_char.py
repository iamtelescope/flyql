import unittest

from flyql.char import Char


class TestsChar(unittest.TestCase):
    def test_valid_init(self):
        Char(value="a", pos=0, line=0, line_pos=0)
