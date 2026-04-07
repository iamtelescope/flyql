"""Columns validator producing positioned diagnostics.

Validates parsed column expressions against a column schema and
transformer registry, returning Diagnostic objects with source ranges.
"""

from typing import Any, List, Optional

from flyql.core.column import Column, normalized_to_transformer_type
from flyql.core.range import Range
from flyql.core.validator import (
    CODE_ARG_COUNT,
    CODE_ARG_TYPE,
    CODE_CHAIN_TYPE,
    CODE_UNKNOWN_COLUMN,
    CODE_UNKNOWN_TRANSFORMER,
    Diagnostic,
)
from flyql.transformers.base import TransformerType
from flyql.transformers.registry import TransformerRegistry, default_registry

from .column import ParsedColumn


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


def diagnose(
    parsed_columns: List[ParsedColumn],
    columns: List[Column],
    registry: Optional[TransformerRegistry] = None,
) -> List[Diagnostic]:
    if not parsed_columns:
        return []
    if registry is None:
        registry = default_registry()

    columns_by_name: dict[str, Column] = {}
    for c in reversed(columns):
        columns_by_name[c.match_name.lower()] = c

    diags: List[Diagnostic] = []

    for col in parsed_columns:
        base_name = col.name.split(".")[0]
        matched_column = columns_by_name.get(base_name.lower())

        if matched_column is None:
            if col.name_range is not None:
                base_name_range = Range(
                    col.name_range.start,
                    col.name_range.start + len(base_name),
                )
                diags.append(
                    Diagnostic(
                        range=base_name_range,
                        message=f"column '{base_name}' is not defined",
                        severity="error",
                        code=CODE_UNKNOWN_COLUMN,
                    )
                )
            prev_output_type = None
        else:
            prev_output_type = normalized_to_transformer_type(
                matched_column.normalized_type
            )

        transformer_ranges = col.transformer_ranges or []

        for ti, transformer in enumerate(col.transformers):
            ranges = transformer_ranges[ti] if ti < len(transformer_ranges) else {}
            name_range = ranges.get("name_range")
            arg_ranges = ranges.get("argument_ranges", [])
            t = registry.get(transformer["name"])

            if t is None:
                if name_range is not None:
                    diags.append(
                        Diagnostic(
                            range=name_range,
                            message=f"unknown transformer: '{transformer['name']}'",
                            severity="error",
                            code=CODE_UNKNOWN_TRANSFORMER,
                        )
                    )
                prev_output_type = None
                continue

            # Arity check
            required_count = sum(
                1 for s in t.arg_schema if getattr(s, "required", True)
            )
            max_count = len(t.arg_schema)
            got = len(transformer["arguments"])
            if got < required_count or got > max_count:
                if required_count == max_count:
                    expect_str = f"{required_count} arguments"
                else:
                    expect_str = f"{required_count}..{max_count} arguments"
                if name_range is not None:
                    full_range = name_range
                    if arg_ranges:
                        full_range = Range(
                            name_range.start,
                            arg_ranges[-1].end + 1,
                        )
                    diags.append(
                        Diagnostic(
                            range=full_range,
                            message=f"{transformer['name']} expects {expect_str}, got {got}",
                            severity="error",
                            code=CODE_ARG_COUNT,
                        )
                    )

            # Per-argument type check
            for j, arg in enumerate(transformer["arguments"]):
                if j >= len(t.arg_schema):
                    break
                expected = t.arg_schema[j].type
                actual = _python_to_transformer_type(arg)
                if actual is None:
                    continue
                if actual == expected:
                    continue
                # int widens to float
                if actual == TransformerType.INT and expected == TransformerType.FLOAT:
                    continue
                if j < len(arg_ranges):
                    diags.append(
                        Diagnostic(
                            range=arg_ranges[j],
                            message=f"argument {j + 1} of {transformer['name']}: expected {expected}, got {actual}",
                            severity="error",
                            code=CODE_ARG_TYPE,
                        )
                    )

            # Chain type check
            if prev_output_type is not None and prev_output_type != t.input_type:
                if name_range is not None:
                    diags.append(
                        Diagnostic(
                            range=name_range,
                            message=f"{transformer['name']} expects {t.input_type} input, got {prev_output_type}",
                            severity="error",
                            code=CODE_CHAIN_TYPE,
                        )
                    )

            prev_output_type = t.output_type

    return diags
