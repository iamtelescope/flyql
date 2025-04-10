from enum import Enum
from typing import List, Optional

from flyql.tree import Node
from flyql.expression import Expression
from flyql.char import Char
from flyql.state import State
from flyql.exceptions import FlyqlError
from flyql.constants import VALID_BOOL_OPERATORS
from flyql.constants import VALID_KEY_VALUE_OPERATORS
from flyql.constants import VALID_BOOL_OPERATORS_CHARS


class ParserError(FlyqlError):
    def __init__(self, message: str, errno: int):
        self.message = message
        self.errno = errno

    def __str__(self):
        return self.message

    def __repr__(self):
        return str(self)


class Parser:
    def __init__(self) -> None:
        self.pos: int = 0
        self.line = 0
        self.line_pos = 0
        self.text: str = ""
        self.state: State = State.INITIAL
        self.char: Optional[Char]
        self.key: str = ""
        self.value: str = ""
        self.value_is_string: bool | None = None
        self.key_value_operator: str = ""
        self.bool_operator: str = "and"
        self.current_node: Optional[Node] = None
        self.nodes_stack: List[Node] = []
        self.bool_op_stack: List[str] = []
        self.error_text: str = ""
        self.errno: int = 0
        self.root: Node | None = None

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
        self.key += self.char.value

    def extend_value(self) -> None:
        self.value += self.char.value

    def extend_key_value_operator(self) -> None:
        self.key_value_operator += self.char.value

    def extend_bool_operator(self) -> None:
        self.bool_operator += self.char.value

    def extend_nodes_stack(self) -> None:
        if self.current_node:
            self.nodes_stack.append(self.current_node)

    def extend_bool_op_stack(self) -> None:
        self.bool_op_stack.append(self.bool_operator)

    def new_node(
        self,
        bool_operator: str,
        expression: Expression | None,
        left: Node | None,
        right: Node | None,
    ) -> Node:
        return Node(
            bool_operator=bool_operator, expression=expression, left=left, right=right
        )

    def new_expression(self) -> Expression:
        return Expression(
            key=self.key,
            operator=self.key_value_operator,
            value=self.value,
            value_is_string=self.value_is_string,
        )

    def extend_tree(self) -> None:
        if self.current_node and self.current_node.left is None:
            node = self.new_node(
                bool_operator="",
                expression=self.new_expression(),
                left=None,
                right=None,
            )
            self.current_node.set_left(node)
            self.current_node.set_bool_operator(self.bool_operator)
        elif self.current_node and self.current_node.right is None:
            node = self.new_node(
                bool_operator="",
                expression=self.new_expression(),
                left=None,
                right=None,
            )
            self.current_node.set_right(node)
            self.current_node.set_bool_operator(self.bool_operator)
        else:
            right = self.new_node(
                bool_operator="",
                expression=self.new_expression(),
                left=None,
                right=None,
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
        if node.right is None:
            node.right = self.current_node
            node.set_bool_operator(bool_operator)
            self.set_current_node(node)
        else:
            new_node = self.new_node(
                bool_operator=bool_operator,
                expression=None,
                left=node,
                right=self.current_node,
            )
            self.set_current_node(new_node)

    def in_state_initial(self) -> None:
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
            self.set_state(State.INITIAL)
        elif self.char.is_delimiter():
            self.set_state(State.BOOL_OP_DELIMITER)
        elif self.char.is_key():
            self.extend_key()
            self.set_state(State.KEY)
        else:
            self.set_error_state("invalid character", 1)
            return

    def in_state_key(self) -> None:
        if self.char.is_delimiter():
            self.set_error_state("unexpected delimiter in key", 2)
            return
        elif self.char.is_key():
            self.extend_key()
        elif self.char.is_op():
            self.extend_key_value_operator()
            self.set_state(State.KEY_VALUE_OPERATOR)
        else:
            self.set_error_state("invalid character", 3)
            return

    def in_state_key_value_operator(self) -> None:
        if self.char.is_delimiter():
            self.set_error_state("unexpected delimiter in operator", 4)
        elif self.char.is_op():
            self.extend_key_value_operator()
        elif self.char.is_value():
            if self.key_value_operator not in VALID_KEY_VALUE_OPERATORS:
                self.set_error_state(f"unknown operator: {self.key_value_operator}", 10)
            else:
                self.set_state(State.VALUE)
                self.extend_value()
        elif self.char.is_single_quote():
            if self.key_value_operator not in VALID_KEY_VALUE_OPERATORS:
                self.set_error_state(f"unknown operator: {self.key_value_operator}", 10)
            else:
                self.set_value_is_string()
                self.set_state(State.SINGLE_QUOTED_VALUE)
        elif self.char.is_double_quote():
            if self.key_value_operator not in VALID_KEY_VALUE_OPERATORS:
                self.set_error_state(f"unknown operator: {self.key_value_operator}", 10)
            else:
                self.set_value_is_string()
                self.set_state(State.DOUBLE_QUOTED_VALUE)
        else:
            self.set_error_state("invalid character", 4)

    def in_state_value(self) -> None:
        if self.char.is_value():
            self.extend_value()
        elif self.char.is_delimiter():
            self.set_state(State.EXPECT_BOOL_OP)
            self.extend_tree()
            self.reset_data()
            self.reset_bool_operator()
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
        else:
            self.set_error_state("invalid character", 10)
            return

    def in_state_single_quoted_value(self) -> None:
        if self.char.is_single_quoted_value():
            self.extend_value()
        elif self.char.is_single_quote():
            prev_pos = self.char.pos - 1
            if self.text[prev_pos] == "\\":
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
        if self.char.is_double_quoted_value():
            self.extend_value()
        elif self.char.is_double_quote():
            prev_pos = self.char.pos - 1
            if self.text[prev_pos] == "\\":
                self.extend_value()
            else:
                self.set_state(State.EXPECT_BOOL_OP)
                self.extend_tree()
                self.reset_data()
                self.reset_bool_operator()
        else:
            self.set_error_state("invalid character", 11)
            return

    def in_state_bool_op_delimiter(self) -> None:
        if self.char.is_delimiter():
            return
        elif self.char.is_key():
            self.set_state(State.KEY)
            self.extend_key()
        elif self.char.is_group_open():
            self.extend_nodes_stack()
            self.extend_bool_op_stack()
            self.set_state(State.INITIAL)
        elif self.char.is_group_close():
            if self.nodes_stack:
                self.set_error_state("unmatched parenthesis", 15)
                return
            else:
                self.reset_data()
                self.extend_tree_from_stack(bool_operator=self.bool_op_stack.pop())
                self.set_state(State.EXPECT_BOOL_OP)
        else:
            self.set_error_state("invalid character", 18)
            return

    def in_state_expect_bool_op(self) -> None:
        if self.char.is_delimiter():
            return
        elif self.char.is_group_close():
            if not self.nodes_stack:
                self.set_error_state("unmatched parenthesis", 19)
                return
            else:
                if self.key and self.value and self.key_value_operator:
                    self.extend_tree()
                self.reset_data()
                self.reset_bool_operator()
                self.extend_tree_from_stack(bool_operator=self.bool_op_stack.pop())
                self.set_state(State.EXPECT_BOOL_OP)
        else:
            self.extend_bool_operator()
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

    def in_state_last_char(self) -> None:
        if self.state == State.INITIAL and not self.nodes_stack:
            self.set_error_state("empty input", 24)
        elif self.state == State.INITIAL or self.state == State.KEY:
            self.set_error_state("unexpected EOF", 25)
        elif (
            self.state == State.VALUE
            or self.state == State.DOUBLE_QUOTED_VALUE
            or self.state == State.SINGLE_QUOTED_VALUE
        ):
            self.extend_tree()
            self.reset_bool_operator()
        elif (
            self.state == State.BOOL_OP_DELIMITER and self.state != State.EXPECT_BOOL_OP
        ):
            self.set_error_state("unexpected EOF", 26)
            return

        if self.state != State.ERROR and self.nodes_stack:
            self.set_error_state("unmatched parenthesis", 27)
            return

    def parse(self, text: str) -> None:
        self.set_text(text)
        for c in text:
            if self.state == State.ERROR:
                break
            self.set_char(Char(c, self.pos, self.line, self.line_pos))
            if self.char.is_newline():
                self.line += 1
                self.line_pos = 0
                self.pos += 1
                continue

            match self.state:
                case State.INITIAL:
                    self.in_state_initial()
                case State.KEY:
                    self.in_state_key()
                case State.VALUE:
                    self.in_state_value()
                case State.SINGLE_QUOTED_VALUE:
                    self.in_state_single_quoted_value()
                case State.DOUBLE_QUOTED_VALUE:
                    self.in_state_double_quoted_value()
                case State.KEY_VALUE_OPERATOR:
                    self.in_state_key_value_operator()
                case State.BOOL_OP_DELIMITER:
                    self.in_state_bool_op_delimiter()
                case State.EXPECT_BOOL_OP:
                    self.in_state_expect_bool_op()
                case _:
                    self.set_error_state(f"Unknown state: {self.state}", 1)
            self.pos += 1
            self.line_pos += 1

        if self.state == State.ERROR:
            raise ParserError(
                message=self.error_text,
                errno=self.errno,
            )

        self.in_state_last_char()

        if self.state == State.ERROR:
            raise ParserError(
                message=self.error_text,
                errno=self.errno,
            )

        self.root = self.current_node


def parse(text: str) -> Parser:
    parser = Parser()
    parser.parse(text)
    return parser
