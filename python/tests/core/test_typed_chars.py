import pytest
from flyql.core.parser import parse
from flyql.core.constants import CharType


class TestTypedChars:
    def test_simple_expression(self):
        parser = parse("key=value")

        assert len(parser.typed_chars) == 9  # k,e,y,=,v,a,l,u,e

        # Check types
        assert parser.typed_chars[0][1] == CharType.KEY  # k
        assert parser.typed_chars[1][1] == CharType.KEY  # e
        assert parser.typed_chars[2][1] == CharType.KEY  # y
        assert parser.typed_chars[3][1] == CharType.OPERATOR  # =
        assert parser.typed_chars[4][1] == CharType.VALUE  # v
        assert parser.typed_chars[5][1] == CharType.VALUE  # a
        assert parser.typed_chars[6][1] == CharType.VALUE  # l
        assert parser.typed_chars[7][1] == CharType.VALUE  # u
        assert parser.typed_chars[8][1] == CharType.VALUE  # e

        # Check values
        assert parser.typed_chars[0][0].value == "k"
        assert parser.typed_chars[3][0].value == "="
        assert parser.typed_chars[4][0].value == "v"

    def test_spaces_handling(self):
        parser = parse("key = value")

        # Find all space chars
        space_chars = [
            (char, char_type)
            for char, char_type in parser.typed_chars
            if char_type == CharType.SPACE
        ]
        assert len(space_chars) == 2

        # Check that spaces are in correct positions
        assert parser.typed_chars[3][1] == CharType.SPACE  # After 'key'
        assert parser.typed_chars[5][1] == CharType.SPACE  # After '='

    def test_quoted_strings(self):
        parser = parse('name="john doe"')

        # Find all value chars
        value_chars = [
            (char, char_type)
            for char, char_type in parser.typed_chars
            if char_type == CharType.VALUE
        ]
        assert len(value_chars) == 10  # "john doe" including both quotes

        # Check quotes are included
        assert value_chars[0][0].value == '"'
        assert value_chars[-1][0].value == '"'

        # Check space in value at position 5
        assert value_chars[5][0].value == " "

    def test_single_quoted_strings(self):
        parser = parse("name='john'")

        value_chars = [
            (char, char_type)
            for char, char_type in parser.typed_chars
            if char_type == CharType.VALUE
        ]
        assert len(value_chars) == 6  # 'john' including both quotes

        assert value_chars[0][0].value == "'"
        assert value_chars[-1][0].value == "'"

    def test_boolean_operators(self):
        parser = parse("a=1 and b=2")

        # Find operator chars for 'and'
        operator_positions = []
        for i, (char, char_type) in enumerate(parser.typed_chars):
            if char_type == CharType.OPERATOR and char.value in ["a", "n", "d"]:
                operator_positions.append(i)

        # Should find consecutive a,n,d as operators
        assert len(operator_positions) >= 3

    def test_parentheses(self):
        parser = parse("(key=value)")

        # First char should be operator (open paren)
        assert parser.typed_chars[0][1] == CharType.OPERATOR
        assert parser.typed_chars[0][0].value == "("

        # Last char should be operator (close paren)
        assert parser.typed_chars[-1][1] == CharType.OPERATOR
        assert parser.typed_chars[-1][0].value == ")"

    def test_complex_operators(self):
        parser = parse("count>=10")

        # Find operator chars
        operator_chars = [
            (char, char_type)
            for char, char_type in parser.typed_chars
            if char_type == CharType.OPERATOR
        ]
        assert len(operator_chars) == 2  # '>='
        assert operator_chars[0][0].value == ">"
        assert operator_chars[1][0].value == "="

    def test_regex_operators(self):
        parser = parse("msg=~pattern")

        operator_chars = [
            (char, char_type)
            for char, char_type in parser.typed_chars
            if char_type == CharType.OPERATOR
        ]
        assert len(operator_chars) == 2  # '=~'
        assert operator_chars[0][0].value == "="
        assert operator_chars[1][0].value == "~"

    def test_not_regex_operator(self):
        parser = parse("msg!~pattern")

        operator_chars = [
            (char, char_type)
            for char, char_type in parser.typed_chars
            if char_type == CharType.OPERATOR
        ]
        assert len(operator_chars) == 2  # '!~'
        assert operator_chars[0][0].value == "!"
        assert operator_chars[1][0].value == "~"

    def test_complex_query(self):
        parser = parse("status=200 and (service=api or service=web)")

        # Check all types are present
        char_types = set(char_type for _, char_type in parser.typed_chars)
        assert CharType.KEY in char_types
        assert CharType.VALUE in char_types
        assert CharType.OPERATOR in char_types
        assert CharType.SPACE in char_types

    def test_position_preservation(self):
        parser = parse("a=b")

        assert parser.typed_chars[0][0].pos == 0  # 'a'
        assert parser.typed_chars[1][0].pos == 1  # '='
        assert parser.typed_chars[2][0].pos == 2  # 'b'

    def test_nested_keys(self):
        parser = parse("user:name=john")

        # All chars in 'user:name' should be KEY type
        key_chars = []
        for char, char_type in parser.typed_chars:
            if char_type == CharType.KEY:
                key_chars.append(char.value)
            elif char_type == CharType.OPERATOR:
                break

        assert "".join(key_chars) == "user:name"

    def test_empty_value(self):
        parser = parse("key=")

        # Should have key and operator but no value chars
        char_types = [char_type for _, char_type in parser.typed_chars]
        assert CharType.KEY in char_types
        assert CharType.OPERATOR in char_types
        # No VALUE type chars expected for empty value

    def test_line_position_tracking(self):
        parser = parse("a=1 and \nb=2")

        # Find newline position
        newline_pos = None
        for i, c in enumerate("a=1 and \nb=2"):
            if c == "\n":
                newline_pos = i
                break

        # Chars after newline should have line=1
        for char, _ in parser.typed_chars:
            if char.pos > newline_pos:
                assert char.line == 1
