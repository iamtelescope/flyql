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
    CODE_RENDERER_ARG_COUNT,
    CODE_RENDERER_ARG_TYPE,
    CODE_UNKNOWN_COLUMN,
    CODE_UNKNOWN_RENDERER,
    CODE_UNKNOWN_TRANSFORMER,
    Diagnostic,
    make_diag,
)
from flyql.flyql_type import Type, type_permits_unknown_children
from flyql.renderers.registry import (
    RendererRegistry,
    default_registry as default_renderer_registry,
)
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
    renderer_registry: Optional[RendererRegistry] = None,
) -> List[Diagnostic]:
    if not parsed_columns:
        return []
    if registry is None:
        registry = default_registry()
    if renderer_registry is None:
        renderer_registry = default_renderer_registry()

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
                fail_seg, fail_range, parent = _find_failing_segment(
                    col, schema, col.name_range, segments
                )
                if parent is not None and type_permits_unknown_children(parent.type):
                    # Permissive parent (JSON, JSONString, Map, Unknown) — undeclared
                    # nested key access is allowed; suppress diag and treat downstream
                    # input type as unknown.
                    prev_output_type = None
                else:
                    diags.append(
                        make_diag(
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
                        make_diag(
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
                        make_diag(
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
                        make_diag(
                            range=arg_ranges[j],
                            message=f"argument {j + 1} of {transformer['name']}: expected {expected}, got {actual}",
                            severity="error",
                            code=CODE_ARG_TYPE,
                        )
                    )

            if (
                prev_output_type is not None
                and t.input_type is not Type.Any
                and prev_output_type != t.input_type
            ):
                if name_range is not None:
                    diags.append(
                        make_diag(
                            range=name_range,
                            message=f"{transformer['name']} expects {t.input_type} input, got {prev_output_type}",
                            severity="error",
                            code=CODE_CHAIN_TYPE,
                        )
                    )

            prev_output_type = t.output_type

        renderer_ranges = col.renderer_ranges or []
        for ri, renderer in enumerate(col.renderers):
            r_ranges = renderer_ranges[ri] if ri < len(renderer_ranges) else {}
            r_name_range = r_ranges.get("name_range")
            r_arg_ranges = r_ranges.get("argument_ranges", [])
            r = renderer_registry.get(renderer["name"])

            if r is None:
                if r_name_range is not None:
                    diags.append(
                        make_diag(
                            range=r_name_range,
                            message=f"unknown renderer: '{renderer['name']}'",
                            severity="error",
                            code=CODE_UNKNOWN_RENDERER,
                        )
                    )
                continue

            required_count = sum(
                1 for s in r.arg_schema if getattr(s, "required", True)
            )
            max_count = len(r.arg_schema)
            got = len(renderer["arguments"])
            if got < required_count or got > max_count:
                if required_count == max_count:
                    expect_str = f"{required_count} arguments"
                else:
                    expect_str = f"{required_count}..{max_count} arguments"
                if r_name_range is not None:
                    full_range = r_name_range
                    if r_arg_ranges:
                        full_range = Range(
                            r_name_range.start,
                            r_arg_ranges[-1].end + 1,
                        )
                    diags.append(
                        make_diag(
                            range=full_range,
                            message=f"{renderer['name']} expects {expect_str}, got {got}",
                            severity="error",
                            code=CODE_RENDERER_ARG_COUNT,
                        )
                    )

            for j, arg in enumerate(renderer["arguments"]):
                if j >= len(r.arg_schema):
                    break
                expected = r.arg_schema[j].type
                actual = _python_to_flyql_type(arg)
                if actual is None:
                    continue
                if actual == expected:
                    continue
                if actual == Type.Int and expected == Type.Float:
                    continue
                if j < len(r_arg_ranges):
                    diags.append(
                        make_diag(
                            range=r_arg_ranges[j],
                            message=f"argument {j + 1} of {renderer['name']}: expected {expected}, got {actual}",
                            severity="error",
                            code=CODE_RENDERER_ARG_TYPE,
                        )
                    )

            hook_diags = r.diagnose(renderer["arguments"], col)
            if hook_diags:
                diags.extend(hook_diags)

        chain_hook = renderer_registry.get_diagnose()
        if chain_hook is not None and col.renderers:
            chain_diags = chain_hook(col, col.renderers)
            if chain_diags:
                diags.extend(chain_diags)

    return diags


def _find_failing_segment(
    col: ParsedColumn,
    schema: ColumnSchema,
    name_range: Range,
    segments: Optional[List[str]] = None,
) -> tuple[str, Range, Optional[Column]]:
    """Find the first unresolvable segment and its source range.

    Also returns the deepest *resolved* parent column (or None when the
    failing segment is the root). Callers inspect ``parent.type`` against
    :func:`type_permits_unknown_children` to decide whether to suppress
    the unknown-column diagnostic for paths under JSON-family parents.
    """
    segs = segments if segments is not None else col.segments
    current: Optional[Column] = None
    previous: Optional[Column] = None
    for i, seg in enumerate(segs):
        # TD-10 strict pattern: capture previous BEFORE any reassignment of
        # current. Both the lookup-hit branch and the no-children else
        # branch reset current — without capturing previous as the FIRST
        # statement of the loop body, the permissive-parent check at the
        # call site would see None for any failure where the parent has
        # no children at all.
        previous = current
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
            return seg, Range(offset, offset + len(seg)), previous
    return segs[0], Range(name_range.start, name_range.start + len(segs[0])), None
