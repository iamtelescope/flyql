"""Columns validator producing positioned diagnostics.

Validates parsed column expressions against a column schema and
transformer registry, returning Diagnostic objects with source ranges.
"""

from typing import Any, List, Optional

from flyql.core.column import Column, ColumnSchema
from flyql.core.range import Range
from flyql.core.validator import (
    CODE_ARG_COUNT,
    CODE_ARG_TYPE,
    CODE_CHAIN_TYPE,
    CODE_UNKNOWN_COLUMN,
    CODE_UNKNOWN_TRANSFORMER,
    Diagnostic,
)
from flyql.flyql_type import Type
from flyql.transformers.registry import TransformerRegistry, default_registry

from .column import ParsedColumn


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


def diagnose(
    parsed_columns: List[ParsedColumn],
    schema: ColumnSchema,
    registry: Optional[TransformerRegistry] = None,
) -> List[Diagnostic]:
    if not parsed_columns:
        return []
    if registry is None:
        registry = default_registry()

    diags: List[Diagnostic] = []

    for col in parsed_columns:
        segments = col.segments
        if segments and segments[-1] == "":
            segments = segments[:-1]
        if not segments:
            continue
        resolved = schema.resolve(segments)

        prev_output_type: Optional[Type] = None
        if resolved is None:
            if col.name_range is not None:
                fail_seg, fail_range = _find_failing_segment(
                    col, schema, col.name_range, segments
                )
                diags.append(
                    Diagnostic(
                        range=fail_range,
                        message=f"column '{fail_seg}' is not defined",
                        severity="error",
                        code=CODE_UNKNOWN_COLUMN,
                    )
                )
        elif resolved.type != Type.Unknown:
            prev_output_type = resolved.type

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

            for j, arg in enumerate(transformer["arguments"]):
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
                if j < len(arg_ranges):
                    diags.append(
                        Diagnostic(
                            range=arg_ranges[j],
                            message=f"argument {j + 1} of {transformer['name']}: expected {expected}, got {actual}",
                            severity="error",
                            code=CODE_ARG_TYPE,
                        )
                    )

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


def _find_failing_segment(
    col: ParsedColumn,
    schema: ColumnSchema,
    name_range: Range,
    segments: Optional[List[str]] = None,
) -> tuple[str, Range]:
    """Find the first unresolvable segment and its source range."""
    segs = segments if segments is not None else col.segments
    current: Optional[Column] = None
    for i, seg in enumerate(segs):
        if i == 0:
            current = schema.get(seg)
        elif current is not None and current.children is not None:
            current = current.children.get(seg.lower())
        else:
            current = None
        if current is None:
            offset = name_range.start
            for j in range(i):
                offset += len(segs[j]) + 1  # +1 for dot
            return seg, Range(offset, offset + len(seg))
    return segs[0], Range(name_range.start, name_range.start + len(segs[0]))
