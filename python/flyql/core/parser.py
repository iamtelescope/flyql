from typing import List, Optional, Union

from flyql.core.tree import Node
from flyql.core.expression import Expression
from flyql.core.char import Char
from flyql.core.state import State
from flyql.core.exceptions import FlyqlError
from flyql.core.constants import VALID_BOOL_OPERATORS
from flyql.core.constants import VALID_KEY_VALUE_OPERATORS
from flyql.core.constants import VALID_BOOL_OPERATORS_CHARS
from flyql.core.constants import CharType
from flyql.core.constants import NOT_KEYWORD
from flyql.core.constants import Operator
from flyql.core.key import parse_key


class ParserError(FlyqlError):
    def __init__(self, message: str, errno: int) -> None:
        super().__init__(message)
        self.errno = errno

    def __str__(self) -> str:
        return self.message

    def __repr__(self) -> str:
        return str(self)


class Parser:
    def __init__(self) -> None:
        self.pos: int = 0
        self.line = 0
        self.line_pos = 0
        self.text: str = ""
        self.state: State = State.INITIAL
        self.char: Optional[Char] = None
        self.key: str = ""
        self.value: str = ""
        self.value_is_string: Union[bool, None] = None
        self.key_value_operator: str = ""
        self.bool_operator: str = "and"
        self.current_node: Optional[Node] = None
        self.nodes_stack: List[Node] = []
        self.bool_op_stack: List[str] = []
        self.error_text: str = ""
        self.errno: int = 0
        self.root: Union[Node, None] = None
        self.typed_chars: List[tuple[Char, CharType]] = []
        self.pending_negation: bool = False
        self.negation_stack: List[bool] = []

    def set_state(self, state: State) -> None:
        self.state = state

    def set_text(self, text: str) -> None:
        self.text = text

    def set_char(self, char: Char) -> None:
        self.char = char

    def set_current_node(self, node: Optional[Node]) -> None:
        self.current_node = node

    def set_value_is_string(self) -> None:
        self.value_is_string = True

    def set_error_state(self, error_text: str, errno: int) -> None:
        self.state = State.ERROR
        self.error_text = error_text
        self.errno = errno
        if self.char:
            self.error_text += (
                f" [char {self.char.value} at {self.char.pos}], errno={errno}"
            )

    def reset_pos(self) -> None:
        self.pos = 0

    def reset_key(self) -> None:
        self.key = ""

    def reset_value(self) -> None:
        self.value = ""
        self.reset_value_is_string()

    def reset_value_is_string(self) -> None:
        self.value_is_string = None

    def reset_key_value_operator(self) -> None:
        self.key_value_operator = ""

    def reset_data(self) -> None:
        self.reset_key()
        self.reset_value()
        self.reset_key_value_operator()

    def reset_bool_operator(self) -> None:
        self.bool_operator = ""

    def extend_key(self) -> None:
        if self.char:
            self.key += self.char.value

    def extend_value(self) -> None:
        if self.char:
            self.value += self.char.value

    def extend_key_value_operator(self) -> None:
        if self.char:
            self.key_value_operator += self.char.value

    def extend_bool_operator(self) -> None:
        if self.char:
            self.bool_operator += self.char.value

    def extend_nodes_stack(self) -> None:
        if self.current_node:
            self.nodes_stack.append(self.current_node)

    def extend_bool_op_stack(self) -> None:
        self.bool_op_stack.append(self.bool_operator)

    def store_typed_char(self, char_type: CharType) -> None:
        if self.char is not None:
            self.typed_chars.append((self.char, char_type))

    def new_node(
        self,
        bool_operator: str,
        expression: Union[Expression, None],
        left: Union[Node, None],
        right: Union[Node, None],
        negated: bool = False,
    ) -> Node:
        return Node(
            bool_operator=bool_operator,
            expression=expression,
            left=left,
            right=right,
            negated=negated,
        )

    def new_expression(self) -> Expression:
        return Expression(
            key=parse_key(self.key),
            operator=self.key_value_operator,
            value=self.value,
            value_is_string=self.value_is_string,
        )

    def new_truthy_expression(self) -> Expression:
        """Create a truthy expression (standalone key check)"""
        return Expression(
            key=parse_key(self.key),
            operator=Operator.TRUTHY.value,
            value="",
            value_is_string=True,
        )

    def toggle_pending_negation(self) -> None:
        """Toggle the pending negation flag (handles double negation)"""
        self.pending_negation = not self.pending_negation

    def consume_pending_negation(self) -> bool:
        """Consume and return pending negation, resetting it to False"""
        negated = self.pending_negation
        self.pending_negation = False
        return negated

    def extend_tree(self, expression: Union[Expression, None] = None) -> None:
        """Extend the AST with an expression. If expression is None, creates one from current state."""
        if expression is None:
            expression = self.new_expression()
        negated = self.consume_pending_negation()

        if self.current_node and self.current_node.left is None:
            node = self.new_node(
                bool_operator="",
                expression=expression,
                left=None,
                right=None,
                negated=negated,
            )
            self.current_node.set_left(node)
            self.current_node.set_bool_operator(self.bool_operator)
        elif self.current_node and self.current_node.right is None:
            node = self.new_node(
                bool_operator="",
                expression=expression,
                left=None,
                right=None,
                negated=negated,
            )
            self.current_node.set_right(node)
            self.current_node.set_bool_operator(self.bool_operator)
        else:
            right = self.new_node(
                bool_operator="",
                expression=expression,
                left=None,
                right=None,
                negated=negated,
            )
            node = self.new_node(
                bool_operator=self.bool_operator,
                expression=None,
                left=self.current_node,
                right=right,
            )
            self.set_current_node(node)

    def extend_tree_from_stack(self, bool_operator: str) -> None:
        node = self.nodes_stack.pop()
        negated = self.negation_stack.pop() if self.negation_stack else False

        if node.right is None:
            if self.current_node:
                self._apply_negation_to_tree(self.current_node, negated)
            node.right = self.current_node
            node.set_bool_operator(bool_operator)
            self.set_current_node(node)
        else:
            if self.current_node:
                self._apply_negation_to_tree(self.current_node, negated)
            new_node = self.new_node(
                bool_operator=bool_operator,
                expression=None,
                left=node,
                right=self.current_node,
            )
            self.set_current_node(new_node)

    def _apply_negation_to_tree(self, node: Node, negated: bool) -> None:
        if not negated:
            return

        if (
            node.expression is None
            and node.left is not None
            and node.left.expression is not None
            and node.right is None
        ):
            node.left.negated = negated
        else:
            node.negated = negated

    def in_state_initial(self) -> None:
        if not self.char:
            return

        self.reset_data()
        self.set_current_node(
            self.new_node(
                bool_operator=self.bool_operator,
                expression=None,
                left=None,
                right=None,
            )
        )
        if self.char.is_group_open():
            self.extend_nodes_stack()
            self.extend_bool_op_stack()
            self.negation_stack.append(False)  # No negation for regular groups
            self.set_state(State.INITIAL)
            self.store_typed_char(CharType.OPERATOR)
        elif self.char.is_delimiter():
            self.set_state(State.BOOL_OP_DELIMITER)
            self.store_typed_char(CharType.SPACE)
        elif self.char.is_key():
            self.extend_key()
            self.set_state(State.KEY)
            self.store_typed_char(CharType.KEY)
        elif self.char.is_single_quote():
            self.extend_key()
            self.set_state(State.SINGLE_QUOTED_KEY)
            self.store_typed_char(CharType.KEY)
        elif self.char.is_double_quote():
            self.extend_key()
            self.set_state(State.DOUBLE_QUOTED_KEY)
            self.store_typed_char(CharType.KEY)
        else:
            self.set_error_state("invalid character", 1)
            return

    def in_state_key(self) -> None:
        if not self.char:
            return

        if self.char.is_delimiter():
            if self.key == NOT_KEYWORD:
                self.toggle_pending_negation()
                self.reset_key()
                self.set_state(State.EXPECT_NOT_TARGET)
                self.store_typed_char(CharType.OPERATOR)
            else:
                self.set_state(State.KEY_OR_BOOL_OP)
                self.store_typed_char(CharType.SPACE)
        elif self.char.is_key():
            self.extend_key()
            self.store_typed_char(CharType.KEY)
        elif self.char.is_single_quote():
            self.extend_key()
            self.set_state(State.SINGLE_QUOTED_KEY)
            self.store_typed_char(CharType.KEY)
        elif self.char.is_double_quote():
            self.extend_key()
            self.set_state(State.DOUBLE_QUOTED_KEY)
            self.store_typed_char(CharType.KEY)
        elif self.char.is_op():
            self.extend_key_value_operator()
            self.set_state(State.KEY_VALUE_OPERATOR)
            self.store_typed_char(CharType.OPERATOR)
        elif self.char.is_group_close():
            # End of group with truthy expression
            if not self.nodes_stack:
                self.set_error_state("unmatched parenthesis", 9)
                return
            self.extend_tree(self.new_truthy_expression())
            self.reset_data()
            if self.bool_op_stack:
                self.bool_operator = self.bool_op_stack.pop()
            self.extend_tree_from_stack(bool_operator=self.bool_operator)
            self.reset_bool_operator()
            self.set_state(State.EXPECT_BOOL_OP)
            self.store_typed_char(CharType.OPERATOR)
        else:
            self.set_error_state("invalid character", 3)
            return

    def in_state_expect_operator(self) -> None:
        if not self.char:
            return

        if self.char.is_delimiter():
            self.store_typed_char(CharType.SPACE)
            return
        elif self.char.is_op():
            self.extend_key_value_operator()
            self.set_state(State.KEY_VALUE_OPERATOR)
            self.store_typed_char(CharType.OPERATOR)
        else:
            self.set_error_state("expected operator", 28)

    def in_state_key_value_operator(self) -> None:
        if not self.char:
            return

        if self.char.is_delimiter():
            self.store_typed_char(CharType.SPACE)
            if self.key_value_operator not in VALID_KEY_VALUE_OPERATORS:
                self.set_error_state(f"unknown operator: {self.key_value_operator}", 10)
            else:
                self.set_state(State.EXPECT_VALUE)
        elif self.char.is_op():
            self.extend_key_value_operator()
            self.store_typed_char(CharType.OPERATOR)
        elif self.char.is_value():
            if self.key_value_operator not in VALID_KEY_VALUE_OPERATORS:
                self.set_error_state(f"unknown operator: {self.key_value_operator}", 10)
            else:
                self.set_state(State.VALUE)
                self.extend_value()
                self.store_typed_char(CharType.VALUE)
        elif self.char.is_single_quote():
            if self.key_value_operator not in VALID_KEY_VALUE_OPERATORS:
                self.set_error_state(f"unknown operator: {self.key_value_operator}", 10)
            else:
                self.set_value_is_string()
                self.set_state(State.SINGLE_QUOTED_VALUE)
                self.store_typed_char(CharType.VALUE)
        elif self.char.is_double_quote():
            if self.key_value_operator not in VALID_KEY_VALUE_OPERATORS:
                self.set_error_state(f"unknown operator: {self.key_value_operator}", 10)
            else:
                self.set_value_is_string()
                self.set_state(State.DOUBLE_QUOTED_VALUE)
                self.store_typed_char(CharType.VALUE)
        else:
            self.set_error_state("invalid character", 4)

    def in_state_expect_value(self) -> None:
        if not self.char:
            return

        if self.char.is_delimiter():
            self.store_typed_char(CharType.SPACE)
            return
        elif self.char.is_value():
            self.set_state(State.VALUE)
            self.extend_value()
            self.store_typed_char(CharType.VALUE)
        elif self.char.is_single_quote():
            self.set_value_is_string()
            self.set_state(State.SINGLE_QUOTED_VALUE)
            self.store_typed_char(CharType.VALUE)
        elif self.char.is_double_quote():
            self.set_value_is_string()
            self.set_state(State.DOUBLE_QUOTED_VALUE)
            self.store_typed_char(CharType.VALUE)
        else:
            self.set_error_state("expected value", 29)

    def in_state_value(self) -> None:
        if not self.char:
            return

        if self.char.is_value():
            self.extend_value()
            self.store_typed_char(CharType.VALUE)
        elif self.char.is_delimiter():
            self.set_state(State.EXPECT_BOOL_OP)
            self.extend_tree()
            self.reset_data()
            self.reset_bool_operator()
            self.store_typed_char(CharType.SPACE)
        elif self.char.is_group_close():
            if not self.nodes_stack:
                self.set_error_state("unmatched parenthesis", 9)
                return
            else:
                self.extend_tree()
                self.reset_data()
                if self.bool_op_stack:
                    self.bool_operator = self.bool_op_stack.pop()
                self.extend_tree_from_stack(bool_operator=self.bool_operator)
                self.reset_bool_operator()
                self.set_state(State.EXPECT_BOOL_OP)
                self.store_typed_char(CharType.OPERATOR)
        else:
            self.set_error_state("invalid character", 10)
            return

    def in_state_single_quoted_value(self) -> None:
        if not self.char:
            return

        if self.char.is_single_quoted_value():
            self.extend_value()
            self.store_typed_char(CharType.VALUE)
        elif self.char.is_single_quote():
            self.store_typed_char(CharType.VALUE)
            prev_pos = self.char.pos - 1
            if prev_pos >= 0 and self.text[prev_pos] == "\\":
                self.extend_value()
            else:
                self.set_state(State.EXPECT_BOOL_OP)
                self.extend_tree()
                self.reset_data()
                self.reset_bool_operator()
        else:
            self.set_error_state("invalid character", 11)
            return

    def in_state_double_quoted_value(self) -> None:
        if not self.char:
            return

        if self.char.is_double_quoted_value():
            self.extend_value()
            self.store_typed_char(CharType.VALUE)
        elif self.char.is_double_quote():
            self.store_typed_char(CharType.VALUE)
            prev_pos = self.char.pos - 1
            if prev_pos >= 0 and self.text[prev_pos] == "\\":
                self.extend_value()
            else:
                self.set_state(State.EXPECT_BOOL_OP)
                self.extend_tree()
                self.reset_data()
                self.reset_bool_operator()
        else:
            self.set_error_state("invalid character", 11)
            return

    def in_state_single_quoted_key(self) -> None:
        if not self.char:
            return

        if self.char.is_single_quoted_value():
            self.extend_key()
            self.store_typed_char(CharType.KEY)
        elif self.char.is_single_quote():
            self.store_typed_char(CharType.KEY)
            prev_pos = self.char.pos - 1
            if prev_pos >= 0 and self.text[prev_pos] == "\\":
                self.extend_key()
            else:
                self.extend_key()
                self.set_state(State.KEY)
        else:
            self.set_error_state("invalid character in quoted key", 30)
            return

    def in_state_double_quoted_key(self) -> None:
        if not self.char:
            return

        if self.char.is_double_quoted_value():
            self.extend_key()
            self.store_typed_char(CharType.KEY)
        elif self.char.is_double_quote():
            self.store_typed_char(CharType.KEY)
            prev_pos = self.char.pos - 1
            if prev_pos >= 0 and self.text[prev_pos] == "\\":
                self.extend_key()
            else:
                self.extend_key()
                self.set_state(State.KEY)
        else:
            self.set_error_state("invalid character in quoted key", 31)
            return

    def in_state_bool_op_delimiter(self) -> None:
        if not self.char:
            return

        if self.char.is_delimiter():
            self.store_typed_char(CharType.SPACE)
            return
        elif self.char.is_key():
            self.set_state(State.KEY)
            self.extend_key()
            self.store_typed_char(CharType.KEY)
        elif self.char.is_single_quote():
            self.extend_key()
            self.set_state(State.SINGLE_QUOTED_KEY)
            self.store_typed_char(CharType.KEY)
        elif self.char.is_double_quote():
            self.extend_key()
            self.set_state(State.DOUBLE_QUOTED_KEY)
            self.store_typed_char(CharType.KEY)
        elif self.char.is_group_open():
            self.extend_nodes_stack()
            self.extend_bool_op_stack()
            self.negation_stack.append(False)  # No negation for regular groups
            self.set_state(State.INITIAL)
            self.store_typed_char(CharType.OPERATOR)
        elif self.char.is_group_close():
            if not self.nodes_stack:
                self.set_error_state("unmatched parenthesis", 15)
                return
            else:
                self.reset_data()
                if self.bool_op_stack:
                    self.extend_tree_from_stack(bool_operator=self.bool_op_stack.pop())
                self.set_state(State.EXPECT_BOOL_OP)
                self.store_typed_char(CharType.OPERATOR)
        else:
            self.set_error_state("invalid character", 18)
            return

    def in_state_expect_bool_op(self) -> None:
        if not self.char:
            return

        if self.char.is_delimiter():
            self.store_typed_char(CharType.SPACE)
            return
        elif self.char.is_group_close():
            if not self.nodes_stack:
                self.set_error_state("unmatched parenthesis", 19)
                return
            else:
                self.reset_data()
                self.reset_bool_operator()
                if self.bool_op_stack:
                    self.extend_tree_from_stack(bool_operator=self.bool_op_stack.pop())
                self.set_state(State.EXPECT_BOOL_OP)
                self.store_typed_char(CharType.OPERATOR)
        else:
            self.extend_bool_operator()
            self.store_typed_char(CharType.OPERATOR)
            if (
                len(self.bool_operator) > 3
                or self.char.value not in VALID_BOOL_OPERATORS_CHARS
            ):
                self.set_error_state("invalid character", 20)
            else:
                if self.bool_operator in VALID_BOOL_OPERATORS:
                    next_pos = self.char.pos + 1
                    if len(self.text) > next_pos:
                        next_char = Char(self.text[next_pos], next_pos, 0, 0)
                        if not next_char.is_delimiter():
                            self.set_error_state(
                                "expected delimiter after bool operator", 23
                            )
                            return
                        else:
                            self.set_state(State.BOOL_OP_DELIMITER)

    def in_state_key_or_bool_op(self) -> None:
        """After a key and delimiter, determine if truthy expression or has operator coming."""
        if not self.char:
            return

        if self.char.is_delimiter():
            # More whitespace, stay in this state
            self.store_typed_char(CharType.SPACE)
            return
        elif self.char.is_op():
            # Has operator, standard flow
            self.extend_key_value_operator()
            self.set_state(State.KEY_VALUE_OPERATOR)
            self.store_typed_char(CharType.OPERATOR)
        elif self.char.is_group_close():
            # No operator, this is a truthy expression
            if not self.nodes_stack:
                self.set_error_state("unmatched parenthesis", 9)
                return
            self.extend_tree(self.new_truthy_expression())
            self.reset_data()
            if self.bool_op_stack:
                self.bool_operator = self.bool_op_stack.pop()
            self.extend_tree_from_stack(bool_operator=self.bool_operator)
            self.reset_bool_operator()
            self.set_state(State.EXPECT_BOOL_OP)
            self.store_typed_char(CharType.OPERATOR)
        elif self.char.value in VALID_BOOL_OPERATORS_CHARS:
            # Start of bool operator (and/or), this is a truthy expression
            self.extend_tree(self.new_truthy_expression())
            self.reset_data()
            self.reset_bool_operator()
            self.extend_bool_operator()
            self.store_typed_char(CharType.OPERATOR)
            self.set_state(State.EXPECT_BOOL_OP)
        else:
            self.set_error_state("expected operator or boolean operator", 32)
            return

    def in_state_expect_not_target(self) -> None:
        """After 'not ' keyword, expect key, quoted key, or group open."""
        if not self.char:
            return

        if self.char.is_delimiter():
            # Skip whitespace
            self.store_typed_char(CharType.SPACE)
            return
        elif self.char.is_key():
            self.extend_key()
            self.set_state(State.KEY)
            self.store_typed_char(CharType.KEY)
        elif self.char.is_single_quote():
            self.extend_key()
            self.set_state(State.SINGLE_QUOTED_KEY)
            self.store_typed_char(CharType.KEY)
        elif self.char.is_double_quote():
            self.extend_key()
            self.set_state(State.DOUBLE_QUOTED_KEY)
            self.store_typed_char(CharType.KEY)
        elif self.char.is_group_open():
            # not (...) - push current node and store negation for the group
            self.extend_nodes_stack()
            self.extend_bool_op_stack()
            # Store the pending negation to apply when group closes
            self.negation_stack.append(self.consume_pending_negation())
            self.set_state(State.INITIAL)
            self.store_typed_char(CharType.OPERATOR)
        else:
            self.set_error_state("expected key or ( after 'not'", 33)
            return

    def in_state_last_char(self) -> None:
        if self.state == State.INITIAL and not self.nodes_stack:
            self.set_error_state("empty input", 24)
        elif self.state in (
            State.INITIAL,
            State.SINGLE_QUOTED_KEY,
            State.DOUBLE_QUOTED_KEY,
            State.EXPECT_OPERATOR,
            State.EXPECT_VALUE,
            State.EXPECT_NOT_TARGET,
        ):
            self.set_error_state("unexpected EOF", 25)
        elif self.state == State.KEY:
            if self.key == NOT_KEYWORD:
                self.set_error_state("unexpected EOF after 'not'", 25)
            else:
                self.extend_tree(self.new_truthy_expression())
                self.reset_bool_operator()
        elif self.state == State.KEY_OR_BOOL_OP:
            self.extend_tree(self.new_truthy_expression())
            self.reset_bool_operator()
        elif self.state in (
            State.VALUE,
            State.DOUBLE_QUOTED_VALUE,
            State.SINGLE_QUOTED_VALUE,
        ):
            self.extend_tree()
            self.reset_bool_operator()
        elif self.state == State.BOOL_OP_DELIMITER:
            self.set_error_state("unexpected EOF", 26)
            return

        if self.state != State.ERROR and self.nodes_stack:
            self.set_error_state("unmatched parenthesis", 27)
            return

    def parse(
        self, text: str, raise_error: bool = True, ignore_last_char: bool = False
    ) -> None:
        """
        Parse the given text.

        Args:
            text: The text to parse
            raise_error: If True, raise ParserError on error. If False, set error state and return.
            ignore_last_char: If True, skip final state validation (inStateLastChar)
        """
        self.set_text(text)
        for c in text:
            if self.state == State.ERROR:
                break
            self.set_char(Char(c, self.pos, self.line, self.line_pos))
            if self.char and self.char.is_newline():
                self.line += 1
                self.line_pos = 0
                self.pos += 1
                continue

            match self.state:
                case State.INITIAL:
                    self.in_state_initial()
                case State.KEY:
                    self.in_state_key()
                case State.EXPECT_OPERATOR:
                    self.in_state_expect_operator()
                case State.VALUE:
                    self.in_state_value()
                case State.EXPECT_VALUE:
                    self.in_state_expect_value()
                case State.SINGLE_QUOTED_VALUE:
                    self.in_state_single_quoted_value()
                case State.DOUBLE_QUOTED_VALUE:
                    self.in_state_double_quoted_value()
                case State.KEY_VALUE_OPERATOR:
                    self.in_state_key_value_operator()
                case State.BOOL_OP_DELIMITER:
                    self.in_state_bool_op_delimiter()
                case State.SINGLE_QUOTED_KEY:
                    self.in_state_single_quoted_key()
                case State.DOUBLE_QUOTED_KEY:
                    self.in_state_double_quoted_key()
                case State.EXPECT_BOOL_OP:
                    self.in_state_expect_bool_op()
                case State.KEY_OR_BOOL_OP:
                    self.in_state_key_or_bool_op()
                case State.EXPECT_NOT_TARGET:
                    self.in_state_expect_not_target()
                case _:
                    self.set_error_state(f"Unknown state: {self.state}", 1)  # type: ignore[unreachable]

            if self.state == State.ERROR:  # type: ignore[comparison-overlap]
                break  # type: ignore[unreachable]

            self.pos += 1
            self.line_pos += 1

        if self.state == State.ERROR:
            if raise_error:
                raise ParserError(
                    message=self.error_text,
                    errno=self.errno,
                )
            else:
                return

        if not ignore_last_char:
            self.in_state_last_char()

        if self.state == State.ERROR:  # type: ignore[comparison-overlap]
            if raise_error:  # type: ignore[unreachable]
                raise ParserError(
                    message=self.error_text,
                    errno=self.errno,
                )
            else:
                return

        self.root = self.current_node


def parse(
    text: str, raise_error: bool = True, ignore_last_char: bool = False
) -> Parser:
    """
    Parse the given text and return a Parser instance.

    Args:
        text: The text to parse
        raise_error: If True, raise ParserError on error. If False, set error state and return.
        ignore_last_char: If True, skip final state validation
    """
    parser = Parser()
    parser.parse(text, raise_error, ignore_last_char)
    return parser
