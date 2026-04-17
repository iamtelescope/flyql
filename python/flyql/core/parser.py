from typing import List, Optional, Union, Any

from flyql.core.tree import Node
from flyql.core.expression import (
    Expression,
    FunctionCall,
    Parameter,
    Duration,
    convert_unquoted_value,
)
from flyql.core.char import Char
from flyql.literal import LiteralKind
from flyql.core.state import State
from flyql.core.exceptions import FlyqlError, KeyParseError
from flyql.core.range import Range
from flyql.core.constants import (
    VALID_BOOL_OPERATORS,
    VALID_KEY_VALUE_OPERATORS,
    KNOWN_FUNCTIONS,
    DURATION_UNIT_MAGNITUDE,
)
from flyql.errors_generated import (
    ERR_EMPTY_INPUT,
    ERR_EMPTY_PARAMETER_NAME,
    ERR_EXPECTED_COMMA_OR_LIST_END,
    ERR_EXPECTED_DELIM_AFTER_BOOL_OP,
    ERR_EXPECTED_KEY_OR_PAREN_AFTER_NOT,
    ERR_EXPECTED_LIST_START,
    ERR_EXPECTED_LIST_START_AFTER_IN,
    ERR_EXPECTED_NOT_OR_IN_KEYWORD,
    ERR_EXPECTED_OPERATOR_OR_BOOL_OP,
    ERR_EXPECTED_OPERATOR_OR_UNCLOSED_STRING,
    ERR_EXPECTED_VALUE,
    ERR_EXPECTED_VALUE_IN_LIST,
    ERR_EXPECTED_VALUE_OR_KEYWORD,
    ERR_FUNCTION_NOT_ALLOWED_WITH_OPERATOR,
    ERR_INVALID_CHAR_IN_BOOL_DELIM,
    ERR_INVALID_CHAR_IN_DOUBLE_QUOTED_KEY,
    ERR_INVALID_CHAR_IN_EXPECT_BOOL,
    ERR_INVALID_CHAR_IN_KEY,
    ERR_INVALID_CHAR_IN_KEY_VALUE_OPERATOR,
    ERR_INVALID_CHAR_IN_LIST_QUOTED_VALUE,
    ERR_INVALID_CHAR_IN_QUOTED_VALUE,
    ERR_INVALID_CHAR_IN_SINGLE_QUOTED_KEY,
    ERR_INVALID_CHAR_OR_UNKNOWN_OPERATOR,
    ERR_INVALID_DURATION,
    ERR_INVALID_FUNCTION_ARGS,
    ERR_INVALID_PARAMETER_NAME,
    ERR_KEY_PARSE_FAILED,
    ERR_MAX_DEPTH_EXCEEDED,
    ERR_NULL_NOT_ALLOWED_WITH_OPERATOR,
    ERR_PARAMETER_ZERO_INDEX,
    ERR_UNEXPECTED_CHAR_IN_LIST_VALUE,
    ERR_UNEXPECTED_EOF,
    ERR_UNEXPECTED_EOF_IN_KEY,
    ERR_UNKNOWN_FUNCTION,
    ERR_UNKNOWN_STATE,
    ERR_UNMATCHED_PAREN_AT_EOF,
    ERR_UNMATCHED_PAREN_IN_BOOL_DELIM,
    ERR_UNMATCHED_PAREN_IN_EXPECT_BOOL,
    ERR_UNMATCHED_PAREN_IN_EXPR,
)
from flyql.core.constants import VALID_BOOL_OPERATORS_CHARS
from flyql.core.constants import CharType
from flyql.core.constants import NOT_KEYWORD
from flyql.core.constants import IN_KEYWORD
from flyql.core.constants import HAS_KEYWORD
from flyql.core.constants import LIKE_KEYWORD
from flyql.core.constants import ILIKE_KEYWORD
from flyql.core.constants import Operator
from flyql.core.key import parse_key, Key

_BOOL_OP_PRECEDENCE = {"and": 2, "or": 1}


def _precedence(op: str) -> int:
    """Precedence of a boolean operator. Unknown/empty -> 0 so wrappers
    with unset `bool_operator` fall into the same-or-lower wrap path."""
    return _BOOL_OP_PRECEDENCE.get(op, 0)


