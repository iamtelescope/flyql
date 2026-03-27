from typing import Any

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

    def sql(self, dialect: str, column_ref: str) -> str:
        if dialect == "clickhouse":
            return f"upper({column_ref})"
        return f"UPPER({column_ref})"

    def apply(self, value: Any) -> Any:
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

    def sql(self, dialect: str, column_ref: str) -> str:
        if dialect == "clickhouse":
            return f"lower({column_ref})"
        return f"LOWER({column_ref})"

    def apply(self, value: Any) -> Any:
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

    def sql(self, dialect: str, column_ref: str) -> str:
        if dialect == "clickhouse":
            return f"length({column_ref})"
        return f"LENGTH({column_ref})"

    def apply(self, value: Any) -> Any:
        return len(str(value))
