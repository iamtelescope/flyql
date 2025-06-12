from flyql.core.char import Char


def test_valid_init():
    char = Char(value="a", pos=0, line=0, line_pos=0)
    assert char.value == "a"
    assert char.pos == 0
    assert char.line == 0
    assert char.line_pos == 0


def test_is_delimiter():
    char = Char(value=" ", pos=0, line=0, line_pos=0)
    assert char.is_delimiter() is True

    char = Char(value="a", pos=0, line=0, line_pos=0)
    assert char.is_delimiter() is False


def test_is_key():
    valid_key_chars = ["a", "A", "1", "_", ".", ":", "/"]
    for value in valid_key_chars:
        char = Char(value=value, pos=0, line=0, line_pos=0)
        assert char.is_key() is True

    invalid_key_chars = [" ", "!", "=", "(", ")"]
    for value in invalid_key_chars:
        char = Char(value=value, pos=0, line=0, line_pos=0)
        assert char.is_key() is False


def test_is_op():
    op_chars = ["=", "!", "~", "<", ">"]
    for value in op_chars:
        char = Char(value=value, pos=0, line=0, line_pos=0)
        assert char.is_op() is True

    non_op_chars = ["a", " ", "(", ")"]
    for value in non_op_chars:
        char = Char(value=value, pos=0, line=0, line_pos=0)
        assert char.is_op() is False


def test_is_group_open():
    char = Char(value="(", pos=0, line=0, line_pos=0)
    assert char.is_group_open() is True

    char = Char(value="a", pos=0, line=0, line_pos=0)
    assert char.is_group_open() is False


def test_is_group_close():
    char = Char(value=")", pos=0, line=0, line_pos=0)
    assert char.is_group_close() is True

    char = Char(value="a", pos=0, line=0, line_pos=0)
    assert char.is_group_close() is False


def test_is_quotes():
    char = Char(value='"', pos=0, line=0, line_pos=0)
    assert char.is_double_quote() is True
    assert char.is_double_quoted_value() is False

    char = Char(value="'", pos=0, line=0, line_pos=0)
    assert char.is_single_quote() is True
    assert char.is_single_quoted_value() is False

    char = Char(value="a", pos=0, line=0, line_pos=0)
    assert char.is_double_quote() is False
    assert char.is_single_quote() is False
    assert char.is_double_quoted_value() is True
    assert char.is_single_quoted_value() is True


def test_is_backslash():
    char = Char(value="\\", pos=0, line=0, line_pos=0)
    assert char.is_backslash() is True

    char = Char(value="a", pos=0, line=0, line_pos=0)
    assert char.is_backslash() is False


def test_is_equals():
    char = Char(value="=", pos=0, line=0, line_pos=0)
    assert char.is_equals() is True

    char = Char(value="a", pos=0, line=0, line_pos=0)
    assert char.is_equals() is False


def test_is_value():
    valid_value_chars = ["a", "1", "!", "<", ">"]
    for value in valid_value_chars:
        char = Char(value=value, pos=0, line=0, line_pos=0)
        assert char.is_value() is True

    invalid_value_chars = ['"', "'", " ", "(", ")", "="]
    for value in invalid_value_chars:
        char = Char(value=value, pos=0, line=0, line_pos=0)
        assert char.is_value() is False


def test_is_newline():
    char = Char(value="\n", pos=0, line=0, line_pos=0)
    assert char.is_newline() is True

    char = Char(value="a", pos=0, line=0, line_pos=0)
    assert char.is_newline() is False