class ParserError(FlyqlError):
    def __init__(
        self,
        message: str,
        errno: int,
        range: Optional[Range] = None,
    ) -> None:
        super().__init__(message)
        self.errno = errno
        self.range = range

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
        self._pipe_seen_in_key: bool = False
        self._transformer_paren_depth: int = 0
        self._transformer_quote: Optional[str] = None
        self.pending_negation: bool = False
        self.negation_stack: List[bool] = []
        self.in_list_values: List[Any] = []
        self.in_list_current_value: str = ""
        self.in_list_current_value_is_string: Union[bool, None] = None
        self.in_list_values_type: Optional[str] = None
        self.in_list_values_types: List[LiteralKind] = []
        self.is_not_in: bool = False
        self.is_not_has: bool = False
        self.is_not_like: bool = False
        self.is_not_ilike: bool = False
        self.value_quote_char: str = ""
        self.in_list_quote_char: str = ""
        # Position tracking for source ranges.
        self._key_start: int = -1
        self._key_end: int = -1
        self._value_start: int = -1
        self._value_end: int = -1
        self._operator_start: int = -1
        self._operator_end: int = -1
        self._expr_start: int = -1
        self._expr_end: int = -1
        self._bool_op_start_stack: List[int] = []
        self._bool_op_end_stack: List[int] = []
        self._group_start_stack: List[int] = []
        self._in_list_value_start: int = -1
        self._in_list_value_end: int = -1
        self._in_list_value_ranges: List[Range] = []
        self._error_range: Optional[Range] = None
        self._function_name: str = ""
        self._function_duration_buf: str = ""
        self._function_args: List[str] = []
        self._function_durations: List[Duration] = []
        self._function_current_arg: str = ""
        self._function_parameter_args: List[Parameter] = []
        self._function_param_buf: str = ""
        # Maximum nesting depth for boolean-grouping parens. Values `<= 0`
        # disable the limit. Read on every group-open, so mid-parse mutation
        # takes effect on the next `(`.
        self.max_depth: int = 128
        self._depth: int = 0

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
        if self.char is not None:
            self.value_quote_char = self.char.value
            # Include the opening quote in the value range.
            if self._value_start == -1:
                self._value_start = self.char.pos
            self._value_end = self.char.pos + 1

    def set_error_state(
        self,
        error_text: str,
        errno: int,
        range: Optional[Range] = None,
    ) -> None:
        self.state = State.ERROR
        self.error_text = error_text
        self.errno = errno
        if range is not None:
            self._error_range = range
        elif self.char is not None:
            self._error_range = Range(self.char.pos, self.char.pos + 1)
        else:
            self._error_range = None

    def reset_pos(self) -> None:
        self.pos = 0

    def reset_key(self) -> None:
        self.key = ""
        self._pipe_seen_in_key = False
        self._transformer_paren_depth = 0
        self._transformer_quote = None
        self._key_start = -1
        self._key_end = -1

    def reset_value(self) -> None:
        self.value = ""
        self.reset_value_is_string()
        self._value_start = -1
        self._value_end = -1

    def reset_value_is_string(self) -> None:
        self.value_is_string = None

    def reset_key_value_operator(self) -> None:
        self.key_value_operator = ""
        self._operator_start = -1
        self._operator_end = -1

    def reset_data(self) -> None:
        self.reset_key()
        self.reset_value()
        self.reset_key_value_operator()
        self.reset_in_list_data()
        self._expr_start = -1

    def reset_in_list_data(self) -> None:
        self.in_list_values = []
        self.in_list_current_value = ""
        self.in_list_current_value_is_string = None
        self.in_list_values_type = None
        self.in_list_values_types = []
        self.is_not_in = False
        self.is_not_has = False
        self.is_not_like = False
        self.is_not_ilike = False
        self._in_list_value_start = -1
        self._in_list_value_end = -1
        self._in_list_value_ranges = []

    def extend_in_list_current_value(self) -> None:
        if self.char:
            if self._in_list_value_start == -1:
                self._in_list_value_start = self.char.pos
            self._in_list_value_end = self.char.pos + 1
            self.in_list_current_value += self.char.value

    def finalize_in_list_value(self) -> bool:
        if (
            not self.in_list_current_value
            and self.in_list_current_value_is_string is None
        ):
            return True

        if self.in_list_current_value_is_string:
            value: Any = self._unescape_quotes(
                self.in_list_current_value, self.in_list_quote_char
            )
            explicit_type = LiteralKind.STRING
        elif self.in_list_current_value == "null":
            value = None
            explicit_type = LiteralKind.NULL
        elif self.in_list_current_value in ("true", "false"):
            value = self.in_list_current_value == "true"
            explicit_type = LiteralKind.BOOLEAN
        else:
            value, explicit_type = convert_unquoted_value(self.in_list_current_value)

        self.in_list_values.append(value)
        self.in_list_values_types.append(explicit_type)
        if self._in_list_value_start >= 0:
            self._in_list_value_ranges.append(
                Range(self._in_list_value_start, self._in_list_value_end)
            )
        self.in_list_current_value = ""
        self.in_list_current_value_is_string = None
        self._in_list_value_start = -1
        self._in_list_value_end = -1
        return True

    def reset_bool_operator(self) -> None:
        self.bool_operator = ""

    def extend_key(self) -> None:
        if self.char:
            if self._key_start == -1:
                self._key_start = self.char.pos
                if self._expr_start == -1:
                    self._expr_start = self.char.pos
            self._key_end = self.char.pos + 1
            self.key += self.char.value

    def extend_value(self) -> None:
        if self.char:
            if self._value_start == -1:
                self._value_start = self.char.pos
            self._value_end = self.char.pos + 1
            self.value += self.char.value

    def extend_key_value_operator(self) -> None:
        if self.char:
            if self._operator_start == -1:
                self._operator_start = self.char.pos
            self._operator_end = self.char.pos + 1
            self.key_value_operator += self.char.value

    def extend_bool_operator(self) -> None:
        if self.char:
            if self.bool_operator == "":
                self._bool_op_start_stack.append(self.char.pos)
                self._bool_op_end_stack.append(self.char.pos + 1)
            else:
                if self._bool_op_end_stack:
                    self._bool_op_end_stack[-1] = self.char.pos + 1
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
        range: Range,
        bool_operator_range: Optional[Range] = None,
        negated: bool = False,
    ) -> Node:
        return Node(
            bool_operator=bool_operator,
            expression=expression,
            left=left,
            right=right,
            range=range,
            bool_operator_range=bool_operator_range,
            negated=negated,
        )

    @staticmethod
    def _unescape_quotes(value: str, quote_char: str) -> str:
        if quote_char == "'":
            return value.replace("\\'", "'")
        return value.replace('\\"', '"')

    def _build_expr_ranges(self, end: int) -> tuple[Range, Range, Optional[Range]]:
        """Build (expr_range, key_range, operator_range) for the current
        accumulated expression state."""
        key_range = Range(self._key_start, self._key_end)
        operator_range = (
            Range(self._operator_start, self._operator_end)
            if self._operator_start >= 0
            else None
        )
        start = self._expr_start if self._expr_start >= 0 else self._key_start
        expr_range = Range(start, end)
        return expr_range, key_range, operator_range

    def _parse_key_with_range(self, key_range: Range) -> Key:
        try:
            parsed = parse_key(self.key, key_range.start)
        except KeyParseError as e:
            self.set_error_state(e.message, ERR_KEY_PARSE_FAILED, range=e.range)
            # Return an empty Key sentinel; extend_tree won't be called
            # because new_expression checks state afterwards.
            return Key([""], range=key_range, segment_ranges=[key_range])
        return parsed

    def new_expression(self) -> Expression:
        value = self.value
        if self.value_is_string and self.key_value_operator not in (
            Operator.REGEX.value,
            Operator.NOT_REGEX.value,
        ):
            value = self._unescape_quotes(value, self.value_quote_char)

        if self._value_end >= 0:
            expr_end = self._value_end
        elif self._operator_end >= 0:
            expr_end = self._operator_end
        else:
            expr_end = self._key_end
        expr_range, key_range, operator_range = self._build_expr_ranges(expr_end)
        value_range = (
            Range(self._value_start, self._value_end)
            if self._value_start >= 0
            else None
        )
        key = self._parse_key_with_range(key_range)

        if value == "null" and not self.value_is_string:
            if self.key_value_operator not in (
                Operator.EQUALS.value,
                Operator.NOT_EQUALS.value,
            ):
                self.set_error_state(
                    f"null value cannot be used with operator '{self.key_value_operator}'",
                    ERR_NULL_NOT_ALLOWED_WITH_OPERATOR,
                )
            return Expression(
                key=key,
                operator=self.key_value_operator,
                value=None,
                value_is_string=None,
                range=expr_range,
                operator_range=operator_range,
                value_range=value_range,
                value_type=LiteralKind.NULL,
            )

        if value in ("true", "false") and not self.value_is_string:
            return Expression(
                key=key,
                operator=self.key_value_operator,
                value=value == "true",
                value_is_string=None,
                range=expr_range,
                operator_range=operator_range,
                value_range=value_range,
                value_type=LiteralKind.BOOLEAN,
            )

        return Expression(
            key=key,
            operator=self.key_value_operator,
            value=value,
            value_is_string=self.value_is_string,
            range=expr_range,
            operator_range=operator_range,
            value_range=value_range,
        )

    def new_truthy_expression(self) -> Expression:
        """Create a truthy expression (standalone key check)"""
        expr_end = self._key_end
        expr_range, key_range, _ = self._build_expr_ranges(expr_end)
        key = self._parse_key_with_range(key_range)
        return Expression(
            key=key,
            operator=Operator.TRUTHY.value,
            value="",
            value_is_string=True,
            range=expr_range,
            operator_range=None,
            value_range=None,
        )

    def new_in_expression(self) -> Expression:
        """Create an IN or NOT IN expression"""
        operator = Operator.NOT_IN.value if self.is_not_in else Operator.IN.value
        # expr end is position after the closing ']' — char just consumed is ']'.
        assert self.char is not None
        expr_end = self.char.pos + 1
        expr_range, key_range, _ = self._build_expr_ranges(expr_end)
        key = self._parse_key_with_range(key_range)
        return Expression(
            key=key,
            operator=operator,
            value="",
            value_is_string=None,
            range=expr_range,
            operator_range=None,
            value_range=None,
            value_ranges=(
                list(self._in_list_value_ranges) if self._in_list_value_ranges else None
            ),
            values=self.in_list_values,
            values_type=self.in_list_values_type,
            values_types=(
                self.in_list_values_types if self.in_list_values_types else None
            ),
        )

    def toggle_pending_negation(self) -> None:
        """Toggle the pending negation flag (handles double negation)"""
        self.pending_negation = not self.pending_negation

    def consume_pending_negation(self) -> bool:
        """Consume and return pending negation, resetting it to False"""
        negated = self.pending_negation
        self.pending_negation = False
        return negated

    def _pop_bool_op_range(self) -> Optional[Range]:
        if self._bool_op_start_stack and self._bool_op_end_stack:
            s = self._bool_op_start_stack.pop()
            e = self._bool_op_end_stack.pop()
            return Range(s, e)
        return None

    def _fold_with_precedence(self, current: Node, op: str, atom: Node) -> Node:
        """Fold `atom` into `current` with operator `op`, respecting
        AND > OR precedence. When `op` has strictly higher precedence than
        `current.bool_operator`, descend one level and wrap `current.right`;
        otherwise wrap the whole tree left-heavy. One-level descent is
        sufficient because flyql has exactly two binary precedence levels."""
        if _precedence(op) <= _precedence(current.bool_operator):
            bool_op_r = self._pop_bool_op_range()
            return self.new_node(
                bool_operator=op,
                expression=None,
                left=current,
                right=atom,
                range=Range(current.range.start, atom.range.end),
                bool_operator_range=bool_op_r,
            )
        assert current.right is not None
        bool_op_r = self._pop_bool_op_range()
        current.right = self.new_node(
            bool_operator=op,
            expression=None,
            left=current.right,
            right=atom,
            range=Range(current.right.range.start, atom.range.end),
            bool_operator_range=bool_op_r,
        )
        current.range = Range(current.range.start, atom.range.end)
        return current

    def extend_tree(self, expression: Union[Expression, None] = None) -> None:
        """Extend the AST with an expression. If expression is None, creates one from current state."""
        if expression is None:
            expression = self.new_expression()
        negated = self.consume_pending_negation()

        if self.current_node and self.current_node.left is None:
            if self.current_node.right is not None:
                # Grouped-prefix wrapper: `right` holds a merged group
                # sub-tree from extend_tree_from_stack's if-branch. Preserve
                # source order by promoting the group to left and placing
                # the new leaf in right.
                new_leaf = self.new_node(
                    bool_operator="",
                    expression=expression,
                    left=None,
                    right=None,
                    range=expression.range,
                    negated=negated,
                )
                self.current_node.set_left(self.current_node.right)
                self.current_node.set_right(new_leaf)
                self.current_node.set_bool_operator(self.bool_operator)
                bool_op_r = self._pop_bool_op_range()
                if bool_op_r is not None:
                    self.current_node.bool_operator_range = bool_op_r
                self.current_node.range = Range(
                    self.current_node.range.start,
                    max(self.current_node.range.end, expression.range.end),
                )
            else:
                node = self.new_node(
                    bool_operator="",
                    expression=expression,
                    left=None,
                    right=None,
                    range=expression.range,
                    negated=negated,
                )
                self.current_node.set_left(node)
                self.current_node.set_bool_operator(self.bool_operator)
                # Expand the parent wrapper range to cover the new leaf.
                self.current_node.range = Range(
                    min(self.current_node.range.start, expression.range.start),
                    max(self.current_node.range.end, expression.range.end),
                )
        elif self.current_node and self.current_node.right is None:
            node = self.new_node(
                bool_operator="",
                expression=expression,
                left=None,
                right=None,
                range=expression.range,
                negated=negated,
            )
            self.current_node.set_right(node)
            self.current_node.set_bool_operator(self.bool_operator)
            bool_op_r = self._pop_bool_op_range()
            if bool_op_r is not None:
                self.current_node.bool_operator_range = bool_op_r
            self.current_node.range = Range(
                min(self.current_node.range.start, expression.range.start),
                max(self.current_node.range.end, expression.range.end),
            )
        else:
            right = self.new_node(
                bool_operator="",
                expression=expression,
                left=None,
                right=None,
                range=expression.range,
                negated=negated,
            )
            assert self.current_node is not None
            self.set_current_node(
                self._fold_with_precedence(self.current_node, self.bool_operator, right)
            )

    def extend_tree_from_stack(self, bool_operator: str) -> None:
        node = self.nodes_stack.pop()
        negated = self.negation_stack.pop() if self.negation_stack else False
        if self._group_start_stack:
            group_start = self._group_start_stack.pop()
            self._depth -= 1
        else:
            group_start = None

        if node.right is None:
            if self.current_node:
                self._apply_negation_to_tree(self.current_node, negated)
                self.current_node = self._unwrap_trivial_leaf_wrapper(self.current_node)
            node.right = self.current_node
            if bool_operator:
                node.set_bool_operator(bool_operator)
                bool_op_r = self._pop_bool_op_range()
                if bool_op_r is not None:
                    node.bool_operator_range = bool_op_r
            # Set group range: span from '(' to current char pos+1 (the ')').
            if group_start is not None and self.char is not None:
                node.range = Range(group_start, self.char.pos + 1)
            elif self.current_node is not None:
                node.range = Range(
                    node.range.start if node.range else self.current_node.range.start,
                    self.current_node.range.end,
                )
            self.set_current_node(node)
        else:
            if self.current_node:
                self._apply_negation_to_tree(self.current_node, negated)
                self.current_node = self._unwrap_trivial_leaf_wrapper(self.current_node)
            assert self.current_node is not None
            # Edge case: `node` is a grouped-prefix wrapper from a prior
            # if-branch merge — shape `{left=None, right=<sub-tree>}`. Its
            # `bool_operator` may be the default ("and") or anything the
            # prior merge set; the diagnostic shape is `left is None`.
            # Discard the wrapper entirely and build the new root directly,
            # preserving the OUTER group's `(` position from
            # `node.range.start` rather than popping `group_start` (which
            # tracks only the INNER group being closed now).
            if node.left is None and node.right is not None:
                bool_op_r = self._pop_bool_op_range() if bool_operator else None
                right_end = self.current_node.range.end
                if self.char is not None:
                    right_end = self.char.pos + 1
                new_root = self.new_node(
                    bool_operator=bool_operator,
                    expression=None,
                    left=node.right,
                    right=self.current_node,
                    range=Range(node.range.start, right_end),
                    bool_operator_range=bool_op_r,
                )
                self.set_current_node(new_root)
            else:
                new_root = self._fold_with_precedence(
                    node, bool_operator, self.current_node
                )
                if self.char is not None:
                    new_root.range = Range(new_root.range.start, self.char.pos + 1)
                self.set_current_node(new_root)

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

    def _unwrap_trivial_leaf_wrapper(self, node: Optional[Node]) -> Optional[Node]:
        """If `node` is a trivial single-leaf wrapper — a non-negated
        binary-op node carrying a leaf in `left` and nothing in `right` —
        return the leaf directly. Otherwise return `node` unchanged.

        Used at group-merge sites so a sub-tree produced by a
        single-leaf group like `(a=1)` lands as a leaf in its parent,
        not as a malformed `AND{left=leaf, right=None}` child node."""
        if (
            node is not None
            and not node.negated
            and node.expression is None
            and node.left is not None
            and node.left.expression is not None
            and node.left.left is None
            and node.left.right is None
            and node.right is None
        ):
            return node.left
        return node

    def in_state_initial(self) -> None:
        if not self.char:
            return

        self.reset_data()
        self._expr_start = -1
        start_pos = self.char.pos
        self.set_current_node(
            self.new_node(
                bool_operator=self.bool_operator,
                expression=None,
                left=None,
                right=None,
                range=Range(start_pos, start_pos),
            )
        )
        if self.char.is_group_open():
            self.extend_nodes_stack()
            self.extend_bool_op_stack()
            self.negation_stack.append(False)  # No negation for regular groups
            self._group_start_stack.append(start_pos)
            self._depth += 1
            if self.max_depth > 0 and self._depth > self.max_depth:
                self.set_error_state(
                    f"maximum nesting depth exceeded ({self.max_depth})",
                    ERR_MAX_DEPTH_EXCEEDED,
                )
                return
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
            self.set_error_state("invalid character", ERR_UNKNOWN_STATE)
            return

    def in_state_key(self) -> None:
        if not self.char:
            return

        if self._transformer_quote:
            self.extend_key()
            if self.char.value == self._transformer_quote:
                self._transformer_quote = None
            self.store_typed_char(CharType.ARGUMENT_STRING)
            return

        if self.char.is_delimiter():
            if self._transformer_paren_depth > 0:
                self.extend_key()
                self.store_typed_char(CharType.ARGUMENT)
                return
            if self.key == NOT_KEYWORD:
                self.toggle_pending_negation()
                self.reset_key()
                self.set_state(State.EXPECT_NOT_TARGET)
            else:
                self.set_state(State.KEY_OR_BOOL_OP)
            self.store_typed_char(CharType.SPACE)
        elif self.char.is_key():
            self.extend_key()
            if self.char.value == "|":
                self._pipe_seen_in_key = True
                self.store_typed_char(CharType.PIPE)
            elif self._transformer_paren_depth > 0:
                self.store_typed_char(CharType.ARGUMENT_NUMBER)
            elif self._pipe_seen_in_key:
                self.store_typed_char(CharType.TRANSFORMER)
            else:
                self.store_typed_char(CharType.KEY)
        elif self._transformer_paren_depth > 0 and self.char.is_parameter_start():
            self.extend_key()
            self.store_typed_char(CharType.PARAMETER)
        elif self._pipe_seen_in_key and self.char.value in "(),\"'":
            if self.char.value == "(":
                self._transformer_paren_depth += 1
            elif self.char.value == ")":
                self._transformer_paren_depth -= 1
            elif self._transformer_paren_depth > 0 and self.char.value in "\"'":
                self._transformer_quote = self.char.value
                self.extend_key()
                self.store_typed_char(CharType.ARGUMENT_STRING)
                return
            self.extend_key()
            self.store_typed_char(CharType.ARGUMENT)
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
                self.set_error_state(
                    "unmatched parenthesis", ERR_UNMATCHED_PAREN_IN_EXPR
                )
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
            self.set_error_state("invalid character", ERR_INVALID_CHAR_IN_KEY)
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
            self.set_error_state(
                "expected operator", ERR_EXPECTED_OPERATOR_OR_UNCLOSED_STRING
            )

    def in_state_key_value_operator(self) -> None:
        if not self.char:
            return

        if self.key_value_operator == "h" and self.char.value == "a":
            self.key_value_operator = "ha"
            self.store_typed_char(CharType.OPERATOR)
            return
        elif self.key_value_operator == "ha" and self.char.value == "s":
            self.key_value_operator = HAS_KEYWORD
            self.store_typed_char(CharType.OPERATOR)
            return
        elif self.key_value_operator == HAS_KEYWORD:
            if self.char.is_delimiter():
                self.store_typed_char(CharType.SPACE)
                self.key_value_operator = Operator.HAS.value
                self.is_not_has = False
                self.set_state(State.EXPECT_VALUE)
            elif self.char.is_single_quote():
                self.key_value_operator = Operator.HAS.value
                self.is_not_has = False
                self.set_value_is_string()
                self.set_state(State.SINGLE_QUOTED_VALUE)
                self.store_typed_char(CharType.VALUE)
            elif self.char.is_double_quote():
                self.key_value_operator = Operator.HAS.value
                self.is_not_has = False
                self.set_value_is_string()
                self.set_state(State.DOUBLE_QUOTED_VALUE)
                self.store_typed_char(CharType.VALUE)
            elif self.char.is_parameter_start():
                self.key_value_operator = Operator.HAS.value
                self.is_not_has = False
                self._value_start = self.char.pos
                self.set_state(State.PARAMETER)
                self.store_typed_char(CharType.PARAMETER)
            elif self.char.is_value():
                self.key_value_operator = Operator.HAS.value
                self.is_not_has = False
                self.set_state(State.VALUE)
                self.extend_value()
                self.store_typed_char(CharType.VALUE)
            else:
                self.set_error_state(
                    "expected value after 'has'", ERR_EXPECTED_VALUE_OR_KEYWORD
                )
            return
        elif self.key_value_operator == "l" and self.char.value == "i":
            self.key_value_operator = "li"
            self.store_typed_char(CharType.OPERATOR)
            return
        elif self.key_value_operator == "li" and self.char.value == "k":
            self.key_value_operator = "lik"
            self.store_typed_char(CharType.OPERATOR)
            return
        elif self.key_value_operator == "lik" and self.char.value == "e":
            self.key_value_operator = LIKE_KEYWORD
            self.store_typed_char(CharType.OPERATOR)
            return
        elif self.key_value_operator == LIKE_KEYWORD:
            if self.char.is_delimiter():
                self.store_typed_char(CharType.SPACE)
                self.key_value_operator = Operator.LIKE.value
                self.set_state(State.EXPECT_VALUE)
            elif self.char.is_single_quote():
                self.key_value_operator = Operator.LIKE.value
                self.set_value_is_string()
                self.set_state(State.SINGLE_QUOTED_VALUE)
                self.store_typed_char(CharType.VALUE)
            elif self.char.is_double_quote():
                self.key_value_operator = Operator.LIKE.value
                self.set_value_is_string()
                self.set_state(State.DOUBLE_QUOTED_VALUE)
                self.store_typed_char(CharType.VALUE)
            elif self.char.is_parameter_start():
                self.key_value_operator = Operator.LIKE.value
                self._value_start = self.char.pos
                self.set_state(State.PARAMETER)
                self.store_typed_char(CharType.PARAMETER)
            elif self.char.is_value():
                self.key_value_operator = Operator.LIKE.value
                self.set_state(State.VALUE)
                self.extend_value()
                self.store_typed_char(CharType.VALUE)
            else:
                self.set_error_state(
                    "expected value after 'like'", ERR_EXPECTED_VALUE_OR_KEYWORD
                )
            return
        elif self.key_value_operator == "i" and self.char.value == "n":
            self.key_value_operator = "in"
            self.store_typed_char(CharType.OPERATOR)
        elif self.key_value_operator == "i" and self.char.value == "l":
            self.key_value_operator = "il"
            self.store_typed_char(CharType.OPERATOR)
            return
        elif self.key_value_operator == "il" and self.char.value == "i":
            self.key_value_operator = "ili"
            self.store_typed_char(CharType.OPERATOR)
            return
        elif self.key_value_operator == "ili" and self.char.value == "k":
            self.key_value_operator = "ilik"
            self.store_typed_char(CharType.OPERATOR)
            return
        elif self.key_value_operator == "ilik" and self.char.value == "e":
            self.key_value_operator = ILIKE_KEYWORD
            self.store_typed_char(CharType.OPERATOR)
            return
        elif self.key_value_operator == ILIKE_KEYWORD:
            if self.char.is_delimiter():
                self.store_typed_char(CharType.SPACE)
                self.key_value_operator = Operator.ILIKE.value
                self.set_state(State.EXPECT_VALUE)
            elif self.char.is_single_quote():
                self.key_value_operator = Operator.ILIKE.value
                self.set_value_is_string()
                self.set_state(State.SINGLE_QUOTED_VALUE)
                self.store_typed_char(CharType.VALUE)
            elif self.char.is_double_quote():
                self.key_value_operator = Operator.ILIKE.value
                self.set_value_is_string()
                self.set_state(State.DOUBLE_QUOTED_VALUE)
                self.store_typed_char(CharType.VALUE)
            elif self.char.is_parameter_start():
                self.key_value_operator = Operator.ILIKE.value
                self._value_start = self.char.pos
                self.set_state(State.PARAMETER)
                self.store_typed_char(CharType.PARAMETER)
            elif self.char.is_value():
                self.key_value_operator = Operator.ILIKE.value
                self.set_state(State.VALUE)
                self.extend_value()
                self.store_typed_char(CharType.VALUE)
            else:
                self.set_error_state(
                    "expected value after 'ilike'", ERR_EXPECTED_VALUE_OR_KEYWORD
                )
            return
        elif self.key_value_operator == "in":
            if self.char.is_delimiter():
                self.store_typed_char(CharType.SPACE)
                self.key_value_operator = ""
                self.is_not_in = False
                self.set_state(State.EXPECT_LIST_START)
            elif self.char.value == "[":
                self.store_typed_char(CharType.OPERATOR)
                self.key_value_operator = ""
                self.is_not_in = False
                self.set_state(State.EXPECT_LIST_VALUE)
            else:
                self.set_error_state(
                    "expected '[' after 'in'", ERR_EXPECTED_LIST_START_AFTER_IN
                )
        elif self.char.is_delimiter():
            self.store_typed_char(CharType.SPACE)
            if self.key_value_operator not in VALID_KEY_VALUE_OPERATORS:
                self.set_error_state(
                    f"unknown operator: {self.key_value_operator}",
                    ERR_INVALID_CHAR_OR_UNKNOWN_OPERATOR,
                )
            else:
                self.set_state(State.EXPECT_VALUE)
        elif self.char.is_op():
            self.extend_key_value_operator()
            self.store_typed_char(CharType.OPERATOR)
        elif self.char.is_parameter_start():
            if self.key_value_operator not in VALID_KEY_VALUE_OPERATORS:
                self.set_error_state(
                    f"unknown operator: {self.key_value_operator}",
                    ERR_INVALID_CHAR_OR_UNKNOWN_OPERATOR,
                )
            else:
                self._value_start = self.char.pos
                self.set_state(State.PARAMETER)
                self.store_typed_char(CharType.PARAMETER)
        elif self.char.is_value():
            if self.key_value_operator not in VALID_KEY_VALUE_OPERATORS:
                self.set_error_state(
                    f"unknown operator: {self.key_value_operator}",
                    ERR_INVALID_CHAR_OR_UNKNOWN_OPERATOR,
                )
            else:
                self.set_state(State.VALUE)
                self.extend_value()
                self.store_typed_char(CharType.VALUE)
        elif self.char.is_single_quote():
            if self.key_value_operator not in VALID_KEY_VALUE_OPERATORS:
                self.set_error_state(
                    f"unknown operator: {self.key_value_operator}",
                    ERR_INVALID_CHAR_OR_UNKNOWN_OPERATOR,
                )
            else:
                self.set_value_is_string()
                self.set_state(State.SINGLE_QUOTED_VALUE)
                self.store_typed_char(CharType.VALUE)
        elif self.char.is_double_quote():
            if self.key_value_operator not in VALID_KEY_VALUE_OPERATORS:
                self.set_error_state(
                    f"unknown operator: {self.key_value_operator}",
                    ERR_INVALID_CHAR_OR_UNKNOWN_OPERATOR,
                )
            else:
                self.set_value_is_string()
                self.set_state(State.DOUBLE_QUOTED_VALUE)
                self.store_typed_char(CharType.VALUE)
        else:
            self.set_error_state(
                "invalid character", ERR_INVALID_CHAR_IN_KEY_VALUE_OPERATOR
            )

    def in_state_expect_value(self) -> None:
        if not self.char:
            return

        if self.char.is_delimiter():
            self.store_typed_char(CharType.SPACE)
            return
        elif self.char.is_parameter_start():
            self._value_start = self.char.pos
            self.set_state(State.PARAMETER)
            self.store_typed_char(CharType.PARAMETER)
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
            self.set_error_state("expected value", ERR_EXPECTED_VALUE)

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
        elif self.char.is_group_open():
            if self.value in KNOWN_FUNCTIONS:
                name_len = len(self.value)
                start_idx = max(0, len(self.typed_chars) - name_len)
                for i in range(start_idx, len(self.typed_chars)):
                    if self.typed_chars[i][1] == CharType.VALUE:
                        self.typed_chars[i] = (
                            self.typed_chars[i][0],
                            CharType.FUNCTION,
                        )
                self._function_name = self.value
                self.value = ""
                self.set_state(State.FUNCTION_ARGS)
                self.store_typed_char(CharType.OPERATOR)
            else:
                self.set_error_state(
                    f"unknown function '{self.value}'", ERR_UNKNOWN_FUNCTION
                )
        elif self.char.is_group_close():
            if not self.nodes_stack:
                self.set_error_state(
                    "unmatched parenthesis", ERR_UNMATCHED_PAREN_IN_EXPR
                )
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
            self.set_error_state(
                "invalid character", ERR_INVALID_CHAR_OR_UNKNOWN_OPERATOR
            )
            return

    def _finalize_parameter(self) -> None:
        """Validate and create a Parameter expression from accumulated value."""
        name = self.value
        if not name:
            self.set_error_state("empty parameter name", ERR_EMPTY_PARAMETER_NAME)
            return
        if name[0].isdigit():
            if not name.isdigit():
                self.set_error_state(
                    "invalid parameter name", ERR_INVALID_PARAMETER_NAME
                )
                return
            if int(name) == 0:
                self.set_error_state(
                    "positional parameters are 1-indexed", ERR_PARAMETER_ZERO_INDEX
                )
                return
        param = Parameter(name=name, positional=name[0].isdigit())
        expr_end = (
            self._value_end
            if self._value_end >= 0
            else self.char.pos if self.char else 0
        )
        expr_range, key_range, operator_range = self._build_expr_ranges(expr_end)
        value_range = (
            Range(self._value_start, self._value_end)
            if self._value_start >= 0
            else None
        )
        key = self._parse_key_with_range(key_range)
        expression = Expression(
            key=key,
            operator=self.key_value_operator,
            value=param,
            value_is_string=None,
            range=expr_range,
            operator_range=operator_range,
            value_range=value_range,
            value_type=LiteralKind.PARAMETER,
        )
        self.extend_tree(expression)
        self.reset_data()

    def in_state_parameter(self) -> None:
        if not self.char:
            return

        if self.char.value.isalnum() or self.char.value == "_":
            self.extend_value()
            self.store_typed_char(CharType.PARAMETER)
        elif self.char.is_delimiter():
            self._finalize_parameter()
            if self.state != State.ERROR:
                self.reset_bool_operator()
                self.set_state(State.EXPECT_BOOL_OP)
                self.store_typed_char(CharType.SPACE)
        elif self.char.is_group_close():
            if not self.nodes_stack:
                self.set_error_state(
                    "unmatched parenthesis", ERR_UNMATCHED_PAREN_IN_EXPR
                )
                return
            self._finalize_parameter()
            if self.state != State.ERROR:
                if self.bool_op_stack:
                    self.bool_operator = self.bool_op_stack.pop()
                self.extend_tree_from_stack(bool_operator=self.bool_operator)
                self.reset_bool_operator()
                self.set_state(State.EXPECT_BOOL_OP)
                self.store_typed_char(CharType.OPERATOR)
        else:
            self.set_error_state(
                "invalid character in parameter name",
                ERR_INVALID_CHAR_OR_UNKNOWN_OPERATOR,
            )

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
                # Include closing quote in value range.
                self._value_end = self.char.pos + 1
                self.set_state(State.EXPECT_BOOL_OP)
                self.extend_tree()
                self.reset_data()
                self.reset_bool_operator()
        else:
            self.set_error_state("invalid character", ERR_INVALID_CHAR_IN_QUOTED_VALUE)
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
                # Include closing quote in value range.
                self._value_end = self.char.pos + 1
                self.set_state(State.EXPECT_BOOL_OP)
                self.extend_tree()
                self.reset_data()
                self.reset_bool_operator()
        else:
            self.set_error_state("invalid character", ERR_INVALID_CHAR_IN_QUOTED_VALUE)
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
            self.set_error_state(
                "invalid character in quoted key", ERR_INVALID_CHAR_IN_SINGLE_QUOTED_KEY
            )
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
            self.set_error_state(
                "invalid character in quoted key", ERR_INVALID_CHAR_IN_DOUBLE_QUOTED_KEY
            )
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
            self._group_start_stack.append(self.char.pos)
            self._depth += 1
            if self.max_depth > 0 and self._depth > self.max_depth:
                self.set_error_state(
                    f"maximum nesting depth exceeded ({self.max_depth})",
                    ERR_MAX_DEPTH_EXCEEDED,
                )
                return
            self.set_state(State.INITIAL)
            self.store_typed_char(CharType.OPERATOR)
        elif self.char.is_group_close():
            if not self.nodes_stack:
                self.set_error_state(
                    "unmatched parenthesis", ERR_UNMATCHED_PAREN_IN_BOOL_DELIM
                )
                return
            else:
                self.reset_data()
                if self.bool_op_stack:
                    self.extend_tree_from_stack(bool_operator=self.bool_op_stack.pop())
                self.set_state(State.EXPECT_BOOL_OP)
                self.store_typed_char(CharType.OPERATOR)
        else:
            self.set_error_state("invalid character", ERR_INVALID_CHAR_IN_BOOL_DELIM)
            return

    def in_state_expect_bool_op(self) -> None:
        if not self.char:
            return

        if self.char.is_delimiter():
            self.store_typed_char(CharType.SPACE)
            return
        elif self.char.is_group_close():
            if not self.nodes_stack:
                self.set_error_state(
                    "unmatched parenthesis", ERR_UNMATCHED_PAREN_IN_EXPECT_BOOL
                )
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
                self.set_error_state(
                    "invalid character", ERR_INVALID_CHAR_IN_EXPECT_BOOL
                )
            else:
                if self.bool_operator in VALID_BOOL_OPERATORS:
                    next_pos = self.char.pos + 1
                    if len(self.text) > next_pos:
                        next_char = Char(self.text[next_pos], next_pos, 0, 0)
                        if not next_char.is_delimiter():
                            self.set_error_state(
                                "expected delimiter after bool operator",
                                ERR_EXPECTED_DELIM_AFTER_BOOL_OP,
                            )
                            return
                        else:
                            self.set_state(State.BOOL_OP_DELIMITER)
                    else:
                        self.set_state(State.BOOL_OP_DELIMITER)

    def in_state_key_or_bool_op(self) -> None:
        """After a key and delimiter, determine if truthy expression, has operator, or in/not in."""
        if not self.char:
            return

        if self.char.is_delimiter():
            self.store_typed_char(CharType.SPACE)
            return
        elif self.char.is_op():
            self.extend_key_value_operator()
            self.set_state(State.KEY_VALUE_OPERATOR)
            self.store_typed_char(CharType.OPERATOR)
        elif self.char.is_group_close():
            if not self.nodes_stack:
                self.set_error_state(
                    "unmatched parenthesis", ERR_UNMATCHED_PAREN_IN_EXPR
                )
                return
            self.extend_tree(self.new_truthy_expression())
            self.reset_data()
            if self.bool_op_stack:
                self.bool_operator = self.bool_op_stack.pop()
            self.extend_tree_from_stack(bool_operator=self.bool_operator)
            self.reset_bool_operator()
            self.set_state(State.EXPECT_BOOL_OP)
            self.store_typed_char(CharType.OPERATOR)
        elif self.char.value == "i":
            self.key_value_operator = "i"
            self.set_state(State.KEY_VALUE_OPERATOR)
            self.store_typed_char(CharType.OPERATOR)
        elif self.char.value == "l":
            self.key_value_operator = "l"
            self.set_state(State.KEY_VALUE_OPERATOR)
            self.store_typed_char(CharType.OPERATOR)
        elif self.char.value == "h":
            self.key_value_operator = "h"
            self.set_state(State.KEY_VALUE_OPERATOR)
            self.store_typed_char(CharType.OPERATOR)
        elif self.char.value == "n":
            self.key_value_operator = "n"
            self.set_state(State.EXPECT_IN_KEYWORD)
            self.store_typed_char(CharType.OPERATOR)
        elif self.char.value in VALID_BOOL_OPERATORS_CHARS:
            self.extend_tree(self.new_truthy_expression())
            self.reset_data()
            self.reset_bool_operator()
            self.extend_bool_operator()
            self.store_typed_char(CharType.OPERATOR)
            self.set_state(State.EXPECT_BOOL_OP)
        else:
            self.set_error_state(
                "expected operator or boolean operator",
                ERR_EXPECTED_OPERATOR_OR_BOOL_OP,
            )
            return

    def in_state_expect_not_target(self) -> None:
        """After 'not ' keyword, expect key, quoted key, or group open."""
        if not self.char:
            return

        if self.char.is_delimiter():
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
            self.extend_nodes_stack()
            self.extend_bool_op_stack()
            self.negation_stack.append(self.consume_pending_negation())
            self._group_start_stack.append(self.char.pos)
            self._depth += 1
            if self.max_depth > 0 and self._depth > self.max_depth:
                self.set_error_state(
                    f"maximum nesting depth exceeded ({self.max_depth})",
                    ERR_MAX_DEPTH_EXCEEDED,
                )
                return
            self.set_state(State.INITIAL)
            self.store_typed_char(CharType.OPERATOR)
        else:
            self.set_error_state(
                "expected key or ( after 'not'", ERR_EXPECTED_KEY_OR_PAREN_AFTER_NOT
            )
            return

    def in_state_expect_in_keyword(self) -> None:
        """After 'n' in KEY_OR_BOOL_OP state, determine if 'not in', 'not', or something else."""
        if not self.char:
            return

        if self.key_value_operator == "n":
            if self.char.value == "o":
                self.key_value_operator += "o"
                self.store_typed_char(CharType.OPERATOR)
            else:
                self.set_error_state(
                    "expected 'not' or 'in' keyword", ERR_EXPECTED_NOT_OR_IN_KEYWORD
                )
        elif self.key_value_operator == "no":
            if self.char.value == "t":
                self.key_value_operator += "t"
                self.store_typed_char(CharType.OPERATOR)
            else:
                self.set_error_state(
                    "expected 'not' keyword", ERR_EXPECTED_NOT_OR_IN_KEYWORD
                )
        elif self.key_value_operator == "not":
            if self.char.is_delimiter():
                self.store_typed_char(CharType.SPACE)
                self.key_value_operator = ""
                self.is_not_in = True
                self.set_state(State.EXPECT_LIST_START)
            else:
                self.set_error_state(
                    "expected space after 'not'", ERR_EXPECTED_NOT_OR_IN_KEYWORD
                )
        else:
            self.set_error_state(
                "unexpected state in expect_in_keyword", ERR_EXPECTED_NOT_OR_IN_KEYWORD
            )

    def in_state_expect_list_start(self) -> None:
        """After 'in' or 'not in' keyword, expect '[' to start list."""
        if not self.char:
            return

        if self.char.is_delimiter():
            self.store_typed_char(CharType.SPACE)
            return
        elif self.char.value == "h" and self.is_not_in:
            self.key_value_operator = "h"
            self.is_not_in = False
            self.is_not_has = True
            self.set_state(State.EXPECT_HAS_KEYWORD)
            self.store_typed_char(CharType.OPERATOR)
        elif self.char.value == "l" and self.is_not_in:
            self.key_value_operator = "l"
            self.is_not_in = False
            self.is_not_like = True
            self.set_state(State.EXPECT_LIKE_KEYWORD)
            self.store_typed_char(CharType.OPERATOR)
        elif self.char.value == "i" and self.is_not_in:
            self.key_value_operator = "i"
            self.set_state(State.EXPECT_LIKE_KEYWORD)
            self.store_typed_char(CharType.OPERATOR)
        elif self.char.value == "i":
            self.key_value_operator = "i"
            self.store_typed_char(CharType.OPERATOR)
        elif self.key_value_operator == "i" and self.char.value == "n":
            self.key_value_operator = ""
            self.store_typed_char(CharType.OPERATOR)
        elif self.char.value == "[":
            self.store_typed_char(CharType.OPERATOR)
            self.set_state(State.EXPECT_LIST_VALUE)
        else:
            self.set_error_state("expected '['", ERR_EXPECTED_LIST_START)

    def in_state_expect_has_keyword(self) -> None:
        """After 'not ' in the not-has path, build 'has' keyword char by char."""
        if not self.char:
            return

        if self.key_value_operator == "h" and self.char.value == "a":
            self.key_value_operator = "ha"
            self.store_typed_char(CharType.OPERATOR)
        elif self.key_value_operator == "ha" and self.char.value == "s":
            self.key_value_operator = HAS_KEYWORD
            self.store_typed_char(CharType.OPERATOR)
        elif self.key_value_operator == HAS_KEYWORD:
            if self.char.is_delimiter():
                self.store_typed_char(CharType.SPACE)
                self.key_value_operator = Operator.NOT_HAS.value
                self.set_state(State.EXPECT_VALUE)
            elif self.char.is_single_quote():
                self.key_value_operator = Operator.NOT_HAS.value
                self.set_value_is_string()
                self.set_state(State.SINGLE_QUOTED_VALUE)
                self.store_typed_char(CharType.VALUE)
            elif self.char.is_double_quote():
                self.key_value_operator = Operator.NOT_HAS.value
                self.set_value_is_string()
                self.set_state(State.DOUBLE_QUOTED_VALUE)
                self.store_typed_char(CharType.VALUE)
            elif self.char.is_parameter_start():
                self.key_value_operator = Operator.NOT_HAS.value
                self._value_start = self.char.pos
                self.set_state(State.PARAMETER)
                self.store_typed_char(CharType.PARAMETER)
            elif self.char.is_value():
                self.key_value_operator = Operator.NOT_HAS.value
                self.set_state(State.VALUE)
                self.extend_value()
                self.store_typed_char(CharType.VALUE)
            else:
                self.set_error_state(
                    "expected value after 'not has'", ERR_EXPECTED_VALUE_OR_KEYWORD
                )
        else:
            self.set_error_state(
                "expected 'has' keyword", ERR_EXPECTED_VALUE_OR_KEYWORD
            )

    def in_state_expect_like_keyword(self) -> None:
        """After 'not ' in the not-like/not-ilike path, build keyword char by char."""
        if not self.char:
            return

        # Path A: building 'like' (from 'l')
        if self.key_value_operator == "l" and self.char.value == "i":
            self.key_value_operator = "li"
            self.store_typed_char(CharType.OPERATOR)
        elif self.key_value_operator == "li" and self.char.value == "k":
            self.key_value_operator = "lik"
            self.store_typed_char(CharType.OPERATOR)
        elif self.key_value_operator == "lik" and self.char.value == "e":
            self.key_value_operator = LIKE_KEYWORD
            self.store_typed_char(CharType.OPERATOR)
        elif self.key_value_operator == LIKE_KEYWORD:
            if self.char.is_delimiter():
                self.store_typed_char(CharType.SPACE)
                self.key_value_operator = Operator.NOT_LIKE.value
                self.set_state(State.EXPECT_VALUE)
            elif self.char.is_single_quote():
                self.key_value_operator = Operator.NOT_LIKE.value
                self.set_value_is_string()
                self.set_state(State.SINGLE_QUOTED_VALUE)
                self.store_typed_char(CharType.VALUE)
            elif self.char.is_double_quote():
                self.key_value_operator = Operator.NOT_LIKE.value
                self.set_value_is_string()
                self.set_state(State.DOUBLE_QUOTED_VALUE)
                self.store_typed_char(CharType.VALUE)
            elif self.char.is_parameter_start():
                self.key_value_operator = Operator.NOT_LIKE.value
                self._value_start = self.char.pos
                self.set_state(State.PARAMETER)
                self.store_typed_char(CharType.PARAMETER)
            elif self.char.is_value():
                self.key_value_operator = Operator.NOT_LIKE.value
                self.set_state(State.VALUE)
                self.extend_value()
                self.store_typed_char(CharType.VALUE)
            else:
                self.set_error_state(
                    "expected value after 'not like'", ERR_EXPECTED_VALUE_OR_KEYWORD
                )
        # Path B: disambiguate 'i' → 'in' (not in) vs 'il' (not ilike)
        elif self.key_value_operator == "i" and self.char.value == "n":
            self.key_value_operator = ""
            self.is_not_in = True
            self.store_typed_char(CharType.OPERATOR)
            self.set_state(State.EXPECT_LIST_START)
        elif self.key_value_operator == "i" and self.char.value == "l":
            self.key_value_operator = "il"
            self.is_not_in = False
            self.is_not_ilike = True
            self.store_typed_char(CharType.OPERATOR)
        elif self.key_value_operator == "il" and self.char.value == "i":
            self.key_value_operator = "ili"
            self.store_typed_char(CharType.OPERATOR)
        elif self.key_value_operator == "ili" and self.char.value == "k":
            self.key_value_operator = "ilik"
            self.store_typed_char(CharType.OPERATOR)
        elif self.key_value_operator == "ilik" and self.char.value == "e":
            self.key_value_operator = ILIKE_KEYWORD
            self.store_typed_char(CharType.OPERATOR)
        elif self.key_value_operator == ILIKE_KEYWORD:
            if self.char.is_delimiter():
                self.store_typed_char(CharType.SPACE)
                self.key_value_operator = Operator.NOT_ILIKE.value
                self.set_state(State.EXPECT_VALUE)
            elif self.char.is_single_quote():
                self.key_value_operator = Operator.NOT_ILIKE.value
                self.set_value_is_string()
                self.set_state(State.SINGLE_QUOTED_VALUE)
                self.store_typed_char(CharType.VALUE)
            elif self.char.is_double_quote():
                self.key_value_operator = Operator.NOT_ILIKE.value
                self.set_value_is_string()
                self.set_state(State.DOUBLE_QUOTED_VALUE)
                self.store_typed_char(CharType.VALUE)
            elif self.char.is_parameter_start():
                self.key_value_operator = Operator.NOT_ILIKE.value
                self._value_start = self.char.pos
                self.set_state(State.PARAMETER)
                self.store_typed_char(CharType.PARAMETER)
            elif self.char.is_value():
                self.key_value_operator = Operator.NOT_ILIKE.value
                self.set_state(State.VALUE)
                self.extend_value()
                self.store_typed_char(CharType.VALUE)
            else:
                self.set_error_state(
                    "expected value after 'not ilike'", ERR_EXPECTED_VALUE_OR_KEYWORD
                )
        else:
            self.set_error_state(
                "expected 'like' or 'ilike' keyword", ERR_EXPECTED_VALUE_OR_KEYWORD
            )

    def in_state_expect_list_value(self) -> None:
        """Inside list, expecting a value or ']'."""
        if not self.char:
            return

        if self.char.is_delimiter():
            self.store_typed_char(CharType.SPACE)
            return
        elif self.char.value == "]":
            self.store_typed_char(CharType.OPERATOR)
            self.extend_tree(self.new_in_expression())
            self.reset_data()
            self.reset_bool_operator()
            self.set_state(State.EXPECT_BOOL_OP)
        elif self.char.is_single_quote():
            self.in_list_current_value_is_string = True
            self.in_list_quote_char = self.char.value
            self._in_list_value_start = self.char.pos
            self._in_list_value_end = self.char.pos + 1
            self.store_typed_char(CharType.VALUE)
            self.set_state(State.IN_LIST_SINGLE_QUOTED_VALUE)
        elif self.char.is_double_quote():
            self.in_list_current_value_is_string = True
            self.in_list_quote_char = self.char.value
            self._in_list_value_start = self.char.pos
            self._in_list_value_end = self.char.pos + 1
            self.store_typed_char(CharType.VALUE)
            self.set_state(State.IN_LIST_DOUBLE_QUOTED_VALUE)
        elif self.char.is_parameter_start():
            self._in_list_value_start = self.char.pos
            self.set_state(State.IN_LIST_PARAMETER)
            self.store_typed_char(CharType.PARAMETER)
        elif self.char.is_value():
            self.extend_in_list_current_value()
            self.store_typed_char(CharType.VALUE)
            self.set_state(State.IN_LIST_VALUE)
        else:
            self.set_error_state("expected value in list", ERR_EXPECTED_VALUE_IN_LIST)

    def in_state_in_list_value(self) -> None:
        """Parsing an unquoted value inside a list."""
        if not self.char:
            return

        if self.char.is_value() and self.char.value not in (",", "]"):
            self.extend_in_list_current_value()
            self.store_typed_char(CharType.VALUE)
        elif self.char.is_delimiter():
            if not self.finalize_in_list_value():
                return
            self.store_typed_char(CharType.SPACE)
            self.set_state(State.EXPECT_LIST_COMMA_OR_END)
        elif self.char.value == ",":
            if not self.finalize_in_list_value():
                return
            self.store_typed_char(CharType.OPERATOR)
            self.set_state(State.EXPECT_LIST_VALUE)
        elif self.char.value == "]":
            if not self.finalize_in_list_value():
                return
            self.store_typed_char(CharType.OPERATOR)
            self.extend_tree(self.new_in_expression())
            self.reset_data()
            self.reset_bool_operator()
            self.set_state(State.EXPECT_BOOL_OP)
        else:
            self.set_error_state(
                "unexpected character in list value", ERR_UNEXPECTED_CHAR_IN_LIST_VALUE
            )

    def _finalize_in_list_parameter(self) -> bool:
        """Validate and finalize a parameter in an IN-list."""
        name = self.in_list_current_value
        if not name:
            self.set_error_state("empty parameter name", ERR_EMPTY_PARAMETER_NAME)
            return False
        if name[0].isdigit():
            if not name.isdigit():
                self.set_error_state(
                    "invalid parameter name", ERR_INVALID_PARAMETER_NAME
                )
                return False
            if int(name) == 0:
                self.set_error_state(
                    "positional parameters are 1-indexed", ERR_PARAMETER_ZERO_INDEX
                )
                return False
        param = Parameter(name=name, positional=name[0].isdigit())
        self.in_list_values.append(param)
        self.in_list_values_types.append(LiteralKind.PARAMETER)
        if self._in_list_value_start >= 0:
            self._in_list_value_ranges.append(
                Range(self._in_list_value_start, self._in_list_value_end)
            )
        self.in_list_current_value = ""
        self.in_list_current_value_is_string = None
        self._in_list_value_start = -1
        self._in_list_value_end = -1
        return True

    def in_state_in_list_parameter(self) -> None:
        """Parsing a parameter ($name) inside a list."""
        if not self.char:
            return

        c = self.char.value
        if c.isalnum() or c == "_":
            self.in_list_current_value += c
            self._in_list_value_end = self.char.pos + 1
            self.store_typed_char(CharType.PARAMETER)
        elif self.char.is_delimiter():
            if not self._finalize_in_list_parameter():
                return
            self.store_typed_char(CharType.SPACE)
            self.set_state(State.EXPECT_LIST_COMMA_OR_END)
        elif c == ",":
            if not self._finalize_in_list_parameter():
                return
            self.store_typed_char(CharType.OPERATOR)
            self.set_state(State.EXPECT_LIST_VALUE)
        elif c == "]":
            if not self._finalize_in_list_parameter():
                return
            self.store_typed_char(CharType.OPERATOR)
            self.extend_tree(self.new_in_expression())
            self.reset_data()
            self.reset_bool_operator()
            self.set_state(State.EXPECT_BOOL_OP)
        else:
            self.set_error_state(
                "invalid character in parameter name",
                ERR_INVALID_CHAR_OR_UNKNOWN_OPERATOR,
            )

    def in_state_in_list_single_quoted_value(self) -> None:
        """Parsing a single-quoted value inside a list."""
        if not self.char:
            return

        if self.char.is_single_quoted_value():
            self.extend_in_list_current_value()
            self.store_typed_char(CharType.VALUE)
        elif self.char.is_single_quote():
            self.store_typed_char(CharType.VALUE)
            prev_pos = self.char.pos - 1
            if prev_pos >= 0 and self.text[prev_pos] == "\\":
                self.extend_in_list_current_value()
            else:
                self._in_list_value_end = self.char.pos + 1
                if not self.finalize_in_list_value():
                    return
                self.set_state(State.EXPECT_LIST_COMMA_OR_END)
        else:
            self.set_error_state(
                "invalid character in quoted value",
                ERR_INVALID_CHAR_IN_LIST_QUOTED_VALUE,
            )

    def in_state_in_list_double_quoted_value(self) -> None:
        """Parsing a double-quoted value inside a list."""
        if not self.char:
            return

        if self.char.is_double_quoted_value():
            self.extend_in_list_current_value()
            self.store_typed_char(CharType.VALUE)
        elif self.char.is_double_quote():
            self.store_typed_char(CharType.VALUE)
            prev_pos = self.char.pos - 1
            if prev_pos >= 0 and self.text[prev_pos] == "\\":
                self.extend_in_list_current_value()
            else:
                self._in_list_value_end = self.char.pos + 1
                if not self.finalize_in_list_value():
                    return
                self.set_state(State.EXPECT_LIST_COMMA_OR_END)
        else:
            self.set_error_state(
                "invalid character in quoted value",
                ERR_INVALID_CHAR_IN_LIST_QUOTED_VALUE,
            )

    def in_state_expect_list_comma_or_end(self) -> None:
        """After a value in list, expect ',' or ']'."""
        if not self.char:
            return

        if self.char.is_delimiter():
            self.store_typed_char(CharType.SPACE)
            return
        elif self.char.value == ",":
            self.store_typed_char(CharType.OPERATOR)
            self.set_state(State.EXPECT_LIST_VALUE)
        elif self.char.value == "]":
            self.store_typed_char(CharType.OPERATOR)
            self.extend_tree(self.new_in_expression())
            self.reset_data()
            self.reset_bool_operator()
            self.set_state(State.EXPECT_BOOL_OP)
        else:
            self.set_error_state("expected ',' or ']'", ERR_EXPECTED_COMMA_OR_LIST_END)

    def _reset_function_data(self) -> None:
        self._function_name = ""
        self._function_duration_buf = ""
        self._function_args = []
        self._function_durations = []
        self._function_current_arg = ""
        self._function_parameter_args = []
        self._function_param_buf = ""

    def _parse_duration_buf(self) -> bool:
        buf = self._function_duration_buf
        if not buf:
            return False
        num_buf = ""
        # Enforce strictly descending, unique-unit duration literals
        # (Prometheus-style). prev_magnitude starts above the highest unit
        # so the first unit is always accepted; each subsequent unit must
        # have strictly lower magnitude.
        prev_magnitude = float("inf")
        for c in buf:
            if c.isdigit():
                num_buf += c
            else:
                magnitude = DURATION_UNIT_MAGNITUDE.get(c)
                if magnitude is None:
                    self.set_error_state(
                        f"invalid duration unit '{c}' — expected s, m, h, d, or w",
                        ERR_INVALID_DURATION,
                    )
                    return False
                if not num_buf:
                    self.set_error_state(
                        "invalid duration format", ERR_INVALID_DURATION
                    )
                    return False
                if magnitude >= prev_magnitude:
                    self.set_error_state(
                        f"invalid duration '{buf}' — units must appear in strictly descending order and only once (e.g. '1w2d3h4m5s')",
                        ERR_INVALID_DURATION,
                    )
                    return False
                prev_magnitude = magnitude
                self._function_durations.append(Duration(value=int(num_buf), unit=c))
                num_buf = ""
        if num_buf:
            self.set_error_state(
                "invalid duration format — missing unit", ERR_INVALID_DURATION
            )
            return False
        return True

    def _complete_function_call(self) -> None:
        name = self._function_name

        if self.key_value_operator in (Operator.REGEX.value, Operator.NOT_REGEX.value):
            self.set_error_state(
                f"operator '{self.key_value_operator}' is not valid with a temporal function",
                ERR_FUNCTION_NOT_ALLOWED_WITH_OPERATOR,
            )
            return

        fc: Optional[FunctionCall] = None

        if self._function_parameter_args:
            # Currently unreachable: the state machine can't produce both
            # parameter args and a non-empty duration buf in the same call
            # (FUNCTION_DURATION has no `,` transition). Kept defensive: if
            # _parse_duration_buf ever sets the error state, honor it rather
            # than silently overwriting with state_expect_bool_op below.
            if self._function_duration_buf and not self._parse_duration_buf():
                return
            fc = FunctionCall(
                name=name,
                duration_args=list(self._function_durations),
                parameter_args=list(self._function_parameter_args),
            )
            if self._function_args:
                if name in ("today", "startOf"):
                    fc.unit = self._function_args[0] if name == "startOf" else ""
                    tz_idx = 1 if name == "startOf" else 0
                    fc.timezone = (
                        self._function_args[tz_idx]
                        if len(self._function_args) > tz_idx
                        else ""
                    )
        elif name == "ago":
            if self._function_args:
                self.set_error_state(
                    "ago() requires a duration, not a string argument",
                    ERR_INVALID_DURATION,
                )
                return
            if not self._parse_duration_buf():
                if self.state != State.ERROR:
                    self.set_error_state(
                        "ago() requires a duration argument", ERR_INVALID_DURATION
                    )
                return
            if not self._function_durations:
                self.set_error_state(
                    "ago() requires a duration argument", ERR_INVALID_DURATION
                )
                return
            fc = FunctionCall(name="ago", duration_args=list(self._function_durations))
        elif name == "now":
            if self._function_args or self._function_duration_buf:
                self.set_error_state(
                    "now() does not accept arguments", ERR_INVALID_DURATION
                )
                return
            fc = FunctionCall(name="now")
        elif name == "today":
            if self._function_duration_buf:
                self.set_error_state(
                    "today() does not accept duration arguments", ERR_INVALID_DURATION
                )
                return
            if len(self._function_args) > 1:
                self.set_error_state(
                    "today() accepts at most one argument (timezone)",
                    ERR_INVALID_DURATION,
                )
                return
            tz = self._function_args[0] if self._function_args else ""
            fc = FunctionCall(name="today", timezone=tz)
        elif name == "startOf":
            if self._function_duration_buf:
                self.set_error_state(
                    "startOf() does not accept duration arguments", ERR_INVALID_DURATION
                )
                return
            if not self._function_args:
                self.set_error_state(
                    "startOf() requires a unit argument ('day', 'week', or 'month')",
                    ERR_INVALID_DURATION,
                )
                return
            unit = self._function_args[0]
            if unit not in ("day", "week", "month"):
                self.set_error_state(
                    f"invalid unit '{unit}' — expected 'day', 'week', or 'month'",
                    ERR_INVALID_DURATION,
                )
                return
            if len(self._function_args) > 2:
                self.set_error_state(
                    "startOf() accepts at most two arguments (unit, timezone)",
                    ERR_INVALID_DURATION,
                )
                return
            tz = self._function_args[1] if len(self._function_args) == 2 else ""
            fc = FunctionCall(name="startOf", unit=unit, timezone=tz)

        if fc is None:
            return

        assert self.char is not None
        key_range = Range(self._key_start, self._key_end)
        key = self._parse_key_with_range(key_range)
        expr_range = Range(self._expr_start, self.char.pos + 1)
        operator_range = Range(self._operator_start, self._operator_end)
        value_range = Range(self._value_start, self.char.pos + 1)

        expr = Expression(
            key=key,
            operator=self.key_value_operator,
            value=fc,
            value_is_string=False,
            range=expr_range,
            operator_range=operator_range,
            value_range=value_range,
            value_type=LiteralKind.FUNCTION,
        )

        self.extend_tree(expr)
        self.reset_data()
        self._reset_function_data()
        self.reset_bool_operator()
        self.set_state(State.EXPECT_BOOL_OP)

    def in_state_function_args(self) -> None:
        if not self.char:
            return

        if self.char.is_group_close():
            self.store_typed_char(CharType.OPERATOR)
            self._complete_function_call()
        elif self.char.is_parameter_start():
            self._function_param_buf = ""
            self.set_state(State.FUNCTION_PARAMETER)
            self.store_typed_char(CharType.PARAMETER)
        elif self.char.value.isdigit():
            self._function_duration_buf += self.char.value
            self.set_state(State.FUNCTION_DURATION)
            self.store_typed_char(CharType.NUMBER)
        elif self.char.is_single_quote():
            self._function_current_arg = ""
            self.set_state(State.FUNCTION_QUOTED_ARG)
            self.store_typed_char(CharType.VALUE)
        elif self.char.is_delimiter():
            self.store_typed_char(CharType.SPACE)
        else:
            self.set_error_state("invalid function argument", ERR_INVALID_FUNCTION_ARGS)

    def in_state_function_duration(self) -> None:
        if not self.char:
            return

        if self.char.value.isdigit():
            self._function_duration_buf += self.char.value
            self.store_typed_char(CharType.NUMBER)
        elif self.char.value in ("s", "m", "h", "d", "w"):
            self._function_duration_buf += self.char.value
            self.store_typed_char(CharType.NUMBER)
        elif self.char.is_group_close():
            self.store_typed_char(CharType.OPERATOR)
            self._complete_function_call()
        else:
            self.set_error_state(
                f"invalid duration unit '{self.char.value}' — expected s, m, h, d, or w",
                ERR_INVALID_DURATION,
            )

    def in_state_function_quoted_arg(self) -> None:
        if not self.char:
            return

        if self.char.is_single_quote():
            prev_pos = self.char.pos - 1
            if prev_pos >= 0 and self.text[prev_pos] == "\\":
                self._function_current_arg += self.char.value
                self.store_typed_char(CharType.VALUE)
            else:
                self._function_args.append(self._function_current_arg)
                self.set_state(State.FUNCTION_EXPECT_COMMA_OR_CLOSE)
                self.store_typed_char(CharType.VALUE)
        else:
            self._function_current_arg += self.char.value
            self.store_typed_char(CharType.VALUE)

    def in_state_function_expect_comma_or_close(self) -> None:
        if not self.char:
            return

        if self.char.is_group_close():
            self.store_typed_char(CharType.OPERATOR)
            self._complete_function_call()
        elif self.char.value == ",":
            self.set_state(State.FUNCTION_EXPECT_ARG)
            self.store_typed_char(CharType.OPERATOR)
        elif self.char.is_delimiter():
            self.store_typed_char(CharType.SPACE)
        else:
            self.set_error_state(
                "expected ',' or ')' in function call", ERR_INVALID_FUNCTION_ARGS
            )

    def in_state_function_expect_arg(self) -> None:
        if not self.char:
            return

        if self.char.is_single_quote():
            self._function_current_arg = ""
            self.set_state(State.FUNCTION_QUOTED_ARG)
            self.store_typed_char(CharType.VALUE)
        elif self.char.is_parameter_start():
            self._function_param_buf = ""
            self.set_state(State.FUNCTION_PARAMETER)
            self.store_typed_char(CharType.PARAMETER)
        elif self.char.is_delimiter():
            self.store_typed_char(CharType.SPACE)
        else:
            self.set_error_state(
                "expected quoted argument in function call", ERR_INVALID_FUNCTION_ARGS
            )

    def _finalize_function_parameter(self) -> bool:
        """Validate and store a parameter in function args."""
        name = self._function_param_buf
        if not name:
            self.set_error_state("empty parameter name", ERR_EMPTY_PARAMETER_NAME)
            return False
        if name[0].isdigit():
            if not name.isdigit():
                self.set_error_state(
                    "invalid parameter name", ERR_INVALID_PARAMETER_NAME
                )
                return False
            if int(name) == 0:
                self.set_error_state(
                    "positional parameters are 1-indexed", ERR_PARAMETER_ZERO_INDEX
                )
                return False
        param = Parameter(name=name, positional=name[0].isdigit())
        self._function_parameter_args.append(param)
        self._function_param_buf = ""
        return True

    def in_state_function_parameter(self) -> None:
        if not self.char:
            return

        c = self.char.value
        if c.isalnum() or c == "_":
            self._function_param_buf += c
            self.store_typed_char(CharType.PARAMETER)
        elif self.char.is_group_close():
            if not self._finalize_function_parameter():
                return
            self.store_typed_char(CharType.OPERATOR)
            self._complete_function_call()
        elif c == ",":
            if not self._finalize_function_parameter():
                return
            self.set_state(State.FUNCTION_EXPECT_ARG)
            self.store_typed_char(CharType.OPERATOR)
        elif self.char.is_delimiter():
            if not self._finalize_function_parameter():
                return
            self.set_state(State.FUNCTION_EXPECT_COMMA_OR_CLOSE)
            self.store_typed_char(CharType.SPACE)
        else:
            self.set_error_state(
                "invalid character in parameter name", ERR_INVALID_FUNCTION_ARGS
            )

    def in_state_last_char(self) -> None:
        if self.state == State.INITIAL and not self.nodes_stack:
            self.set_error_state("empty input", ERR_EMPTY_INPUT)
        elif self.state in (
            State.FUNCTION_ARGS,
            State.FUNCTION_DURATION,
            State.FUNCTION_QUOTED_ARG,
            State.FUNCTION_EXPECT_COMMA_OR_CLOSE,
            State.FUNCTION_EXPECT_ARG,
            State.FUNCTION_PARAMETER,
        ):
            self.set_error_state("unclosed function call", ERR_INVALID_FUNCTION_ARGS)
        elif self.state in (
            State.INITIAL,
            State.SINGLE_QUOTED_KEY,
            State.DOUBLE_QUOTED_KEY,
            State.EXPECT_OPERATOR,
            State.EXPECT_VALUE,
            State.EXPECT_NOT_TARGET,
            State.EXPECT_IN_KEYWORD,
            State.EXPECT_HAS_KEYWORD,
            State.EXPECT_LIKE_KEYWORD,
            State.EXPECT_LIST_START,
            State.EXPECT_LIST_VALUE,
            State.IN_LIST_VALUE,
            State.IN_LIST_SINGLE_QUOTED_VALUE,
            State.IN_LIST_DOUBLE_QUOTED_VALUE,
            State.EXPECT_LIST_COMMA_OR_END,
            State.IN_LIST_PARAMETER,
        ):
            self.set_error_state("unexpected EOF", ERR_UNEXPECTED_EOF)
        elif self.state == State.KEY:
            if self.key == NOT_KEYWORD:
                self.set_error_state("unexpected EOF after 'not'", ERR_UNEXPECTED_EOF)
            else:
                self.extend_tree(self.new_truthy_expression())
                self.reset_bool_operator()
        elif self.state == State.KEY_OR_BOOL_OP:
            self.extend_tree(self.new_truthy_expression())
            self.reset_bool_operator()
        elif self.state in (State.DOUBLE_QUOTED_VALUE, State.SINGLE_QUOTED_VALUE):
            self.set_error_state(
                "unclosed string", ERR_EXPECTED_OPERATOR_OR_UNCLOSED_STRING
            )
            return
        elif self.state == State.VALUE:
            self.extend_tree()
            self.reset_bool_operator()
        elif self.state == State.PARAMETER:
            self._finalize_parameter()
            if self.state != State.ERROR:  # type: ignore[comparison-overlap]
                self.reset_bool_operator()
        elif self.state == State.BOOL_OP_DELIMITER:
            self.set_error_state("unexpected EOF", ERR_UNEXPECTED_EOF_IN_KEY)
            return

        if self.state != State.ERROR and self.nodes_stack:
            self.set_error_state("unmatched parenthesis", ERR_UNMATCHED_PAREN_AT_EOF)
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
        self._depth = 0
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
                case State.EXPECT_IN_KEYWORD:
                    self.in_state_expect_in_keyword()
                case State.EXPECT_HAS_KEYWORD:
                    self.in_state_expect_has_keyword()
                case State.EXPECT_LIKE_KEYWORD:
                    self.in_state_expect_like_keyword()
                case State.EXPECT_LIST_START:
                    self.in_state_expect_list_start()
                case State.EXPECT_LIST_VALUE:
                    self.in_state_expect_list_value()
                case State.IN_LIST_VALUE:
                    self.in_state_in_list_value()
                case State.IN_LIST_SINGLE_QUOTED_VALUE:
                    self.in_state_in_list_single_quoted_value()
                case State.IN_LIST_DOUBLE_QUOTED_VALUE:
                    self.in_state_in_list_double_quoted_value()
                case State.EXPECT_LIST_COMMA_OR_END:
                    self.in_state_expect_list_comma_or_end()
                case State.IN_LIST_PARAMETER:
                    self.in_state_in_list_parameter()
                case State.FUNCTION_ARGS:
                    self.in_state_function_args()
                case State.FUNCTION_DURATION:
                    self.in_state_function_duration()
                case State.FUNCTION_QUOTED_ARG:
                    self.in_state_function_quoted_arg()
                case State.FUNCTION_EXPECT_COMMA_OR_CLOSE:
                    self.in_state_function_expect_comma_or_close()
                case State.FUNCTION_EXPECT_ARG:
                    self.in_state_function_expect_arg()
                case State.FUNCTION_PARAMETER:
                    self.in_state_function_parameter()
                case State.PARAMETER:
                    self.in_state_parameter()
                case _:
                    self.set_error_state(f"Unknown state: {self.state}", ERR_UNKNOWN_STATE)  # type: ignore[unreachable]

            if self.state == State.ERROR:  # type: ignore[comparison-overlap]
                break  # type: ignore[unreachable]

            self.pos += 1
            self.line_pos += 1

        if self.state == State.ERROR:
            if raise_error:
                raise ParserError(
                    message=self.error_text,
                    errno=self.errno,
                    range=self._error_range,
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


class ParseResult:
    __slots__ = ("root",)

    def __init__(self, root: Optional[Node]) -> None:
        self.root = root


def parse(
    text: str, raise_error: bool = True, ignore_last_char: bool = False
) -> ParseResult:
    """
    Parse the given text and return a ParseResult with the AST root node.

    Args:
        text: The text to parse
        raise_error: If True, raise ParserError on error. If False, set error state and return.
        ignore_last_char: If True, skip final state validation
    """
    parser = Parser()
    parser.parse(text, raise_error, ignore_last_char)
    return ParseResult(root=parser.root)
