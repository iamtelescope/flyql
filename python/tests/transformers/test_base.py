import pytest
from typing import Any

from flyql.core.exceptions import FlyqlError
from flyql.flyql_type import Type, parse_flyql_type
from flyql.transformers.base import Transformer


class TestTransformerType:
    def test_string_value(self) -> None:
        assert Type.String.value == "string"

    def test_int_value(self) -> None:
        assert Type.Int.value == "int"

    def test_float_value(self) -> None:
        assert Type.Float.value == "float"

    def test_bool_value(self) -> None:
        assert Type.Bool.value == "bool"

    def test_array_value(self) -> None:
        assert Type.Array.value == "array"

    def test_has_fourteen_members(self) -> None:
        assert len(Type) == 14

    def test_type_any_member_exposed(self) -> None:
        assert Type.Any == "any"
        assert isinstance(Type.Any, Type)


class TestParseFlyQLTypeAny:
    def test_parse_flyql_type_rejects_any(self) -> None:
        with pytest.raises(FlyqlError, match="unknown flyql type"):
            parse_flyql_type("any")


class _StubTransformer(Transformer):
    @property
    def name(self) -> str:
        return "stub"

    @property
    def input_type(self) -> Type:
        return Type.String

    @property
    def output_type(self) -> Type:
        return Type.String

    def sql(self, dialect: str, column_ref: str, args: Any = None) -> str:
        return f"STUB({column_ref})"

    def apply(self, value: Any, args: Any = None) -> Any:
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
        assert t.input_type == Type.String

    def test_concrete_subclass_has_output_type(self) -> None:
        t = _StubTransformer()
        assert t.output_type == Type.String

    def test_concrete_subclass_sql(self) -> None:
        t = _StubTransformer()
        assert t.sql("clickhouse", "col") == "STUB(col)"

    def test_concrete_subclass_apply(self) -> None:
        t = _StubTransformer()
        assert t.apply("hello") == "hello"

    def test_concrete_subclass_description_defaults_empty(self) -> None:
        t = _StubTransformer()
        assert t.description == ""
