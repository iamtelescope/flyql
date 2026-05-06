"""AST validator producing positioned diagnostics for editor integration.

Two unrelated transformer-like types coexist in this project after the
``flyql.core.key.Transformer`` → ``KeyTransformer`` rename:

- ``flyql.core.key.KeyTransformer`` — AST dataclass (parsed transformer
  invocation with ranges). Accessed via ``expression.key.transformers`` and
  never imported directly in this module.
- ``flyql.transformers.base.Transformer`` — ABC (functional transformer with
  ``.apply()``, ``.sql()``, ``arg_schema``). Imported here as ``TransformerDef``
  purely for stylistic clarity — the former collision with the AST class is
  resolved.

Range semantics per diagnostic code (highlight the smallest span the user must
edit to fix the error):

    unknown_column       -> key.segment_ranges[0]
    unknown_transformer  -> transformer.name_range
    arg_count            -> transformer.range (full name(args...) span)
    arg_type             -> transformer.argument_ranges[j]
    chain_type           -> transformer.name_range
    invalid_ast          -> Range(0, 0)
"""

import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, List, Literal, Optional, Tuple

from flyql.core.column import ColumnSchema
from flyql.core.expression import Expression
from flyql.core.range import Range
from flyql.core.tree import Node
from flyql.flyql_type import Type, type_permits_unknown_children
from flyql.literal import LiteralKind
from flyql.transformers.base import Transformer as TransformerDef
from flyql.transformers.registry import TransformerRegistry, default_registry

DiagnosticSeverity = Literal["error", "warning"]

from flyql.errors_generated import (
    CODE_ARG_COUNT,
    CODE_ARG_TYPE,
    CODE_CHAIN_TYPE,
    CODE_INVALID_AST,
    CODE_INVALID_COLUMN_VALUE,
    CODE_INVALID_DATETIME_LITERAL,
    CODE_RENDERER_ARG_COUNT,
    CODE_RENDERER_ARG_TYPE,
    CODE_UNKNOWN_COLUMN,
    CODE_UNKNOWN_COLUMN_VALUE,
    CODE_UNKNOWN_RENDERER,
    CODE_UNKNOWN_TRANSFORMER,
    VALIDATOR_REGISTRY,
    ErrorEntry,
)

_VALID_COLUMN_NAME_RE = re.compile(r"^[a-zA-Z0-9_.:/@|\-]+$")

# Lenient iso8601 matcher — same family accepted by the matcher's
# _parse_iso_string_to_ms helper. Accepts T or space separator, optional
# sub-second, optional Z/offset suffix, or a pure date form.
_ISO8601_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_ISO8601_FULL_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$"
)


def _is_valid_iso8601(s: str) -> bool:
    """Shape AND calendar validity check.

    Rejects inputs that match the shape regex but represent impossible
    calendar values (e.g. ``'2026-13-45'``, ``'2026-02-31'``) — the
    matcher will reject these at coerce time, so the validator warns now.
    """
    if not s:
        return False
    if _ISO8601_DATE_RE.match(s):
        try:
            date.fromisoformat(s)
            return True
        except ValueError:
            return False
    if _ISO8601_FULL_RE.match(s):
        # Normalise Z → +00:00 and space → T for fromisoformat (3.10 strict).
        candidate = s
        if candidate.endswith("Z"):
            candidate = candidate[:-1] + "+00:00"
        if " " in candidate:
            candidate = candidate.replace(" ", "T", 1)
        try:
            datetime.fromisoformat(candidate)
            return True
        except ValueError:
            return False
    return False


@dataclass(frozen=True)
class Diagnostic:
    range: Range
    message: str
    severity: DiagnosticSeverity
    code: str
    error: Optional[ErrorEntry] = None


def make_diag(
    range: Range,
    code: str,
    severity: DiagnosticSeverity,
    message: str,
) -> Diagnostic:
    # Drift between code constants and registry is caught at build time by
    # the parity test; on miss we still return a Diagnostic (error=None).
    entry = VALIDATOR_REGISTRY.get(code)
    return Diagnostic(
        range=range, code=code, severity=severity, message=message, error=entry
    )


__all__ = [
    "Diagnostic",
    "DiagnosticSeverity",
    "ErrorEntry",
    "diagnose",
    "make_diag",
    "CODE_UNKNOWN_COLUMN",
    "CODE_UNKNOWN_TRANSFORMER",
    "CODE_ARG_COUNT",
    "CODE_ARG_TYPE",
    "CODE_CHAIN_TYPE",
    "CODE_INVALID_AST",
    "CODE_UNKNOWN_COLUMN_VALUE",
    "CODE_INVALID_COLUMN_VALUE",
    "CODE_INVALID_DATETIME_LITERAL",
    "CODE_UNKNOWN_RENDERER",
    "CODE_RENDERER_ARG_COUNT",
    "CODE_RENDERER_ARG_TYPE",
]


