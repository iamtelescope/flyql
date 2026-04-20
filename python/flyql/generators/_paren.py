"""Shared precedence-aware wrapping for WHERE-tree generators.

Wraps a child subtree's SQL output in parens iff the child's effective
bool operator has strictly LOWER precedence than the parent's.
Atoms (child_op == "") are never wrapped.

The 2-entry precedence table is duplicated here (rather than imported
from flyql.core.parser) to keep the generator helpers free of parser
imports. The table MUST match flyql/core/parser.py:_BOOL_OP_PRECEDENCE;
drift is caught by fixture tests and e2e language-parity checks.
"""

_PRECEDENCE = {"and": 2, "or": 1}


def _precedence(op: str) -> int:
    return _PRECEDENCE.get(op, 0)


def wrap_child(child_text: str, child_op: str, parent_op: str) -> str:
    """Wrap child_text in parens iff child_op has strictly lower SQL
    precedence than parent_op. Atoms (empty child_op) are never wrapped.
    """
    if not child_op:
        return child_text
    if _precedence(child_op) < _precedence(parent_op):
        return f"({child_text})"
    return child_text


__all__ = ["wrap_child"]
