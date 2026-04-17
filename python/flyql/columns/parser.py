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
from flyql.core.range import Range
from flyql.errors_generated import (
    COLUMNS_ERR_EXPECTED_CLOSING_PAREN,
    COLUMNS_ERR_INVALID_CHAR_AFTER_ARGS,
    COLUMNS_ERR_INVALID_CHAR_EXPECT_ALIAS_OPERATOR,
    COLUMNS_ERR_INVALID_CHAR_EXPECT_COLUMN,
    COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_DELIMITER,
    COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_OPERATOR,
    COLUMNS_ERR_INVALID_CHAR_IN_ARGS,
    COLUMNS_ERR_INVALID_CHAR_IN_COLUMN,
    COLUMNS_ERR_INVALID_CHAR_IN_QUOTED_ARG,
    COLUMNS_ERR_INVALID_TRANSFORMER_OR_RENDERER,
    COLUMNS_ERR_RENDERERS_NOT_ENABLED_OR_NO_ALIAS,
    COLUMNS_ERR_TRANSFORMERS_NOT_ENABLED,
    COLUMNS_ERR_UNEXPECTED_END_EXPECTED_ALIAS_VALUE,
    COLUMNS_ERR_UNEXPECTED_END_OF_ALIAS_OPERATOR,
    COLUMNS_ERR_UNEXPECTED_END_OF_ARGS_LIST,
    COLUMNS_ERR_UNEXPECTED_END_OF_QUOTED_ARG,
    COLUMNS_ERR_UNKNOWN_STATE,
)


