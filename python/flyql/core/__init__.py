from typing import Any

from flyql.core.parser import Parser, ParserError, ParseResult, parse
from flyql.core.tree import Node
from flyql.core.expression import Expression
from flyql.core.key import Key, KeyTransformer, parse_key
from flyql.core.column import Column, ColumnSchema
from flyql.core.constants import BoolOperator, Operator
from flyql.core.range import Range
from flyql.core.validator import Diagnostic, diagnose
from flyql.core.exceptions import FlyqlError, KeyParseError
from flyql.errors_generated import ERR_MAX_DEPTH_EXCEEDED

__all__ = [
    "parse",
    "Parser",
    "ParserError",
    "ParseResult",
    "Node",
    "Expression",
    "Key",
    "KeyTransformer",
    "parse_key",
    "Column",
    "ColumnSchema",
    "Operator",
    "BoolOperator",
    "Range",
    "Diagnostic",
    "diagnose",
    "FlyqlError",
    "KeyParseError",
    "ERR_MAX_DEPTH_EXCEEDED",
]


def __getattr__(name: str) -> Any:
    if name == "Transformer":
        import warnings

        warnings.warn(
            "flyql.core.Transformer is renamed to KeyTransformer and will be removed in 1.1.0. "
            "Update imports to `from flyql.core import KeyTransformer`.",
            DeprecationWarning,
            stacklevel=2,
        )
        from flyql.core.key import KeyTransformer as _KT

        return _KT
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
