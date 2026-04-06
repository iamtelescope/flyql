"""AST validator producing positioned diagnostics for editor integration.

Two unrelated ``Transformer`` types coexist in this project:

- ``flyql.core.key.Transformer`` — AST dataclass (parsed transformer invocation
  with ranges). Accessed via ``expression.key.transformers`` and never imported
  directly in this module.
- ``flyql.transformers.base.Transformer`` — ABC (functional transformer with
  ``.apply()``, ``.sql()``, ``arg_schema``). Imported here as ``TransformerDef``.

Range semantics per diagnostic code (highlight the smallest span the user must
edit to fix the error):

    unknown_column       -> key.segment_ranges[0]
    unknown_transformer  -> transformer.name_range
    arg_count            -> transformer.range (full name(args...) span)
    arg_type             -> transformer.argument_ranges[j]
    chain_type           -> transformer.name_range
    invalid_ast          -> Range(0, 0)
"""

from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Optional

from flyql.core.column import Column, normalized_to_transformer_type
from flyql.core.expression import Expression
from flyql.core.range import Range
from flyql.core.tree import Node
from flyql.types import ValueType
from flyql.transformers.base import TransformerType
from flyql.transformers.base import Transformer as TransformerDef
from flyql.transformers.registry import TransformerRegistry, default_registry

DiagnosticSeverity = Literal["error", "warning"]

CODE_UNKNOWN_COLUMN = "unknown_column"
CODE_UNKNOWN_TRANSFORMER = "unknown_transformer"
CODE_ARG_COUNT = "arg_count"
CODE_ARG_TYPE = "arg_type"
CODE_CHAIN_TYPE = "chain_type"
CODE_INVALID_AST = "invalid_ast"
CODE_UNKNOWN_COLUMN_VALUE = "unknown_column_value"


@dataclass(frozen=True)
class Diagnostic:
    """A positioned diagnostic produced by diagnose().

    Range semantics per code (highlight the smallest span the user must edit):
      unknown_column       -> key.segment_ranges[0]
      unknown_transformer  -> transformer.name_range
      arg_count            -> transformer.range (full name(args...) span)
      arg_type             -> transformer.argument_ranges[j]
      chain_type           -> transformer.name_range
      invalid_ast          -> Range(0, 0)
    """

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
]


def diagnose(
    ast: Optional[Node],
    columns: List[Column],
    registry: Optional[TransformerRegistry] = None,
) -> List[Diagnostic]:
    if ast is None:
        return []
    if registry is None:
        registry = default_registry()
    # reversed() + dict comprehension: first-wins on duplicate lowercased match_names
    columns_by_name: Dict[str, Column] = {
        c.match_name.lower(): c for c in reversed(columns)
    }
    return _walk(ast, columns_by_name, registry)


def _walk(
    node: Node,
    columns_by_name: Dict[str, Column],
    registry: TransformerRegistry,
) -> List[Diagnostic]:
    if node.expression is not None:
        return _diagnose_expression(node.expression, columns_by_name, registry)
    diags: List[Diagnostic] = []
    if node.left is not None:
        diags.extend(_walk(node.left, columns_by_name, registry))
    if node.right is not None:
        diags.extend(_walk(node.right, columns_by_name, registry))
    return diags


def _diagnose_expression(
    expression: Expression,
    columns_by_name: Dict[str, Column],
    registry: TransformerRegistry,
) -> List[Diagnostic]:
    diags: List[Diagnostic] = []

    # F15 guard: missing source ranges
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

    base_name = expression.key.segments[0]
    column = columns_by_name.get(base_name.lower())

    if column is None:
        diags.append(
            Diagnostic(
                range=expression.key.segment_ranges[0],
                code=CODE_UNKNOWN_COLUMN,
                severity="error",
                message=f"column '{base_name}' is not defined",
            )
        )
        prev_output_type: Optional[TransformerType] = None
    else:
        prev_output_type = normalized_to_transformer_type(column.normalized_type)

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

        # Arity check
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

        # Per-argument type check
        for j, arg in enumerate(transformer.arguments):
            if j >= len(t.arg_schema):
                break  # already flagged by arity
            expected = t.arg_schema[j].type
            actual = _python_to_transformer_type(arg)
            if actual is None:
                continue
            if actual == expected:
                continue
            # int widens to float
            if actual == TransformerType.INT and expected == TransformerType.FLOAT:
                continue
            diags.append(
                Diagnostic(
                    range=transformer.argument_ranges[j],
                    code=CODE_ARG_TYPE,
                    severity="error",
                    message=f"argument {j + 1} of {transformer.name}: expected {expected.value}, got {actual.value}",
                )
            )

        # Chain type check
        if prev_output_type is not None and prev_output_type != t.input_type:
            diags.append(
                Diagnostic(
                    range=transformer.name_range,
                    code=CODE_CHAIN_TYPE,
                    severity="error",
                    message=f"{transformer.name} expects {t.input_type.value} input, got {prev_output_type.value}",
                )
            )

        # Cascade: always use this transformer's output_type
        prev_output_type = t.output_type

    # COLUMN value validation
    if (
        expression.value_type == ValueType.COLUMN
        and isinstance(expression.value, str)
        and expression.value != ""
    ):
        if expression.value.lower() not in columns_by_name:
            if expression.value_range is not None:
                diags.append(
                    Diagnostic(
                        range=expression.value_range,
                        code=CODE_UNKNOWN_COLUMN_VALUE,
                        severity="warning",
                        message=f"column '{expression.value}' is not defined",
                    )
                )

    # IN-list COLUMN value validation
    if expression.values_types is not None and expression.values is not None:
        for i, vt in enumerate(expression.values_types):
            if vt == ValueType.COLUMN and isinstance(expression.values[i], str):
                val: str = expression.values[i]
                if val.lower() not in columns_by_name:
                    if expression.value_ranges is not None and i < len(
                        expression.value_ranges
                    ):
                        diags.append(
                            Diagnostic(
                                range=expression.value_ranges[i],
                                code=CODE_UNKNOWN_COLUMN_VALUE,
                                severity="warning",
                                message=f"column '{val}' is not defined",
                            )
                        )

    return diags


def _python_to_transformer_type(v: Any) -> Optional[TransformerType]:
    # bool check MUST precede int check (bool is subclass of int in Python)
    if isinstance(v, bool):
        return TransformerType.BOOL
    if isinstance(v, int):
        return TransformerType.INT
    if isinstance(v, float):
        return TransformerType.FLOAT
    if isinstance(v, str):
        return TransformerType.STRING
    return None
