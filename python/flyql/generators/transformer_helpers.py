from typing import Any, Dict, List, Optional

from flyql.core.exceptions import FlyqlError
from flyql.transformers.base import TransformerType
from flyql.transformers.registry import TransformerRegistry, default_registry


def apply_transformer_sql(
    column_ref: str,
    transformers: List[Dict[str, Any]],
    dialect: str,
    registry: Optional[TransformerRegistry] = None,
) -> str:
    if not transformers:
        return column_ref

    if registry is None:
        registry = default_registry()

    result = column_ref
    for t_dict in transformers:
        transformer = registry.get(t_dict["name"])
        if transformer is None:
            raise FlyqlError(f"unknown transformer: {t_dict['name']}")
        result = transformer.sql(dialect, result, t_dict.get("arguments"))
    return result


def get_transformer_output_type(
    transformers: List[Dict[str, Any]],
    registry: Optional[TransformerRegistry] = None,
) -> Optional[TransformerType]:
    if not transformers:
        return None
    if registry is None:
        registry = default_registry()
    last = registry.get(transformers[-1]["name"])
    return last.output_type if last else None


def validate_transformer_chain(
    transformers: List[Dict[str, Any]],
    registry: Optional[TransformerRegistry] = None,
    base_type: TransformerType = TransformerType.STRING,
) -> None:
    if not transformers:
        return

    if registry is None:
        registry = default_registry()

    current_type = base_type
    for i, t_dict in enumerate(transformers):
        transformer = registry.get(t_dict["name"])
        if transformer is None:
            raise FlyqlError(f"unknown transformer: {t_dict['name']}")
        if transformer.input_type != current_type:
            raise FlyqlError(
                f"transformer chain type error: '{t_dict['name']}' at position {i} "
                f"requires {transformer.input_type.value} input, "
                f"but received {current_type.value}"
            )
        current_type = transformer.output_type
