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
from typing import Any, List, Literal, Optional

from flyql.core.column import ColumnSchema
from flyql.core.expression import Expression
from flyql.core.range import Range
from flyql.core.tree import Node
from flyql.flyql_type import Type
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
    CODE_RENDERER_ARG_COUNT,
    CODE_RENDERER_ARG_TYPE,
    CODE_UNKNOWN_COLUMN,
    CODE_UNKNOWN_COLUMN_VALUE,
    CODE_UNKNOWN_RENDERER,
    CODE_UNKNOWN_TRANSFORMER,
)

_VALID_COLUMN_NAME_RE = re.compile(r"^[a-zA-Z0-9_.:/@|\-]+$")


@dataclass(frozen=True)
class Diagnostic:
    range: Range
    message: str
    severity: DiagnosticSeverity
    code: str


__all__ = [
    "Diagnostic",
    "DiagnosticSeverity",
    "diagnose",
    "CODE_UNKNOWN_COLUMN",
    "CODE_UNKNOWN_TRANSFORMER",
    "CODE_ARG_COUNT",
    "CODE_ARG_TYPE",
    "CODE_CHAIN_TYPE",
    "CODE_INVALID_AST",
    "CODE_UNKNOWN_COLUMN_VALUE",
    "CODE_INVALID_COLUMN_VALUE",
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
            Diagnostic(
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
            Diagnostic(
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
                diags.append(
                    Diagnostic(
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
                diags.append(
                    Diagnostic(
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
                Diagnostic(
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
                Diagnostic(
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
                Diagnostic(
                    range=transformer.argument_ranges[j],
                    code=CODE_ARG_TYPE,
                    severity="error",
                    message=f"argument {j + 1} of {transformer.name}: expected {expected.value}, got {actual.value}",
                )
            )

        if prev_output_type is not None and prev_output_type != t.input_type:
            diags.append(
                Diagnostic(
                    range=transformer.name_range,
                    code=CODE_CHAIN_TYPE,
                    severity="error",
                    message=f"{transformer.name} expects {t.input_type.value} input, got {prev_output_type.value}",
                )
            )

        prev_output_type = t.output_type

    if (
        expression.value_type == LiteralKind.COLUMN
        and isinstance(expression.value, str)
        and expression.value != ""
    ):
        if not _VALID_COLUMN_NAME_RE.match(expression.value):
            if expression.value_range is not None:
                diags.append(
                    Diagnostic(
                        range=expression.value_range,
                        code=CODE_INVALID_COLUMN_VALUE,
                        severity="error",
                        message=f"invalid character in column name '{expression.value}'",
                    )
                )
        elif schema.resolve(expression.value.split(".")) is None:
            if expression.value_range is not None:
                diags.append(
                    Diagnostic(
                        range=expression.value_range,
                        code=CODE_UNKNOWN_COLUMN_VALUE,
                        severity="error",
                        message=f"column '{expression.value}' is not defined",
                    )
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
                            Diagnostic(
                                range=expression.value_ranges[i],
                                code=CODE_INVALID_COLUMN_VALUE,
                                severity="error",
                                message=f"invalid character in column name '{val}'",
                            )
                        )
                elif schema.resolve(val.split(".")) is None:
                    if expression.value_ranges is not None and i < len(
                        expression.value_ranges
                    ):
                        diags.append(
                            Diagnostic(
                                range=expression.value_ranges[i],
                                code=CODE_UNKNOWN_COLUMN_VALUE,
                                severity="error",
                                message=f"column '{val}' is not defined",
                            )
                        )

    return diags


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
