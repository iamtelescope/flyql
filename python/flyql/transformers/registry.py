from typing import Dict, List, Optional

from flyql.core.exceptions import FlyqlError
from flyql.flyql_type import Type

from .base import Transformer
from .builtins import (
    LenTransformer,
    LowerTransformer,
    SplitTransformer,
    UpperTransformer,
)


class TransformerRegistry:
    def __init__(self) -> None:
        self._transformers: Dict[str, Transformer] = {}

    def get(self, name: str) -> Optional[Transformer]:
        return self._transformers.get(name)

    def register(self, transformer: Transformer) -> None:
        if transformer.name in self._transformers:
            raise ValueError(f"Transformer '{transformer.name}' is already registered")
        if transformer.output_type is Type.Any:
            raise FlyqlError(
                f"transformer {transformer.name!r}: output_type cannot be Type.Any"
            )
        for spec in transformer.arg_schema:
            if spec.type is Type.Any:
                raise FlyqlError(
                    f"transformer {transformer.name!r}: ArgSpec.type cannot be Type.Any"
                )
        self._transformers[transformer.name] = transformer

    def names(self) -> List[str]:
        return list(self._transformers.keys())


def default_registry() -> TransformerRegistry:
    registry = TransformerRegistry()
    registry.register(UpperTransformer())
    registry.register(LowerTransformer())
    registry.register(LenTransformer())
    registry.register(SplitTransformer())
    return registry
