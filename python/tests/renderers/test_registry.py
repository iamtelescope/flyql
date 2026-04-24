import pytest

from flyql.flyql_type import Type
from flyql.renderers import ArgSpec, Renderer, RendererRegistry, default_registry


class _Plain(Renderer):
    arg_schema = ()

    @property
    def name(self) -> str:
        return "plain"


class _Href(Renderer):
    arg_schema = (ArgSpec(type=Type.String, required=True),)

    @property
    def name(self) -> str:
        return "href"


def test_default_registry_is_empty():
    reg = default_registry()
    assert reg.names() == []


def test_register_and_get():
    reg = RendererRegistry()
    reg.register(_Plain())
    assert reg.get("plain") is not None
    assert reg.get("missing") is None


def test_register_duplicate_raises():
    reg = RendererRegistry()
    reg.register(_Plain())
    with pytest.raises(ValueError):
        reg.register(_Plain())


def test_names_returns_registered():
    reg = RendererRegistry()
    reg.register(_Plain())
    reg.register(_Href())
    assert set(reg.names()) == {"plain", "href"}


def test_set_diagnose_stores_hook():
    reg = RendererRegistry()
    assert reg.get_diagnose() is None

    def hook(parsed_column, chain):
        return []

    reg.set_diagnose(hook)
    assert reg.get_diagnose() is hook


def test_renderer_default_metadata_and_diagnose():
    r = _Plain()
    assert r.metadata == {}
    assert r.diagnose([], object()) == []


def test_renderer_base_defaults_description_empty():
    # Dedicated minimal subclass — does not share state with _Plain, so a
    # future edit that adds a `description` attribute on _Plain cannot
    # silently mask this test.
    class _DescStub(Renderer):
        @property
        def name(self) -> str:
            return "desc_stub"

    assert _DescStub().description == ""
