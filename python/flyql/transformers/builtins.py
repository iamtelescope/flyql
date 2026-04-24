from typing import Any, ClassVar, List, Optional, Tuple

from flyql.flyql_type import Type

from .base import ArgSpec, Transformer


class UpperTransformer(Transformer):
    description: ClassVar[str] = "Convert the string to uppercase."

    @property
    def name(self) -> str:
        return "upper"

    @property
    def input_type(self) -> Type:
        return Type.String

    @property
    def output_type(self) -> Type:
        return Type.String

    def sql(
        self, dialect: str, column_ref: str, args: Optional[List[Any]] = None
    ) -> str:
        if dialect == "clickhouse":
            return f"upper({column_ref})"
        return f"UPPER({column_ref})"

    def apply(self, value: Any, args: Optional[List[Any]] = None) -> Any:
        return str(value).upper()


class LowerTransformer(Transformer):
    description: ClassVar[str] = "Convert the string to lowercase."

    @property
    def name(self) -> str:
        return "lower"

    @property
    def input_type(self) -> Type:
        return Type.String

    @property
    def output_type(self) -> Type:
        return Type.String

    def sql(
        self, dialect: str, column_ref: str, args: Optional[List[Any]] = None
    ) -> str:
        if dialect == "clickhouse":
            return f"lower({column_ref})"
        return f"LOWER({column_ref})"

    def apply(self, value: Any, args: Optional[List[Any]] = None) -> Any:
        return str(value).lower()


class LenTransformer(Transformer):
    description: ClassVar[str] = "Return the length of the string."

    @property
    def name(self) -> str:
        return "len"

    @property
    def input_type(self) -> Type:
        return Type.String

    @property
    def output_type(self) -> Type:
        return Type.Int

    def sql(
        self, dialect: str, column_ref: str, args: Optional[List[Any]] = None
    ) -> str:
        if dialect == "clickhouse":
            return f"length({column_ref})"
        return f"LENGTH({column_ref})"

    def apply(self, value: Any, args: Optional[List[Any]] = None) -> Any:
        return len(str(value))


class SplitTransformer(Transformer):
    arg_schema: ClassVar[Tuple[ArgSpec, ...]] = (
        ArgSpec(type=Type.String, required=False),
    )
    description: ClassVar[str] = "Split the string into an array by a delimiter."

    @property
    def name(self) -> str:
        return "split"

    @property
    def input_type(self) -> Type:
        return Type.String

    @property
    def output_type(self) -> Type:
        return Type.Array

    def sql(
        self, dialect: str, column_ref: str, args: Optional[List[Any]] = None
    ) -> str:
        a = args or []
        delimiter = a[0] if a else ","
        escaped = "'" + delimiter.replace("\\", "\\\\").replace("'", "\\'") + "'"
        if dialect == "clickhouse":
            if len(delimiter) == 1:
                return f"splitByChar({escaped}, {column_ref})"
            return f"splitByString({escaped}, {column_ref})"
        if dialect == "starrocks":
            return f"SPLIT({column_ref}, {escaped})"
        return f"STRING_TO_ARRAY({column_ref}, {escaped})"

    def apply(self, value: Any, args: Optional[List[Any]] = None) -> Any:
        a = args or []
        delimiter = a[0] if a else ","
        return str(value).split(delimiter)
