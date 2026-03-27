from typing import Dict, List, Optional

from .base import Transformer
from .builtins import LenTransformer, LowerTransformer, UpperTransformer


class TransformerRegistry:
    def __init__(self) -> None:
        self._transformers: Dict[str, Transformer] = {}

    def get(self, name: str) -> Optional[Transformer]:
        return self._transformers.get(name)

    def register(self, transformer: Transformer) -> None:
        if transformer.name in self._transformers:
            raise ValueError(f"Transformer '{transformer.name}' is already registered")
        self._transformers[transformer.name] = transformer

    def names(self) -> List[str]:
        return list(self._transformers.keys())


def default_registry() -> TransformerRegistry:
    registry = TransformerRegistry()
    registry.register(UpperTransformer())
    registry.register(LowerTransformer())
    registry.register(LenTransformer())
    return registry
