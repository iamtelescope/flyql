"""Unit tests for the precedence-aware paren helper."""

import pytest

from flyql.generators._paren import wrap_child


@pytest.mark.parametrize(
    "child_text,child_op,parent_op,expected",
    [
        # Atom (empty child_op) is never wrapped, regardless of parent.
        ("a = 1", "", "and", "a = 1"),
        ("a = 1", "", "or", "a = 1"),
        ("a = 1", "", "", "a = 1"),
        # Same-op child under same-op parent: no wrap.
        ("a AND b", "and", "and", "a AND b"),
        ("a OR b", "or", "or", "a OR b"),
        # Higher-precedence child under lower-precedence parent: no wrap.
        # (AND child under OR parent — AND already binds tighter than OR.)
        ("a AND b", "and", "or", "a AND b"),
        # Lower-precedence child under higher-precedence parent: WRAP.
        # (OR child under AND parent — parens required to preserve grouping.)
        ("a OR b", "or", "and", "(a OR b)"),
        # Outermost call has parent_op == "" → precedence 0 → nothing wraps.
        ("a AND b", "and", "", "a AND b"),
        ("a OR b", "or", "", "a OR b"),
        # Unknown non-empty child op defaults to precedence 0, so a
        # higher-precedence parent (and=2) triggers wrap — conservative
        # default for any future operator the helper doesn't know about.
        ("x", "xor", "and", "(x)"),
        # Unknown parent op defaults to precedence 0, so a known child
        # (and=2) is never strictly-less → no wrap.
        ("a AND b", "and", "xor", "a AND b"),
    ],
)
def test_wrap_child(child_text, child_op, parent_op, expected):
    assert wrap_child(child_text, child_op, parent_op) == expected
