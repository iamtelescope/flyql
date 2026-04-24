import pytest
from typing import Any, ClassVar, Tuple

from flyql.core.exceptions import FlyqlError
from flyql.flyql_type import Type
from flyql.transformers.base import ArgSpec, Transformer
from flyql.transformers.registry import TransformerRegistry, default_registry


class _DummyTransformer(Transformer):
    @property
    def name(self) -> str:
        return "dummy"

    @property
    def input_type(self) -> Type:
        return Type.String

    @property
    def output_type(self) -> Type:
        return Type.String

    def sql(self, dialect: str, column_ref: str, args: Any = None) -> str:
        return f"DUMMY({column_ref})"

    def apply(self, value: Any, args: Any = None) -> Any:
        return value


class TestTransformerRegistry:
    def test_get_returns_none_for_unknown(self) -> None:
        registry = TransformerRegistry()
        assert registry.get("nonexistent") is None

    def test_register_and_get(self) -> None:
        registry = TransformerRegistry()
        t = _DummyTransformer()
        registry.register(t)
        assert registry.get("dummy") is t

    def test_register_duplicate_raises(self) -> None:
        registry = TransformerRegistry()
        registry.register(_DummyTransformer())
        with pytest.raises(ValueError, match="already registered"):
            registry.register(_DummyTransformer())

    def test_names_empty(self) -> None:
        registry = TransformerRegistry()
        assert registry.names() == []

    def test_names_after_register(self) -> None:
        registry = TransformerRegistry()
        registry.register(_DummyTransformer())
        assert registry.names() == ["dummy"]


class TestDefaultRegistry:
    def test_contains_upper(self) -> None:
        reg = default_registry()
        t = reg.get("upper")
        assert t is not None
        assert t.name == "upper"

    def test_contains_lower(self) -> None:
        reg = default_registry()
        t = reg.get("lower")
        assert t is not None
        assert t.name == "lower"

    def test_contains_len(self) -> None:
        reg = default_registry()
        t = reg.get("len")
        assert t is not None
        assert t.name == "len"

    def test_has_exactly_four_builtins(self) -> None:
        reg = default_registry()
        assert sorted(reg.names()) == ["len", "lower", "split", "upper"]

    def test_returns_fresh_instance(self) -> None:
        reg1 = default_registry()
        reg2 = default_registry()
        assert reg1 is not reg2

    def test_upper_types(self) -> None:
        t = default_registry().get("upper")
        assert t is not None
        assert t.input_type == Type.String
        assert t.output_type == Type.String

    def test_len_types(self) -> None:
        t = default_registry().get("len")
        assert t is not None
        assert t.input_type == Type.String
        assert t.output_type == Type.Int


class _AnyOutputTransformer(Transformer):
    @property
    def name(self) -> str:
        return "any_output"

    @property
    def input_type(self) -> Type:
        return Type.String

    @property
    def output_type(self) -> Type:
        return Type.Any

    def sql(self, dialect: str, column_ref: str, args: Any = None) -> str:
        return column_ref

    def apply(self, value: Any, args: Any = None) -> Any:
        return value


class _AnyArgTransformer(Transformer):
    arg_schema: ClassVar[Tuple[ArgSpec, ...]] = (ArgSpec(type=Type.Any),)

    @property
    def name(self) -> str:
        return "any_arg"

    @property
    def input_type(self) -> Type:
        return Type.String

    @property
    def output_type(self) -> Type:
        return Type.String

    def sql(self, dialect: str, column_ref: str, args: Any = None) -> str:
        return column_ref

    def apply(self, value: Any, args: Any = None) -> Any:
        return value


class TestRegistryRejectsAny:
    def test_register_rejects_any_output_type(self) -> None:
        registry = TransformerRegistry()
        with pytest.raises(FlyqlError, match="output_type cannot be Type.Any"):
            registry.register(_AnyOutputTransformer())

    def test_register_rejects_any_arg_type(self) -> None:
        registry = TransformerRegistry()
        with pytest.raises(FlyqlError, match="ArgSpec.type cannot be Type.Any"):
            registry.register(_AnyArgTransformer())
