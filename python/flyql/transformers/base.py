from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Any, ClassVar, List, Optional, Tuple


class TransformerType(Enum):
    STRING = "string"
    INT = "int"
    FLOAT = "float"
    BOOL = "bool"
    ARRAY = "array"


@dataclass(frozen=True)
class ArgSpec:
    type: TransformerType
    required: bool = True


class Transformer(ABC):
    arg_schema: ClassVar[Tuple[ArgSpec, ...]] = ()

    @property
    @abstractmethod
    def name(self) -> str: ...

    @property
    @abstractmethod
    def input_type(self) -> TransformerType: ...

    @property
    @abstractmethod
    def output_type(self) -> TransformerType: ...

    @abstractmethod
    def sql(
        self, dialect: str, column_ref: str, args: Optional[List[Any]] = None
    ) -> str: ...

    @abstractmethod
    def apply(self, value: Any, args: Optional[List[Any]] = None) -> Any: ...
