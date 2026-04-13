from typing import Any, Callable, Dict, List, Optional

from .base import Renderer

DiagnoseHook = Callable[[Any, List[Dict[str, Any]]], List[Any]]


class RendererRegistry:
    def __init__(self) -> None:
        self._renderers: Dict[str, Renderer] = {}
        self._diagnose: Optional[DiagnoseHook] = None

    def get(self, name: str) -> Optional[Renderer]:
        return self._renderers.get(name)

    def register(self, renderer: Renderer) -> None:
        if renderer.name in self._renderers:
            raise ValueError(f"Renderer '{renderer.name}' is already registered")
        self._renderers[renderer.name] = renderer

    def names(self) -> List[str]:
        return list(self._renderers.keys())

    def set_diagnose(self, fn: DiagnoseHook) -> None:
        self._diagnose = fn

    def get_diagnose(self) -> Optional[DiagnoseHook]:
        return self._diagnose


def default_registry() -> RendererRegistry:
    return RendererRegistry()