def diagnose(
    ast: Optional[Node],
    schema: ColumnSchema,
    registry: Optional[TransformerRegistry] = None,
) -> List[Diagnostic]:
    if ast is None:
        return []
    if registry is None:
        registry = default_registry()
    return _walk(ast, schema, registry)


def _walk(
    node: Node,
    schema: ColumnSchema,
    registry: TransformerRegistry,
) -> List[Diagnostic]:
    if node.expression is not None:
        return _diagnose_expression(node.expression, schema, registry)
    diags: List[Diagnostic] = []
    if node.left is not None:
        diags.extend(_walk(node.left, schema, registry))
    if node.right is not None:
        diags.extend(_walk(node.right, schema, registry))
    return diags


def _diagnose_expression(
    expression: Expression,
    schema: ColumnSchema,
    registry: TransformerRegistry,
) -> List[Diagnostic]:
    diags: List[Diagnostic] = []

    if (
        not expression.key.segments
        or not expression.key.segment_ranges
        or len(expression.key.segment_ranges) < 1
    ):
        diags.append(
            make_diag(
                range=Range(0, 0),
                code=CODE_INVALID_AST,
                severity="error",
                message="AST missing source ranges \u2014 diagnose() requires a parser-produced AST",
            )
        )
        return diags

    prev_output_type: Optional[Type] = None
    col = schema.get(expression.key.segments[0])
    if col is None:
        diags.append(
            make_diag(
                range=expression.key.segment_ranges[0],
                code=CODE_UNKNOWN_COLUMN,
                severity="error",
                message=f"column '{expression.key.segments[0]}' is not defined",
            )
        )
    else:
        for i in range(1, len(expression.key.segments)):
            seg = expression.key.segments[i]
            if seg == "":
                break  # trailing dot — user still typing
            if col.children is None:
                if type_permits_unknown_children(col.type):
                    col = None
                    break
                diags.append(
                    make_diag(
                        range=expression.key.segment_ranges[i],
                        code=CODE_UNKNOWN_COLUMN,
                        severity="error",
                        message=f"column '{seg}' is not defined",
                    )
                )
                col = None
                break
            child = col.children.get(seg.lower())
            if child is None:
                if type_permits_unknown_children(col.type):
                    col = None
                    break
                diags.append(
                    make_diag(
                        range=expression.key.segment_ranges[i],
                        code=CODE_UNKNOWN_COLUMN,
                        severity="error",
                        message=f"column '{seg}' is not defined",
                    )
                )
                col = None
                break
            col = child
        if col is not None and col.type != Type.Unknown:
            prev_output_type = col.type

    for transformer in expression.key.transformers:
        t: Optional[TransformerDef] = registry.get(transformer.name)

        if t is None:
            diags.append(
                make_diag(
                    range=transformer.name_range,
                    code=CODE_UNKNOWN_TRANSFORMER,
                    severity="error",
                    message=f"unknown transformer: '{transformer.name}'",
                )
            )
            prev_output_type = None
            continue

        required_count = sum(1 for s in t.arg_schema if s.required)
        max_count = len(t.arg_schema)
        got = len(transformer.arguments)
        if got < required_count or got > max_count:
            if required_count == max_count:
                expect_str = f"{required_count} arguments"
            else:
                expect_str = f"{required_count}..{max_count} arguments"
            diags.append(
                make_diag(
                    range=transformer.range,
                    code=CODE_ARG_COUNT,
                    severity="error",
                    message=f"{transformer.name} expects {expect_str}, got {got}",
                )
            )

        for j, arg in enumerate(transformer.arguments):
            if j >= len(t.arg_schema):
                break
            expected = t.arg_schema[j].type
            actual = _python_to_flyql_type(arg)
            if actual is None:
                continue
            if actual == expected:
                continue
            if actual == Type.Int and expected == Type.Float:
                continue
            diags.append(
                make_diag(
                    range=transformer.argument_ranges[j],
                    code=CODE_ARG_TYPE,
                    severity="error",
                    message=f"argument {j + 1} of {transformer.name}: expected {expected.value}, got {actual.value}",
                )
            )

        if (
            prev_output_type is not None
            and t.input_type is not Type.Any
            and prev_output_type != t.input_type
        ):
            diags.append(
                make_diag(
                    range=transformer.name_range,
                    code=CODE_CHAIN_TYPE,
                    severity="error",
                    message=f"{transformer.name} expects {t.input_type.value} input, got {prev_output_type.value}",
                )
            )

        prev_output_type = t.output_type

    emitted_ranges: set = set()

    if (
        expression.value_type == LiteralKind.COLUMN
        and isinstance(expression.value, str)
        and expression.value != ""
    ):
        if not _VALID_COLUMN_NAME_RE.match(expression.value):
            if expression.value_range is not None:
                diags.append(
                    make_diag(
                        range=expression.value_range,
                        code=CODE_INVALID_COLUMN_VALUE,
                        severity="error",
                        message=f"invalid character in column name '{expression.value}'",
                    )
                )
                emitted_ranges.add(
                    (expression.value_range.start, expression.value_range.end)
                )
        else:
            resolved, parent_permissive = _walk_and_check_permissive(
                schema, expression.value.split(".")
            )
            if (
                not resolved
                and not parent_permissive
                and expression.value_range is not None
            ):
                diags.append(
                    make_diag(
                        range=expression.value_range,
                        code=CODE_UNKNOWN_COLUMN_VALUE,
                        severity="error",
                        message=f"column '{expression.value}' is not defined",
                    )
                )
                emitted_ranges.add(
                    (expression.value_range.start, expression.value_range.end)
                )

    if expression.values_types is not None and expression.values is not None:
        for i, vt in enumerate(expression.values_types):
            if vt == LiteralKind.COLUMN and isinstance(expression.values[i], str):
                val: str = expression.values[i]
                if not _VALID_COLUMN_NAME_RE.match(val):
                    if expression.value_ranges is not None and i < len(
                        expression.value_ranges
                    ):
                        diags.append(
                            make_diag(
                                range=expression.value_ranges[i],
                                code=CODE_INVALID_COLUMN_VALUE,
                                severity="error",
                                message=f"invalid character in column name '{val}'",
                            )
                        )
                        emitted_ranges.add(
                            (
                                expression.value_ranges[i].start,
                                expression.value_ranges[i].end,
                            )
                        )
                else:
                    resolved, parent_permissive = _walk_and_check_permissive(
                        schema, val.split(".")
                    )
                    if (
                        not resolved
                        and not parent_permissive
                        and expression.value_ranges is not None
                        and i < len(expression.value_ranges)
                    ):
                        diags.append(
                            make_diag(
                                range=expression.value_ranges[i],
                                code=CODE_UNKNOWN_COLUMN_VALUE,
                                severity="error",
                                message=f"column '{val}' is not defined",
                            )
                        )
                        emitted_ranges.add(
                            (
                                expression.value_ranges[i].start,
                                expression.value_ranges[i].end,
                            )
                        )

    # Decision 16: invalid_datetime_literal emits only when no earlier
    # diagnostic fired for the same range. Date/DateTime column trigger.
    if col is not None and col.type in (Type.Date, Type.DateTime):
        if (
            expression.value_type == LiteralKind.STRING
            and isinstance(expression.value, str)
            and expression.value_range is not None
        ):
            key = (expression.value_range.start, expression.value_range.end)
            if key not in emitted_ranges and not _is_valid_iso8601(expression.value):
                diags.append(
                    make_diag(
                        range=expression.value_range,
                        code=CODE_INVALID_DATETIME_LITERAL,
                        severity="warning",
                        message=f"invalid iso8601 datetime literal '{expression.value}' "
                        f"for {col.type.value} column '{col.name}'",
                    )
                )
                emitted_ranges.add(key)
        if (
            expression.values is not None
            and expression.values_types is not None
            and expression.value_ranges is not None
        ):
            for i, vt in enumerate(expression.values_types):
                if vt != LiteralKind.STRING:
                    continue
                if i >= len(expression.values) or i >= len(expression.value_ranges):
                    continue
                v = expression.values[i]
                if not isinstance(v, str):
                    continue
                r = expression.value_ranges[i]
                key = (r.start, r.end)
                if key in emitted_ranges:
                    continue
                if not _is_valid_iso8601(v):
                    diags.append(
                        make_diag(
                            range=r,
                            code=CODE_INVALID_DATETIME_LITERAL,
                            severity="warning",
                            message=f"invalid iso8601 datetime literal '{v}' "
                            f"for {col.type.value} column '{col.name}'",
                        )
                    )
                    emitted_ranges.add(key)

    return diags


def _walk_and_check_permissive(
    schema: ColumnSchema, segments: List[str]
) -> Tuple[bool, bool]:
    """Walk a dotted path and report (resolved, parent_permissive).

    On full resolution, ``parent_permissive`` is False. On failure mid-walk,
    ``parent_permissive`` is True iff the deepest resolved parent is a
    JSON-family type (per :func:`type_permits_unknown_children`); callers
    use this to suppress unknown-column diagnostics for paths under
    semantically dynamic parents.
    """
    if not segments:
        return False, False
    col = schema.get(segments[0])
    if col is None:
        return False, False
    for i in range(1, len(segments)):
        if col.children is None:
            return False, type_permits_unknown_children(col.type)
        child = col.children.get(segments[i].lower())
        if child is None:
            return False, type_permits_unknown_children(col.type)
        col = child
    return True, False


def _python_to_flyql_type(v: Any) -> Optional[Type]:
    # bool check MUST precede int check (bool is subclass of int in Python)
    if isinstance(v, bool):
        return Type.Bool
    if isinstance(v, int):
        return Type.Int
    if isinstance(v, float):
        return Type.Float
    if isinstance(v, str):
        return Type.String
    return None
