"""Transformer ABC and ArgSpec — uses :class:`flyql.flyql_type.Type` for
type-checking transformer chains."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, ClassVar, List, Optional, Tuple

from flyql.flyql_type import Type


@dataclass(frozen=True)
class ArgSpec:
    type: Type
    required: bool = True


class Transformer(ABC):
    arg_schema: ClassVar[Tuple[ArgSpec, ...]] = ()
    description: ClassVar[str] = ""

    @property
    @abstractmethod
    def name(self) -> str: ...

    @property
    @abstractmethod
    def input_type(self) -> Type: ...

    @property
    @abstractmethod
    def output_type(self) -> Type: ...

    @abstractmethod
    def sql(
        self, dialect: str, column_ref: str, args: Optional[List[Any]] = None
    ) -> str: ...

    @abstractmethod
    def apply(self, value: Any, args: Optional[List[Any]] = None) -> Any: ...
