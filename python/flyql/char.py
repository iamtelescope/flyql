DELIMITER = " "
DOT = "."
UNDERSCORE = "_"
COLON = ":"
SLASH = "/"
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


class Char:
    def __init__(
        self,
        value: str,
        pos: int,
        line: int,
        line_pos: int,
    ):
        self.value = value
        self.pos = pos
        self.line = line
        self.line_pos = line_pos

    def is_delimiter(self):
        return self.value == DELIMITER

    def is_key(self):
        return (
            self.value.isalnum()
            or self.value == UNDERSCORE
            or self.value == DOT
            or self.value == COLON
            or self.value == SLASH
        )

    def is_op(self):
        return (
            self.value == EQUAL_SIGN
            or self.value == EXCL_MARK
            or self.value == TILDE
            or self.value == LOWER_THAN
            or self.value == GREATER_THAN
        )

    def is_group_open(self):
        return self.value == BRACKET_OPEN

    def is_group_close(self):
        return self.value == BRACKET_CLOSE

    def is_double_quote(self):
        return self.value == DOUBLE_QUOTE

    def is_double_quoted_value(self):
        return not self.is_double_quote()

    def is_single_quote(self):
        return self.value == SINGLE_QUOTE

    def is_single_quoted_value(self):
        return not self.is_single_quote()

    def is_backslash(self):
        return self.value == BACKSLASH

    def is_equals(self):
        return self.value == EQUAL_SIGN

    def is_value(self):
        return (
            not self.is_double_quote()
            and not self.is_single_quote()
            and not self.is_delimiter()
            and not self.is_group_open()
            and not self.is_group_close()
            and not self.is_equals()
        )

    def is_newline(self):
        return self.value == NEWLINE
