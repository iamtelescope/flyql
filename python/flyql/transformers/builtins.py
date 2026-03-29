from typing import Any, List, Optional

from .base import Transformer, TransformerType


class UpperTransformer(Transformer):
    @property
    def name(self) -> str:
        return "upper"

    @property
    def input_type(self) -> TransformerType:
        return TransformerType.STRING

    @property
    def output_type(self) -> TransformerType:
        return TransformerType.STRING

    def sql(
        self, dialect: str, column_ref: str, args: Optional[List[Any]] = None
    ) -> str:
        if dialect == "clickhouse":
            return f"upper({column_ref})"
        return f"UPPER({column_ref})"

    def apply(self, value: Any, args: Optional[List[Any]] = None) -> Any:
        return str(value).upper()


class LowerTransformer(Transformer):
    @property
    def name(self) -> str:
        return "lower"

    @property
    def input_type(self) -> TransformerType:
        return TransformerType.STRING

    @property
    def output_type(self) -> TransformerType:
        return TransformerType.STRING

    def sql(
        self, dialect: str, column_ref: str, args: Optional[List[Any]] = None
    ) -> str:
        if dialect == "clickhouse":
            return f"lower({column_ref})"
        return f"LOWER({column_ref})"

    def apply(self, value: Any, args: Optional[List[Any]] = None) -> Any:
        return str(value).lower()


class LenTransformer(Transformer):
    @property
    def name(self) -> str:
        return "len"

    @property
    def input_type(self) -> TransformerType:
        return TransformerType.STRING

    @property
    def output_type(self) -> TransformerType:
        return TransformerType.INT

    def sql(
        self, dialect: str, column_ref: str, args: Optional[List[Any]] = None
    ) -> str:
        if dialect == "clickhouse":
            return f"length({column_ref})"
        return f"LENGTH({column_ref})"

    def apply(self, value: Any, args: Optional[List[Any]] = None) -> Any:
        return len(str(value))


class SplitTransformer(Transformer):
    @property
    def name(self) -> str:
        return "split"

    @property
    def input_type(self) -> TransformerType:
        return TransformerType.STRING

    @property
    def output_type(self) -> TransformerType:
        return TransformerType.ARRAY

    def sql(
        self, dialect: str, column_ref: str, args: Optional[List[Any]] = None
    ) -> str:
        a = args or []
        delimiter = a[0] if a else ","
        escaped = "'" + delimiter.replace("'", "\\'") + "'"
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
