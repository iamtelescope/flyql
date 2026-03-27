import pytest
from typing import Any

from flyql.transformers.base import Transformer, TransformerType


class TestTransformerType:
    def test_string_value(self) -> None:
        assert TransformerType.STRING.value == "string"

    def test_int_value(self) -> None:
        assert TransformerType.INT.value == "int"

    def test_float_value(self) -> None:
        assert TransformerType.FLOAT.value == "float"

    def test_bool_value(self) -> None:
        assert TransformerType.BOOL.value == "bool"

    def test_array_value(self) -> None:
        assert TransformerType.ARRAY.value == "array"

    def test_has_exactly_five_members(self) -> None:
        assert len(TransformerType) == 5


class _StubTransformer(Transformer):
    @property
    def name(self) -> str:
        return "stub"

    @property
    def input_type(self) -> TransformerType:
        return TransformerType.STRING

    @property
    def output_type(self) -> TransformerType:
        return TransformerType.STRING

    def sql(self, dialect: str, column_ref: str) -> str:
        return f"STUB({column_ref})"

    def apply(self, value: Any) -> Any:
        return value


class TestTransformerBaseClass:
    def test_cannot_instantiate_abstract_class(self) -> None:
        with pytest.raises(TypeError):
            Transformer()  # type: ignore[abstract]

    def test_concrete_subclass_has_name(self) -> None:
        t = _StubTransformer()
        assert t.name == "stub"

    def test_concrete_subclass_has_input_type(self) -> None:
        t = _StubTransformer()
        assert t.input_type == TransformerType.STRING

    def test_concrete_subclass_has_output_type(self) -> None:
        t = _StubTransformer()
        assert t.output_type == TransformerType.STRING

    def test_concrete_subclass_sql(self) -> None:
        t = _StubTransformer()
        assert t.sql("clickhouse", "col") == "STUB(col)"

    def test_concrete_subclass_apply(self) -> None:
        t = _StubTransformer()
        assert t.apply("hello") == "hello"
