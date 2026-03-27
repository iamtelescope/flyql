from .constants import (
    AT,
    UNDERSCORE,
    HYPHEN,
    DOT,
    COLON,
    SLASH,
    TRANSFORMER_ARGUMENT_DELIMITER,
    BRACKET_OPEN,
    BRACKET_CLOSE,
    DOUBLE_QUOTE,
    SINGLE_QUOTE,
    TRANSFORMER_OPERATOR,
    COLUMNS_DELIMITER,
    ALIAS_DELIMITER,
    SPACE,
    BACKSLASH,
    NEWLINE,
)


class Char:
    def __init__(self, value: str, pos: int, line: int, line_pos: int):
        self.value = value
        self.pos = pos
        self.line = line
        self.line_pos = line_pos

    def is_column_value(self) -> bool:
        return (
            self.value.isalnum()
            or self.value == UNDERSCORE
            or self.value == HYPHEN
            or self.value == DOT
            or self.value == COLON
            or self.value == SLASH
            or self.value == SINGLE_QUOTE
            or self.value == DOUBLE_QUOTE
            or self.value == BACKSLASH
            or self.value == AT
        )

    def is_transformer_argument_value(self) -> bool:
        return (
            self.value != TRANSFORMER_ARGUMENT_DELIMITER
            and self.value != BRACKET_OPEN
            and self.value != BRACKET_CLOSE
        )

    def is_transformer_double_quoted_argument_value(self) -> bool:
        return not self.is_double_quote()

    def is_transformer_single_quoted_argument_value(self) -> bool:
        return not self.is_single_quote()

    def is_transformer_value(self) -> bool:
        return self.value.isalnum() or self.value == UNDERSCORE

    def is_alias_char(self) -> bool:
        return self.value in ["A", "a", "S", "s"]

    def is_bracket_open(self) -> bool:
        return self.value == BRACKET_OPEN

    def is_bracket_close(self) -> bool:
        return self.value == BRACKET_CLOSE

    def is_double_quote(self) -> bool:
        return self.value == DOUBLE_QUOTE

    def is_single_quote(self) -> bool:
        return self.value == SINGLE_QUOTE

    def is_transformer_operator(self) -> bool:
        return self.value == TRANSFORMER_OPERATOR

    def is_transformer_argument_delimiter(self) -> bool:
        return self.value == TRANSFORMER_ARGUMENT_DELIMITER

    def is_columns_delimiter(self) -> bool:
        return self.value == COLUMNS_DELIMITER

    def is_alias_delimiter(self) -> bool:
        return self.value == ALIAS_DELIMITER

    def is_space(self) -> bool:
        return self.value == SPACE

    def is_backslash(self) -> bool:
        return self.value == BACKSLASH

    def is_newline(self) -> bool:
        return self.value == NEWLINE
