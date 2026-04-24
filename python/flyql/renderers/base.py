"""Renderer ABC and ArgSpec re-export.

Renderers describe post-alias display metadata. They are parsed and
validated by flyql but never affect SQL or matcher output — interpretation
is entirely the dev's responsibility.
"""

from abc import ABC, abstractmethod
from typing import Any, ClassVar, Dict, List, Tuple

from flyql.transformers.base import ArgSpec

__all__ = ["ArgSpec", "Renderer"]


class Renderer(ABC):
    arg_schema: ClassVar[Tuple[ArgSpec, ...]] = ()
    description: ClassVar[str] = ""

    @property
    @abstractmethod
    def name(self) -> str: ...

    @property
    def metadata(self) -> Dict[str, Any]:
        return {}

    def diagnose(self, arguments: List[Any], parsed_column: Any) -> List[Any]:
        return []
