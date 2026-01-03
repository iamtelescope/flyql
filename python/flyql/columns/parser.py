from typing import List, Dict, Any, Optional
from .char import Char
from .state import State
from .exceptions import ParserError
from .constants import (
    ESCAPE_SEQUENCES,
    DOUBLE_QUOTE,
    SINGLE_QUOTE,
    VALID_ALIAS_OPERATOR,
)


class Parser:
    def __init__(self) -> None:
        self.line = 0
        self.line_pos = 0
        self.char: Optional[Char] = None
        self.state = State.EXPECT_COLUMN
        self.error_text = ""
        self.errno = 0
        self.column = ""
        self.alias = ""
        self.alias_operator = ""
        self.modifier = ""
        self.modifier_argument = ""
        self.modifier_argument_type = "auto"
        self.modifiers: List[Dict[str, Any]] = []
        self.modifier_arguments: List[Any] = []
        self.columns: List[Dict[str, Any]] = []
        self.text = ""

    def set_text(self, text: str) -> None:
        self.text = text

    def store_column(self) -> None:
        self.columns.append(
            {
                "name": self.column,
                "modifiers": self.modifiers,
                "alias": self.alias if self.alias else None,
            }
        )
        self.reset_data()

    def store_modifier(self) -> None:
        self.modifiers.append(
            {
                "name": self.modifier,
                "arguments": self.modifier_arguments,
            }
        )
        self.reset_modifier()

    def store_argument(self) -> None:
        value: Any = self.modifier_argument
        if self.modifier_argument_type == "auto":
            try:
                value = int(value)
            except ValueError:
                try:
                    value = float(value)
                except ValueError:
                    pass
        self.modifier_arguments.append(value)
        self.reset_modifier_argument()

    def set_char(self, char: Char) -> None:
        self.char = char

    def set_state(self, state: State) -> None:
        self.state = state

    def reset_modifier(self) -> None:
        self.modifier = ""
        self.modifier_arguments = []
        self.modifier_argument = ""

    def reset_column(self) -> None:
        self.column = ""

    def reset_alias_operator(self) -> None:
        self.alias_operator = ""

    def reset_alias(self) -> None:
        self.alias = ""

    def reset_modifiers(self) -> None:
        self.modifiers = []

    def reset_modifier_argument(self) -> None:
        self.modifier_argument = ""
        self.modifier_argument_type = "auto"

    def reset_data(self) -> None:
        self.reset_column()
        self.reset_alias()
        self.reset_modifier()
        self.reset_modifiers()
        self.reset_alias_operator()

    def set_error_state(self, error_text: str, errno: int) -> None:
        self.state = State.ERROR
        self.error_text = error_text
        self.errno = errno
        if self.char:
            self.error_text += (
                f" [char {self.char.value} at pos {self.char.pos}], errno={errno}"
            )

    def extend_column(self) -> None:
        if self.char:
            self.column += self.char.value

    def extend_modifier(self) -> None:
        if self.char:
            self.modifier += self.char.value

    def extend_modifier_argument(self) -> None:
        if self.char:
            self.modifier_argument += self.char.value

    def extend_alias(self) -> None:
        if self.char:
            self.alias += self.char.value

    def extend_alias_operator(self) -> None:
        if self.char:
            self.alias_operator += self.char.value

    def parse(self, text: str) -> None:
        self.set_text(text)

        i = 0
        while i < len(text):
            parsed_newline = False
            if self.state == State.ERROR:
                break

            self.set_char(Char(text[i], i, self.line, self.line_pos))
            assert self.char is not None  # char is always set by set_char()
            if self.char.is_backslash():
                if i + 1 < len(text):
                    next_char = text[i + 1]
                    if next_char and ESCAPE_SEQUENCES.get(next_char):
                        parsed_newline = True
                        self.set_char(
                            Char(
                                ESCAPE_SEQUENCES[next_char], i, self.line, self.line_pos
                            )
                        )
                        i += 1

            if self.char.is_newline() and not parsed_newline:
                self.line += 1
                self.line_pos = 0
                i += 1
                continue

            if self.state == State.EXPECT_COLUMN:
                self.in_state_expect_column()
            elif self.state == State.COLUMN:
                self.in_state_column()
            elif self.state == State.EXPECT_ALIAS:
                self.in_state_expect_alias()
            elif self.state == State.EXPECT_ALIAS_OPERATOR:
                self.in_state_expect_alias_operator()
            elif self.state == State.EXPECT_ALIAS_DELIMITER:
                self.in_state_expect_alias_delimiter()
            elif self.state == State.EXPECT_MODIFIER:
                self.in_state_expect_modifier()
            elif self.state == State.EXPECT_MODIFIER_ARGUMENT:
                self.in_state_expect_modifier_argument()
            elif self.state == State.MODIFIER:
                self.in_state_modifier()
            elif self.state == State.MODIFIER_ARGUMENT:
                self.in_state_modifier_argument()
            elif self.state == State.MODIFIER_COMPLETE:
                self.in_state_modifier_complete()
            elif self.state == State.MODIFIER_ARGUMENT_DOUBLE_QUOTED:
                self.in_state_modifier_argument_double_quoted()
            elif self.state == State.MODIFIER_ARGUMENT_SINGLE_QUOTED:
                self.in_state_modifier_argument_single_quoted()
            elif self.state == State.EXPECT_MODIFIER_ARGUMENT_DELIMITER:
                self.in_state_expect_modifier_argument_delimiter()
            else:
                self.set_error_state(f"unknown state: {self.state}", 1)
            i += 1
            self.line_pos += 1

        if self.state == State.ERROR:
            raise ParserError(
                message=self.error_text,
                errno=self.errno,
            )

        self.in_state_last_char()

        # in_state_last_char() may set state to ERROR
        if self.state == State.ERROR:  # type: ignore[comparison-overlap]
            raise ParserError(
                message=self.error_text,
                errno=self.errno,
            )

    def in_state_last_char(self) -> None:
        if self.state == State.COLUMN:
            self.store_column()
        elif self.state == State.EXPECT_COLUMN:
            # Ended while expecting a column (e.g., after comma) - this is an error
            if not self.column:
                self.set_error_state("expected column after delimiter", 2)
        elif self.state == State.EXPECT_ALIAS:
            if self.alias:
                self.store_column()
            else:
                self.set_error_state(
                    "unexpected end of alias. Expected alias value", 13
                )
        elif self.state == State.EXPECT_ALIAS_OPERATOR:
            # Only error if we started reading an alias operator
            # If alias_operator is empty, we just had trailing spaces - that's OK
            if self.alias_operator:
                self.set_error_state(
                    "unexpected end of alias. Expected alias value", 14
                )
            else:
                # Just trailing spaces after column - store the column
                self.store_column()
        elif self.state == State.EXPECT_ALIAS_DELIMITER:
            self.set_error_state("unexpected end of alias. Expected alias value", 14)
        elif self.state == State.MODIFIER:
            if self.modifier:
                self.store_modifier()
            if self.column:
                self.store_column()
        elif self.state == State.MODIFIER_COMPLETE:
            self.store_modifier()
            self.store_column()
        elif (
            self.state == State.MODIFIER_ARGUMENT_DOUBLE_QUOTED
            or self.state == State.MODIFIER_ARGUMENT_SINGLE_QUOTED
        ):
            self.set_error_state("unexpected end of quoted argument value", 12)
        elif self.state == State.EXPECT_MODIFIER_ARGUMENT_DELIMITER:
            self.set_error_state("unexpected end of arguments list", 15)
        elif self.state == State.EXPECT_MODIFIER_ARGUMENT:
            # Ended while expecting modifier argument (unclosed parenthesis)
            self.set_error_state("expected closing parenthesis", 16)
        elif self.state == State.MODIFIER_ARGUMENT:
            # Ended in middle of reading argument
            self.set_error_state("expected closing parenthesis", 16)
        elif self.state == State.EXPECT_MODIFIER:
            # Ended after | with no modifier name
            self.set_error_state("expected modifier after operator", 7)

    def in_state_expect_column(self) -> None:
        if not self.char:
            return
        if self.char.is_space():
            return
        elif self.char.is_column_value():
            self.extend_column()
            self.set_state(State.COLUMN)
        else:
            self.set_error_state("invalid character", 2)

    def in_state_column(self) -> None:
        if not self.char:
            return
        if self.char.is_space():
            self.set_state(State.EXPECT_ALIAS_OPERATOR)
        elif self.char.is_column_value():
            self.extend_column()
        elif self.char.is_columns_delimiter():
            self.set_state(State.EXPECT_COLUMN)
            self.store_column()
        elif self.char.is_modifier_operator():
            self.set_state(State.EXPECT_MODIFIER)
        else:
            self.set_error_state("invalid character", 6)

    def in_state_expect_modifier(self) -> None:
        if not self.char:
            return
        if self.char.is_modifier_value():
            self.extend_modifier()
            self.set_state(State.MODIFIER)
        else:
            self.set_error_state("invalid character, expected modifier", 7)

    def in_state_modifier(self) -> None:
        if not self.char:
            return
        if self.char.is_modifier_value():
            self.extend_modifier()
        elif self.char.is_columns_delimiter():
            self.store_modifier()
            self.store_column()
            self.set_state(State.EXPECT_COLUMN)
        elif self.char.is_modifier_operator():
            self.store_modifier()
            self.set_state(State.EXPECT_MODIFIER)
        elif self.char.is_space():
            self.store_modifier()
            self.set_state(State.EXPECT_ALIAS_OPERATOR)
        elif self.char.is_bracket_open():
            self.set_state(State.EXPECT_MODIFIER_ARGUMENT)
        elif self.char.is_bracket_close():
            self.store_argument()
            self.store_modifier()
            raise ValueError("unsupported close bracket")
        else:
            raise ValueError("unsupported char in modifier")

    def in_state_expect_modifier_argument(self) -> None:
        if not self.char:
            return
        if self.char.is_space():
            return
        if self.char.is_double_quote():
            self.modifier_argument_type = "str"
            self.set_state(State.MODIFIER_ARGUMENT_DOUBLE_QUOTED)
        elif self.char.is_single_quote():
            self.modifier_argument_type = "str"
            self.set_state(State.MODIFIER_ARGUMENT_SINGLE_QUOTED)
        elif self.char.is_modifier_argument_value():
            self.extend_modifier_argument()
            self.set_state(State.MODIFIER_ARGUMENT)
        elif self.char.is_bracket_close():
            if self.modifier_argument:
                self.store_argument()
            self.set_state(State.MODIFIER_COMPLETE)

    def in_state_modifier_argument(self) -> None:
        if not self.char:
            return
        if self.char.is_modifier_argument_delimiter():
            self.store_argument()
            self.set_state(State.EXPECT_MODIFIER_ARGUMENT)
        elif self.char.is_modifier_argument_value():
            self.extend_modifier_argument()
        elif self.char.is_bracket_close():
            self.store_argument()
            self.set_state(State.MODIFIER_COMPLETE)

    def in_state_expect_modifier_argument_delimiter(self) -> None:
        if not self.char:
            return
        if self.char.is_modifier_argument_delimiter():
            self.set_state(State.EXPECT_MODIFIER_ARGUMENT)
        elif self.char.is_bracket_close():
            self.set_state(State.MODIFIER_COMPLETE)
        else:
            self.set_error_state(
                "invalid character. Expected bracket close or modifier argument delimiter",
                9,
            )

    def in_state_modifier_argument_double_quoted(self) -> None:
        if not self.char:
            return
        if self.char.is_backslash():
            next_pos = self.char.pos + 1
            try:
                next_char = self.text[next_pos]
            except IndexError:
                self.extend_modifier_argument()
            else:
                if next_char != DOUBLE_QUOTE:
                    self.extend_modifier_argument()
        elif self.char.is_modifier_double_quoted_argument_value():
            self.extend_modifier_argument()
        elif self.char.is_double_quote():
            prev_pos = self.char.pos - 1
            if self.text[prev_pos] == "\\":
                self.extend_modifier_argument()
            else:
                self.store_argument()
                self.set_state(State.EXPECT_MODIFIER_ARGUMENT_DELIMITER)
        else:
            self.set_error_state("invalid character", 10)

    def in_state_modifier_argument_single_quoted(self) -> None:
        if not self.char:
            return
        if self.char.is_backslash():
            next_pos = self.char.pos + 1
            try:
                next_char = self.text[next_pos]
            except IndexError:
                self.extend_modifier_argument()
            else:
                if next_char != SINGLE_QUOTE:
                    self.extend_modifier_argument()
        elif self.char.is_modifier_single_quoted_argument_value():
            self.extend_modifier_argument()
        elif self.char.is_single_quote():
            prev_pos = self.char.pos - 1
            if self.text[prev_pos] == "\\":
                self.extend_modifier_argument()
            else:
                self.store_argument()
                self.set_state(State.EXPECT_MODIFIER_ARGUMENT_DELIMITER)
        else:
            self.set_error_state("invalid character", 10)

    def in_state_modifier_complete(self) -> None:
        if not self.char:
            return
        if self.char.is_space():
            self.store_modifier()
            self.set_state(State.EXPECT_ALIAS_OPERATOR)
        elif self.char.is_columns_delimiter():
            self.store_modifier()
            self.store_column()
            self.set_state(State.EXPECT_COLUMN)
        elif self.char.is_modifier_operator():
            self.store_modifier()
            self.set_state(State.EXPECT_MODIFIER)
        else:
            self.set_error_state("invalid character", 8)

    def in_state_expect_alias_operator(self) -> None:
        if not self.char:
            return
        if self.char.is_space():
            return
        elif self.char.is_columns_delimiter():
            # Comma after column with spaces - just a delimiter, not an alias
            self.store_column()
            self.set_state(State.EXPECT_COLUMN)
        elif self.char.is_alias_char():
            self.extend_alias_operator()
            if len(self.alias_operator) < 2:
                return
            if len(self.alias_operator) == 2:
                if self.alias_operator.lower() != VALID_ALIAS_OPERATOR:
                    self.set_error_state("invalid character", 3)
                else:
                    self.set_state(State.EXPECT_ALIAS_DELIMITER)
                    self.reset_alias_operator()
            else:
                return
        else:
            self.set_error_state("invalid character, expected alias operator", 4)

    def in_state_expect_alias(self) -> None:
        if not self.char:
            return
        if self.char.is_space():
            return
        elif self.char.is_column_value():
            self.extend_alias()
        elif self.char.is_columns_delimiter():
            self.set_state(State.EXPECT_COLUMN)
            self.store_column()

    def in_state_expect_alias_delimiter(self) -> None:
        if not self.char:
            return
        if self.char.is_alias_delimiter():
            self.set_state(State.EXPECT_ALIAS)
        else:
            self.set_error_state("invalid character, expected alias delimiter", 5)
