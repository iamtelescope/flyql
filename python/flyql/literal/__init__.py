"""flyql.literal — parser AST literal-kind vocabulary.

The :class:`LiteralKind` enum records what kind of literal a parsed value
represents (number, null, column reference, function call, parameter,
etc.). This is unrelated to :class:`flyql.flyql_type.Type`, which is the
column/value semantic-type vocabulary; the two were merged in name
historically (both formerly called ``ValueType``-ish) but represent
different concepts. See the unify-column-type-system spec, Tech Decision #2.
"""

from .literal_kind import LiteralKind

__all__ = ["LiteralKind"]
