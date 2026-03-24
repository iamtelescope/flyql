AT = "@"
DELIMITER = " "
DOT = "."
UNDERSCORE = "_"
COLON = ":"
SLASH = "/"
HYPHEN = "-"
BACKSLASH = "\\"
BRACKET_OPEN = "("
BRACKET_CLOSE = ")"
EQUAL_SIGN = "="
EXCL_MARK = "!"
TILDE = "~"
LOWER_THAN = "<"
GREATER_THAN = ">"
DOUBLE_QUOTE = '"'
SINGLE_QUOTE = "'"
NEWLINE = "\n"

OPERATOR_CHARS = {EQUAL_SIGN, EXCL_MARK, TILDE, LOWER_THAN, GREATER_THAN}
KEY_CHARS = {UNDERSCORE, DOT, COLON, SLASH, HYPHEN, AT}


class Char:
    def __init__(
        self,
        value: str,
        pos: int,
        line: int,
        line_pos: int,
    ) -> None:
        self.value = value
        self.pos = pos
        self.line = line
        self.line_pos = line_pos

    def is_delimiter(self) -> bool:
        return self.value == DELIMITER

    def is_key(self) -> bool:
        return self.value.isalnum() or self.value in KEY_CHARS

    def is_op(self) -> bool:
        return self.value in OPERATOR_CHARS

    def is_group_open(self) -> bool:
        return self.value == BRACKET_OPEN

    def is_group_close(self) -> bool:
        return self.value == BRACKET_CLOSE

    def is_double_quote(self) -> bool:
        return self.value == DOUBLE_QUOTE

    def is_double_quoted_value(self) -> bool:
        return not self.is_double_quote()

    def is_single_quote(self) -> bool:
        return self.value == SINGLE_QUOTE

    def is_single_quoted_value(self) -> bool:
        return not self.is_single_quote()

    def is_backslash(self) -> bool:
        return self.value == BACKSLASH

    def is_equals(self) -> bool:
        return self.value == EQUAL_SIGN

    def is_value(self) -> bool:
        return (
            not self.is_double_quote()
            and not self.is_single_quote()
            and not self.is_delimiter()
            and not self.is_group_open()
            and not self.is_group_close()
            and not self.is_equals()
        )

    def is_newline(self) -> bool:
        return self.value == NEWLINE
