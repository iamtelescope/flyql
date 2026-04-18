"""Verify that each public submodule's ``__all__`` matches the canonical surface manifest at ``errors/public_api_surface.json``.

The manifest is the cross-language source of truth; every language test
(this one, plus the JS and Go equivalents) asserts against the same JSON.
"""

import importlib
import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SURFACE_PATH = REPO_ROOT / "errors" / "public_api_surface.json"
SURFACE = json.loads(SURFACE_PATH.read_text(encoding="utf-8"))["python"]


def _check(module_name: str) -> None:
    mod = importlib.import_module(module_name)
    actual = sorted(getattr(mod, "__all__", []))
    expected = sorted(SURFACE[module_name])
    missing = sorted(set(expected) - set(actual))
    unexpected = sorted(set(actual) - set(expected))
    assert (
        actual == expected
    ), f"{module_name}.__all__ drift\n  missing: {missing}\n  unexpected: {unexpected}"


def test_flyql_surface() -> None:
    _check("flyql")


def test_flyql_core_surface() -> None:
    _check("flyql.core")


def test_flyql_matcher_surface() -> None:
    _check("flyql.matcher")


def test_flyql_transformers_surface() -> None:
    _check("flyql.transformers")
