from typing import List, Optional

from flyql.core.exceptions import FlyqlError
from flyql.core.key import Transformer as KeyTransformer
from flyql.flyql_type import Type
from flyql.transformers.registry import TransformerRegistry, default_registry


def apply_transformer_sql(
    column_ref: str,
    transformers: List[KeyTransformer],
    dialect: str,
    registry: Optional[TransformerRegistry] = None,
) -> str:
    if not transformers:
        return column_ref

    if registry is None:
        registry = default_registry()

    result = column_ref
    for t in transformers:
        transformer = registry.get(t.name)
        if transformer is None:
            raise FlyqlError(f"unknown transformer: {t.name}")
        schema = transformer.arg_schema
        required_count = sum(1 for s in schema if s.required)
        max_count = len(schema)
        got = len(t.arguments)
        if got < required_count or got > max_count:
            if required_count == max_count:
                raise FlyqlError(
                    f"{t.name} expects {required_count} arguments, got {got}"
                )
            raise FlyqlError(
                f"{t.name} expects {required_count}..{max_count} arguments, got {got}"
            )
        result = transformer.sql(dialect, result, t.arguments)
    return result


def get_transformer_output_type(
    transformers: List[KeyTransformer],
    registry: Optional[TransformerRegistry] = None,
) -> Optional[Type]:
    if not transformers:
        return None
    if registry is None:
        registry = default_registry()
    last = registry.get(transformers[-1].name)
    return last.output_type if last else None


def validate_transformer_chain(
    transformers: List[KeyTransformer],
    registry: Optional[TransformerRegistry] = None,
    base_type: Type = Type.String,
) -> None:
    if not transformers:
        return

    if registry is None:
        registry = default_registry()

    current_type = base_type
    for i, t in enumerate(transformers):
        transformer = registry.get(t.name)
        if transformer is None:
            raise FlyqlError(f"unknown transformer: {t.name}")
        if transformer.input_type != current_type:
            raise FlyqlError(
                f"transformer chain type error: '{t.name}' at position {i} "
                f"requires {transformer.input_type.value} input, "
                f"but received {current_type.value}"
            )
        current_type = transformer.output_type
