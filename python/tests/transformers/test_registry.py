import pytest
from typing import Any

from flyql.transformers.base import Transformer, TransformerType
from flyql.transformers.registry import TransformerRegistry, default_registry


class _DummyTransformer(Transformer):
    @property
    def name(self) -> str:
        return "dummy"

    @property
    def input_type(self) -> TransformerType:
        return TransformerType.STRING

    @property
    def output_type(self) -> TransformerType:
        return TransformerType.STRING

    def sql(self, dialect: str, column_ref: str) -> str:
        return f"DUMMY({column_ref})"

    def apply(self, value: Any) -> Any:
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

    def test_has_exactly_three_builtins(self) -> None:
        reg = default_registry()
        assert sorted(reg.names()) == ["len", "lower", "upper"]

    def test_returns_fresh_instance(self) -> None:
        reg1 = default_registry()
        reg2 = default_registry()
        assert reg1 is not reg2

    def test_upper_types(self) -> None:
        t = default_registry().get("upper")
        assert t is not None
        assert t.input_type == TransformerType.STRING
        assert t.output_type == TransformerType.STRING

    def test_len_types(self) -> None:
        t = default_registry().get("len")
        assert t is not None
        assert t.input_type == TransformerType.STRING
        assert t.output_type == TransformerType.INT
