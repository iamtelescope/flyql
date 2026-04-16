import pytest
from flyql.core.parser import Parser, parse
from flyql.core.constants import CharType
from tests.core.helpers import load_test_data


class TestTypedChars:
    def test_simple_expression(self):
        parser = Parser()
        parser.parse("key=value")

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
        parser = Parser()
        parser.parse("key = value")

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
        parser = Parser()
        parser.parse('name="john doe"')

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
        parser = Parser()
        parser.parse("name='john'")

        value_chars = [
            (char, char_type)
            for char, char_type in parser.typed_chars
            if char_type == CharType.VALUE
        ]
        assert len(value_chars) == 6  # 'john' including both quotes

        assert value_chars[0][0].value == "'"
        assert value_chars[-1][0].value == "'"

    def test_boolean_operators(self):
        parser = Parser()
        parser.parse("a=1 and b=2")

        # Find operator chars for 'and'
        operator_positions = []
        for i, (char, char_type) in enumerate(parser.typed_chars):
            if char_type == CharType.OPERATOR and char.value in ["a", "n", "d"]:
                operator_positions.append(i)

        # Should find consecutive a,n,d as operators
        assert len(operator_positions) >= 3

    def test_parentheses(self):
        parser = Parser()
        parser.parse("(key=value)")

        # First char should be operator (open paren)
        assert parser.typed_chars[0][1] == CharType.OPERATOR
        assert parser.typed_chars[0][0].value == "("

        # Last char should be operator (close paren)
        assert parser.typed_chars[-1][1] == CharType.OPERATOR
        assert parser.typed_chars[-1][0].value == ")"

    def test_complex_operators(self):
        parser = Parser()
        parser.parse("count>=10")

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
        parser = Parser()
        parser.parse("msg~pattern")

        operator_chars = [
            (char, char_type)
            for char, char_type in parser.typed_chars
            if char_type == CharType.OPERATOR
        ]
        assert len(operator_chars) == 1
        assert operator_chars[0][0].value == "~"

    def test_not_regex_operator(self):
        parser = Parser()
        parser.parse("msg!~pattern")

        operator_chars = [
            (char, char_type)
            for char, char_type in parser.typed_chars
            if char_type == CharType.OPERATOR
        ]
        assert len(operator_chars) == 2  # '!~'
        assert operator_chars[0][0].value == "!"
        assert operator_chars[1][0].value == "~"

    def test_complex_query(self):
        parser = Parser()
        parser.parse("status=200 and (service=api or service=web)")

        # Check all types are present
        char_types = set(char_type for _, char_type in parser.typed_chars)
        assert CharType.KEY in char_types
        assert CharType.VALUE in char_types
        assert CharType.OPERATOR in char_types
        assert CharType.SPACE in char_types

    def test_position_preservation(self):
        parser = Parser()
        parser.parse("a=b")

        assert parser.typed_chars[0][0].pos == 0  # 'a'
        assert parser.typed_chars[1][0].pos == 1  # '='
        assert parser.typed_chars[2][0].pos == 2  # 'b'

    def test_nested_keys(self):
        parser = Parser()
        parser.parse("user:name=john")

        # All chars in 'user:name' should be KEY type
        key_chars = []
        for char, char_type in parser.typed_chars:
            if char_type == CharType.KEY:
                key_chars.append(char.value)
            elif char_type == CharType.OPERATOR:
                break

        assert "".join(key_chars) == "user:name"

    def test_empty_value(self):
        parser = Parser()
        parser.parse("key=")

        # Should have key and operator but no value chars
        char_types = [char_type for _, char_type in parser.typed_chars]
        assert CharType.KEY in char_types
        assert CharType.OPERATOR in char_types
        # No VALUE type chars expected for empty value

    def test_line_position_tracking(self):
        parser = Parser()
        parser.parse("a=1 and \nb=2")

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

    def test_function_retroactive_retype(self):
        parser = Parser()
        parser.parse("created_at > startOf('week')")
        fn_chars = "".join(
            c.value for c, ct in parser.typed_chars if ct == CharType.FUNCTION
        )
        assert fn_chars == "startOf"

    def test_function_structural_chars_are_operators(self):
        parser = Parser()
        parser.parse("t = startOf('month', 'Asia/Tokyo')")
        ops = "".join(
            c.value for c, ct in parser.typed_chars if ct == CharType.OPERATOR
        )
        assert "(" in ops
        assert "," in ops
        assert ")" in ops

    def test_unknown_identifier_not_retyped_function(self):
        parser = Parser()
        parser.parse("t > startsWith")
        assert not any(ct == CharType.FUNCTION for _, ct in parser.typed_chars)

    def test_function_name_captured_after_retype(self):
        result = parse("t > ago(1h)")
        root = result.root
        expr = root.expression if root.expression is not None else root.left.expression
        assert expr is not None
        assert expr.value.name == "ago"

    def test_mid_typing_function_call_retype(self):
        parser = Parser()
        parser.parse("t > ago(", raise_error=False)
        fn_chars = "".join(
            c.value for c, ct in parser.typed_chars if ct == CharType.FUNCTION
        )
        assert fn_chars == "ago"


def test_known_functions_are_ascii_only():
    """Retroactive FUNCTION retype walks back len(value) typed_chars entries.
    That count is only accurate while names are ASCII; a multi-byte name
    would silently mis-align the window. Fail loudly on any future addition.
    """
    from flyql.core.constants import KNOWN_FUNCTIONS

    for name in KNOWN_FUNCTIONS:
        assert name.isascii(), f"{name!r} must be ASCII-only"


class TestDurationOrdering:
    """Prometheus-style strict descending, unique-unit duration literals."""

    @pytest.mark.parametrize(
        "inp",
        [
            "t > ago(1s)",
            "t > ago(1m)",
            "t > ago(1h)",
            "t > ago(1d)",
            "t > ago(1w)",
            "t > ago(1h30m)",
            "t > ago(2w3d4h5m6s)",
            "t > ago(1w30s)",
        ],
    )
    def test_valid_duration_ordering(self, inp):
        from flyql.core.parser import parse

        parse(inp)  # must not raise

    @pytest.mark.parametrize(
        "inp,why",
        [
            ("t > ago(1m2h)", "ascending (m before h)"),
            ("t > ago(30m1h)", "ascending (m before h)"),
            ("t > ago(1h2h)", "repeated unit h"),
            ("t > ago(30m30m)", "repeated unit m"),
            ("t > ago(3h1w)", "ascending (h before w)"),
            ("t > ago(1s1m)", "ascending (s before m)"),
            ("t > ago(1d1w)", "ascending (d before w)"),
        ],
    )
    def test_invalid_duration_ordering(self, inp, why):
        from flyql.core.parser import parse, ParserError
        from flyql.core.constants import ERR_INVALID_DURATION

        with pytest.raises(ParserError) as exc_info:
            parse(inp)
        assert exc_info.value.errno == ERR_INVALID_DURATION, why


_fixture_data = load_test_data("typed_chars.json")


@pytest.mark.parametrize(
    "test_case",
    _fixture_data["tests"],
    ids=[tc["name"] for tc in _fixture_data["tests"]],
)
def test_typed_chars_shared_fixture(test_case):
    parser = Parser()
    parser.parse(test_case["input"])
    actual = [[c.value, ct.value] for c, ct in parser.typed_chars]
    assert actual == test_case["expected_typed_chars"]