class Parser:
    def __init__(self, capabilities: Optional[Dict[str, Any]] = None) -> None:
        defaults: Dict[str, Any] = {"transformers": False, "renderers": False}
        if capabilities is not None:
            defaults.update(capabilities)
        self.capabilities = defaults
        self.line = 0
        self.line_pos = 0
        self.char: Optional[Char] = None
        self.state = State.EXPECT_COLUMN
        self.error_text = ""
        self.errno = 0
        self.column = ""
        self.alias = ""
        self.alias_operator = ""
        self.transformer = ""
        self.transformer_argument = ""
        self.transformer_argument_type = "auto"
        self.transformers: List[Dict[str, Any]] = []
        self.transformer_arguments: List[Any] = []
        self.renderer = ""
        self.renderer_argument = ""
        self.renderer_argument_type = "auto"
        self.renderers: List[Dict[str, Any]] = []
        self.renderer_arguments: List[Any] = []
        self.columns: List[Dict[str, Any]] = []
        self.text = ""
        self._column_start: int = -1
        self._transformer_start: int = -1
        self._transformer_arg_start: int = -1
        self._transformer_arg_ranges: List[Range] = []
        self._renderer_start: int = -1
        self._renderer_arg_start: int = -1
        self._renderer_arg_ranges: List[Range] = []

    def set_text(self, text: str) -> None:
        self.text = text

    def store_column(self) -> None:
        name_range = (
            Range(self._column_start, self._column_start + len(self.column))
            if self._column_start >= 0
            else None
        )
        self.columns.append(
            {
                "name": self.column,
                "transformers": self.transformers,
                "renderers": list(self.renderers),
                "alias": self.alias if self.alias else None,
                "name_range": name_range,
            }
        )
        self.reset_data()

    def store_transformer(self) -> None:
        name_range = (
            Range(
                self._transformer_start,
                self._transformer_start + len(self.transformer),
            )
            if self._transformer_start >= 0
            else None
        )
        self.transformers.append(
            {
                "name": self.transformer,
                "arguments": self.transformer_arguments,
                "name_range": name_range,
                "argument_ranges": list(self._transformer_arg_ranges),
            }
        )
        self.reset_transformer()

    def store_argument(self) -> None:
        value: Any = self.transformer_argument
        if self.transformer_argument_type == "auto":
            try:
                value = int(value)
            except ValueError:
                try:
                    value = float(value)
                except ValueError:
                    pass
        self.transformer_arguments.append(value)
        if self._transformer_arg_start >= 0:
            if self.transformer_argument_type == "str":
                end = (
                    self.char.pos + 1
                    if self.char
                    else self._transformer_arg_start
                    + len(self.transformer_argument)
                    + 2
                )
            else:
                end = self._transformer_arg_start + len(self.transformer_argument)
            self._transformer_arg_ranges.append(Range(self._transformer_arg_start, end))
        self.reset_transformer_argument()

    def store_renderer(self) -> None:
        name_range = (
            Range(
                self._renderer_start,
                self._renderer_start + len(self.renderer),
            )
            if self._renderer_start >= 0
            else None
        )
        self.renderers.append(
            {
                "name": self.renderer,
                "arguments": self.renderer_arguments,
                "name_range": name_range,
                "argument_ranges": list(self._renderer_arg_ranges),
            }
        )
        self.reset_renderer()

    def store_renderer_argument(self) -> None:
        value: Any = self.renderer_argument
        if self.renderer_argument_type == "auto":
            try:
                value = int(value)
            except ValueError:
                try:
                    value = float(value)
                except ValueError:
                    pass
        self.renderer_arguments.append(value)
        if self._renderer_arg_start >= 0:
            if self.renderer_argument_type == "str":
                end = (
                    self.char.pos + 1
                    if self.char
                    else self._renderer_arg_start + len(self.renderer_argument) + 2
                )
            else:
                end = self._renderer_arg_start + len(self.renderer_argument)
            self._renderer_arg_ranges.append(Range(self._renderer_arg_start, end))
        self.reset_renderer_argument()

    def set_char(self, char: Char) -> None:
        self.char = char

    def set_state(self, state: State) -> None:
        self.state = state

    def reset_transformer(self) -> None:
        self.transformer = ""
        self.transformer_arguments = []
        self.transformer_argument = ""
        self._transformer_start = -1
        self._transformer_arg_start = -1
        self._transformer_arg_ranges = []

    def reset_column(self) -> None:
        self.column = ""

    def reset_alias_operator(self) -> None:
        self.alias_operator = ""

    def reset_alias(self) -> None:
        self.alias = ""

    def reset_transformers(self) -> None:
        self.transformers = []

    def reset_transformer_argument(self) -> None:
        self.transformer_argument = ""
        self.transformer_argument_type = "auto"
        self._transformer_arg_start = -1

    def reset_renderer(self) -> None:
        self.renderer = ""
        self.renderer_arguments = []
        self.renderer_argument = ""
        self._renderer_start = -1
        self._renderer_arg_start = -1
        self._renderer_arg_ranges = []

    def reset_renderers(self) -> None:
        self.renderers = []

    def reset_renderer_argument(self) -> None:
        self.renderer_argument = ""
        self.renderer_argument_type = "auto"
        self._renderer_arg_start = -1

    def reset_data(self) -> None:
        self.reset_column()
        self.reset_alias()
        self.reset_transformer()
        self.reset_transformers()
        self.reset_renderer()
        self.reset_renderers()
        self.reset_alias_operator()
        self._column_start = -1

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
            if self._column_start < 0:
                self._column_start = self.char.pos
            self.column += self.char.value

    def extend_transformer(self) -> None:
        if self.char:
            if self._transformer_start < 0:
                self._transformer_start = self.char.pos
            self.transformer += self.char.value

    def extend_transformer_argument(self) -> None:
        if self.char:
            if self._transformer_arg_start < 0:
                self._transformer_arg_start = self.char.pos
            self.transformer_argument += self.char.value

    def extend_renderer(self) -> None:
        if self.char:
            if self._renderer_start < 0:
                self._renderer_start = self.char.pos
            self.renderer += self.char.value

    def extend_renderer_argument(self) -> None:
        if self.char:
            if self._renderer_arg_start < 0:
                self._renderer_arg_start = self.char.pos
            self.renderer_argument += self.char.value

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
            elif self.state == State.EXPECT_TRANSFORMER:
                self.in_state_expect_transformer()
            elif self.state == State.EXPECT_TRANSFORMER_ARGUMENT:
                self.in_state_expect_transformer_argument()
            elif self.state == State.TRANSFORMER:
                self.in_state_transformer()
            elif self.state == State.TRANSFORMER_ARGUMENT:
                self.in_state_transformer_argument()
            elif self.state == State.TRANSFORMER_COMPLETE:
                self.in_state_transformer_complete()
            elif self.state == State.TRANSFORMER_ARGUMENT_DOUBLE_QUOTED:
                self.in_state_transformer_argument_double_quoted()
            elif self.state == State.TRANSFORMER_ARGUMENT_SINGLE_QUOTED:
                self.in_state_transformer_argument_single_quoted()
            elif self.state == State.EXPECT_TRANSFORMER_ARGUMENT_DELIMITER:
                self.in_state_expect_transformer_argument_delimiter()
            elif self.state == State.EXPECT_RENDERER:
                self.in_state_expect_renderer()
            elif self.state == State.RENDERER:
                self.in_state_renderer()
            elif self.state == State.RENDERER_COMPLETE:
                self.in_state_renderer_complete()
            elif self.state == State.EXPECT_RENDERER_ARGUMENT:
                self.in_state_expect_renderer_argument()
            elif self.state == State.RENDERER_ARGUMENT:
                self.in_state_renderer_argument()
            elif self.state == State.RENDERER_ARGUMENT_DOUBLE_QUOTED:
                self.in_state_renderer_argument_double_quoted()
            elif self.state == State.RENDERER_ARGUMENT_SINGLE_QUOTED:
                self.in_state_renderer_argument_single_quoted()
            elif self.state == State.EXPECT_RENDERER_ARGUMENT_DELIMITER:
                self.in_state_expect_renderer_argument_delimiter()
            else:
                self.set_error_state(
                    f"unknown state: {self.state}", COLUMNS_ERR_UNKNOWN_STATE
                )
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
            return
        elif self.state == State.EXPECT_ALIAS:
            if self.alias:
                self.store_column()
            else:
                self.set_error_state(
                    "unexpected end of alias. Expected alias value",
                    COLUMNS_ERR_UNEXPECTED_END_OF_ALIAS_OPERATOR,
                )
        elif self.state == State.EXPECT_ALIAS_OPERATOR:
            # Only error if we started reading an alias operator
            # If alias_operator is empty, we just had trailing spaces - that's OK
            if self.alias_operator:
                self.set_error_state(
                    "unexpected end of alias. Expected alias value",
                    COLUMNS_ERR_UNEXPECTED_END_EXPECTED_ALIAS_VALUE,
                )
            else:
                # Just trailing spaces after column - store the column
                self.store_column()
        elif self.state == State.EXPECT_ALIAS_DELIMITER:
            self.set_error_state(
                "unexpected end of alias. Expected alias value",
                COLUMNS_ERR_UNEXPECTED_END_EXPECTED_ALIAS_VALUE,
            )
        elif self.state == State.TRANSFORMER:
            if self.transformer:
                self.store_transformer()
            if self.column:
                self.store_column()
        elif self.state == State.TRANSFORMER_COMPLETE:
            self.store_transformer()
            self.store_column()
        elif (
            self.state == State.TRANSFORMER_ARGUMENT_DOUBLE_QUOTED
            or self.state == State.TRANSFORMER_ARGUMENT_SINGLE_QUOTED
        ):
            self.set_error_state(
                "unexpected end of quoted argument value",
                COLUMNS_ERR_UNEXPECTED_END_OF_QUOTED_ARG,
            )
        elif self.state == State.EXPECT_TRANSFORMER_ARGUMENT_DELIMITER:
            self.set_error_state(
                "unexpected end of arguments list",
                COLUMNS_ERR_UNEXPECTED_END_OF_ARGS_LIST,
            )
        elif self.state == State.EXPECT_TRANSFORMER_ARGUMENT:
            # Ended while expecting transformer argument (unclosed parenthesis)
            self.set_error_state(
                "expected closing parenthesis", COLUMNS_ERR_EXPECTED_CLOSING_PAREN
            )
        elif self.state == State.TRANSFORMER_ARGUMENT:
            # Ended in middle of reading argument
            self.set_error_state(
                "expected closing parenthesis", COLUMNS_ERR_EXPECTED_CLOSING_PAREN
            )
        elif self.state == State.EXPECT_TRANSFORMER:
            # Ended after | with no transformer name
            self.set_error_state(
                "expected transformer after operator",
                COLUMNS_ERR_INVALID_TRANSFORMER_OR_RENDERER,
            )
        elif self.state == State.RENDERER:
            if self.renderer:
                self.store_renderer()
            if self.column:
                self.store_column()
        elif self.state == State.RENDERER_COMPLETE:
            self.store_renderer()
            self.store_column()
        elif (
            self.state == State.RENDERER_ARGUMENT_DOUBLE_QUOTED
            or self.state == State.RENDERER_ARGUMENT_SINGLE_QUOTED
        ):
            self.set_error_state(
                "unexpected end of quoted argument value",
                COLUMNS_ERR_UNEXPECTED_END_OF_QUOTED_ARG,
            )
        elif self.state == State.EXPECT_RENDERER_ARGUMENT_DELIMITER:
            self.set_error_state(
                "unexpected end of arguments list",
                COLUMNS_ERR_UNEXPECTED_END_OF_ARGS_LIST,
            )
        elif self.state == State.EXPECT_RENDERER_ARGUMENT:
            self.set_error_state(
                "expected closing parenthesis", COLUMNS_ERR_EXPECTED_CLOSING_PAREN
            )
        elif self.state == State.RENDERER_ARGUMENT:
            self.set_error_state(
                "expected closing parenthesis", COLUMNS_ERR_EXPECTED_CLOSING_PAREN
            )
        elif self.state == State.EXPECT_RENDERER:
            self.set_error_state(
                "expected renderer after operator",
                COLUMNS_ERR_INVALID_TRANSFORMER_OR_RENDERER,
            )

    def in_state_expect_column(self) -> None:
        if not self.char:
            return
        if self.char.is_space():
            return
        elif self.char.is_column_value():
            self.extend_column()
            self.set_state(State.COLUMN)
        else:
            self.set_error_state(
                "invalid character", COLUMNS_ERR_INVALID_CHAR_EXPECT_COLUMN
            )

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
        elif self.char.is_transformer_operator():
            if not self.capabilities["transformers"]:
                self.set_error_state(
                    "transformers are not enabled", COLUMNS_ERR_TRANSFORMERS_NOT_ENABLED
                )
                return
            self.set_state(State.EXPECT_TRANSFORMER)
        else:
            self.set_error_state(
                "invalid character", COLUMNS_ERR_INVALID_CHAR_IN_COLUMN
            )

    def in_state_expect_transformer(self) -> None:
        if not self.char:
            return
        if self.char.is_transformer_value():
            self.extend_transformer()
            self.set_state(State.TRANSFORMER)
        else:
            self.set_error_state(
                "invalid character, expected transformer",
                COLUMNS_ERR_INVALID_TRANSFORMER_OR_RENDERER,
            )

    def in_state_transformer(self) -> None:
        if not self.char:
            return
        if self.char.is_transformer_value():
            self.extend_transformer()
        elif self.char.is_columns_delimiter():
            self.store_transformer()
            self.store_column()
            self.set_state(State.EXPECT_COLUMN)
        elif self.char.is_transformer_operator():
            self.store_transformer()
            self.set_state(State.EXPECT_TRANSFORMER)
        elif self.char.is_space():
            self.store_transformer()
            self.set_state(State.EXPECT_ALIAS_OPERATOR)
        elif self.char.is_bracket_open():
            self.set_state(State.EXPECT_TRANSFORMER_ARGUMENT)
        elif self.char.is_bracket_close():
            self.store_argument()
            self.store_transformer()
            raise ValueError("unsupported close bracket")
        else:
            raise ValueError("unsupported char in transformer")

    def in_state_expect_transformer_argument(self) -> None:
        if not self.char:
            return
        if self.char.is_space():
            return
        if self.char.is_double_quote():
            self.transformer_argument_type = "str"
            self._transformer_arg_start = self.char.pos
            self.set_state(State.TRANSFORMER_ARGUMENT_DOUBLE_QUOTED)
        elif self.char.is_single_quote():
            self.transformer_argument_type = "str"
            self._transformer_arg_start = self.char.pos
            self.set_state(State.TRANSFORMER_ARGUMENT_SINGLE_QUOTED)
        elif self.char.is_transformer_argument_value():
            self.extend_transformer_argument()
            self.set_state(State.TRANSFORMER_ARGUMENT)
        elif self.char.is_bracket_close():
            if self.transformer_argument:
                self.store_argument()
            self.set_state(State.TRANSFORMER_COMPLETE)

    def in_state_transformer_argument(self) -> None:
        if not self.char:
            return
        if self.char.is_transformer_argument_delimiter():
            self.store_argument()
            self.set_state(State.EXPECT_TRANSFORMER_ARGUMENT)
        elif self.char.is_transformer_argument_value():
            self.extend_transformer_argument()
        elif self.char.is_bracket_close():
            self.store_argument()
            self.set_state(State.TRANSFORMER_COMPLETE)

    def in_state_expect_transformer_argument_delimiter(self) -> None:
        if not self.char:
            return
        if self.char.is_transformer_argument_delimiter():
            self.set_state(State.EXPECT_TRANSFORMER_ARGUMENT)
        elif self.char.is_bracket_close():
            self.set_state(State.TRANSFORMER_COMPLETE)
        else:
            self.set_error_state(
                "invalid character. Expected bracket close or transformer argument delimiter",
                COLUMNS_ERR_INVALID_CHAR_IN_ARGS,
            )

    def in_state_transformer_argument_double_quoted(self) -> None:
        if not self.char:
            return
        if self.char.is_backslash():
            next_pos = self.char.pos + 1
            try:
                next_char = self.text[next_pos]
            except IndexError:
                self.extend_transformer_argument()
            else:
                if next_char != DOUBLE_QUOTE:
                    self.extend_transformer_argument()
        elif self.char.is_transformer_double_quoted_argument_value():
            self.extend_transformer_argument()
        elif self.char.is_double_quote():
            prev_pos = self.char.pos - 1
            if self.text[prev_pos] == "\\":
                self.extend_transformer_argument()
            else:
                self.store_argument()
                self.set_state(State.EXPECT_TRANSFORMER_ARGUMENT_DELIMITER)
        else:
            self.set_error_state(
                "invalid character", COLUMNS_ERR_INVALID_CHAR_IN_QUOTED_ARG
            )

    def in_state_transformer_argument_single_quoted(self) -> None:
        if not self.char:
            return
        if self.char.is_backslash():
            next_pos = self.char.pos + 1
            try:
                next_char = self.text[next_pos]
            except IndexError:
                self.extend_transformer_argument()
            else:
                if next_char != SINGLE_QUOTE:
                    self.extend_transformer_argument()
        elif self.char.is_transformer_single_quoted_argument_value():
            self.extend_transformer_argument()
        elif self.char.is_single_quote():
            prev_pos = self.char.pos - 1
            if self.text[prev_pos] == "\\":
                self.extend_transformer_argument()
            else:
                self.store_argument()
                self.set_state(State.EXPECT_TRANSFORMER_ARGUMENT_DELIMITER)
        else:
            self.set_error_state(
                "invalid character", COLUMNS_ERR_INVALID_CHAR_IN_QUOTED_ARG
            )

    def in_state_transformer_complete(self) -> None:
        if not self.char:
            return
        if self.char.is_space():
            self.store_transformer()
            self.set_state(State.EXPECT_ALIAS_OPERATOR)
        elif self.char.is_columns_delimiter():
            self.store_transformer()
            self.store_column()
            self.set_state(State.EXPECT_COLUMN)
        elif self.char.is_transformer_operator():
            if not self.capabilities["transformers"]:
                self.set_error_state(
                    "transformers are not enabled", COLUMNS_ERR_TRANSFORMERS_NOT_ENABLED
                )
                return
            self.store_transformer()
            self.set_state(State.EXPECT_TRANSFORMER)
        else:
            self.set_error_state(
                "invalid character", COLUMNS_ERR_INVALID_CHAR_AFTER_ARGS
            )

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
                    self.set_error_state(
                        "invalid character",
                        COLUMNS_ERR_INVALID_CHAR_EXPECT_ALIAS_OPERATOR,
                    )
                else:
                    self.set_state(State.EXPECT_ALIAS_DELIMITER)
                    self.reset_alias_operator()
            else:
                return
        else:
            self.set_error_state(
                "invalid character, expected alias operator",
                COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_OPERATOR,
            )

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
        elif self.char.is_transformer_operator():
            if not self.capabilities["renderers"]:
                self.set_error_state(
                    "renderers are not enabled",
                    COLUMNS_ERR_RENDERERS_NOT_ENABLED_OR_NO_ALIAS,
                )
                return
            if not self.alias:
                self.set_error_state(
                    "renderers require an alias",
                    COLUMNS_ERR_RENDERERS_NOT_ENABLED_OR_NO_ALIAS,
                )
                return
            self.set_state(State.EXPECT_RENDERER)

    def in_state_expect_renderer(self) -> None:
        if not self.char:
            return
        if self.char.is_transformer_value():
            self.extend_renderer()
            self.set_state(State.RENDERER)
        else:
            self.set_error_state(
                "invalid character, expected renderer",
                COLUMNS_ERR_INVALID_TRANSFORMER_OR_RENDERER,
            )

    def in_state_renderer(self) -> None:
        if not self.char:
            return
        if self.char.is_transformer_value():
            self.extend_renderer()
        elif self.char.is_columns_delimiter():
            self.store_renderer()
            self.store_column()
            self.set_state(State.EXPECT_COLUMN)
        elif self.char.is_transformer_operator():
            self.store_renderer()
            self.set_state(State.EXPECT_RENDERER)
        elif self.char.is_space():
            # Do NOT store here — RENDERER_COMPLETE handlers (on ',', '|',
            # or EOF via in_state_last_char) perform the single store.
            # Storing here would create a phantom empty renderer on any
            # subsequent separator, because those handlers re-store.
            self.set_state(State.RENDERER_COMPLETE)
        elif self.char.is_bracket_open():
            self.set_state(State.EXPECT_RENDERER_ARGUMENT)
        else:
            self.set_error_state(
                "invalid character in renderer name",
                COLUMNS_ERR_INVALID_TRANSFORMER_OR_RENDERER,
            )

    def in_state_expect_renderer_argument(self) -> None:
        if not self.char:
            return
        if self.char.is_space():
            return
        if self.char.is_double_quote():
            self.renderer_argument_type = "str"
            self._renderer_arg_start = self.char.pos
            self.set_state(State.RENDERER_ARGUMENT_DOUBLE_QUOTED)
        elif self.char.is_single_quote():
            self.renderer_argument_type = "str"
            self._renderer_arg_start = self.char.pos
            self.set_state(State.RENDERER_ARGUMENT_SINGLE_QUOTED)
        elif self.char.is_transformer_argument_value():
            self.extend_renderer_argument()
            self.set_state(State.RENDERER_ARGUMENT)
        elif self.char.is_bracket_close():
            if self.renderer_argument:
                self.store_renderer_argument()
            self.set_state(State.RENDERER_COMPLETE)

    def in_state_renderer_argument(self) -> None:
        if not self.char:
            return
        if self.char.is_transformer_argument_delimiter():
            self.store_renderer_argument()
            self.set_state(State.EXPECT_RENDERER_ARGUMENT)
        elif self.char.is_transformer_argument_value():
            self.extend_renderer_argument()
        elif self.char.is_bracket_close():
            self.store_renderer_argument()
            self.set_state(State.RENDERER_COMPLETE)

    def in_state_expect_renderer_argument_delimiter(self) -> None:
        if not self.char:
            return
        if self.char.is_transformer_argument_delimiter():
            self.set_state(State.EXPECT_RENDERER_ARGUMENT)
        elif self.char.is_bracket_close():
            self.set_state(State.RENDERER_COMPLETE)
        else:
            self.set_error_state(
                "invalid character. Expected bracket close or renderer argument delimiter",
                COLUMNS_ERR_INVALID_CHAR_IN_ARGS,
            )

    def in_state_renderer_argument_double_quoted(self) -> None:
        if not self.char:
            return
        if self.char.is_backslash():
            next_pos = self.char.pos + 1
            try:
                next_char = self.text[next_pos]
            except IndexError:
                self.extend_renderer_argument()
            else:
                if next_char != DOUBLE_QUOTE:
                    self.extend_renderer_argument()
        elif self.char.is_transformer_double_quoted_argument_value():
            self.extend_renderer_argument()
        elif self.char.is_double_quote():
            prev_pos = self.char.pos - 1
            if self.text[prev_pos] == "\\":
                self.extend_renderer_argument()
            else:
                self.store_renderer_argument()
                self.set_state(State.EXPECT_RENDERER_ARGUMENT_DELIMITER)
        else:
            self.set_error_state(
                "invalid character", COLUMNS_ERR_INVALID_CHAR_IN_QUOTED_ARG
            )

    def in_state_renderer_argument_single_quoted(self) -> None:
        if not self.char:
            return
        if self.char.is_backslash():
            next_pos = self.char.pos + 1
            try:
                next_char = self.text[next_pos]
            except IndexError:
                self.extend_renderer_argument()
            else:
                if next_char != SINGLE_QUOTE:
                    self.extend_renderer_argument()
        elif self.char.is_transformer_single_quoted_argument_value():
            self.extend_renderer_argument()
        elif self.char.is_single_quote():
            prev_pos = self.char.pos - 1
            if self.text[prev_pos] == "\\":
                self.extend_renderer_argument()
            else:
                self.store_renderer_argument()
                self.set_state(State.EXPECT_RENDERER_ARGUMENT_DELIMITER)
        else:
            self.set_error_state(
                "invalid character", COLUMNS_ERR_INVALID_CHAR_IN_QUOTED_ARG
            )

    def in_state_renderer_complete(self) -> None:
        if not self.char:
            return
        if self.char.is_space():
            return
        elif self.char.is_columns_delimiter():
            self.store_renderer()
            self.store_column()
            self.set_state(State.EXPECT_COLUMN)
        elif self.char.is_transformer_operator():
            self.store_renderer()
            self.set_state(State.EXPECT_RENDERER)
        else:
            self.set_error_state(
                "invalid character", COLUMNS_ERR_INVALID_CHAR_AFTER_ARGS
            )

    def in_state_expect_alias_delimiter(self) -> None:
        if not self.char:
            return
        if self.char.is_alias_delimiter():
            self.set_state(State.EXPECT_ALIAS)
        else:
            self.set_error_state(
                "invalid character, expected alias delimiter",
                COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_DELIMITER,
            )
