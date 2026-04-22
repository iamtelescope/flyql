"""Parity test: generated Python constants match errors/registry.json.

Runs at `cd python && make test` under pytest. Loads the registry at test
time and asserts (a) every constant named in the registry exists in the
generated module with the expected value, and (b) for entries not marked
`dynamic_message: true`, the message map matches the registry exactly.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterator

import pytest

from flyql import errors_generated

REGISTRY_PATH = (
    Path(__file__).resolve().parent.parent.parent / "errors" / "registry.json"
)


def _load_registry() -> dict:
    with REGISTRY_PATH.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _iter_category(
    registry: dict, category: str
) -> Iterator[tuple[str, str, object, str, str, bool]]:
    """Yield (category, name, expected_value, message, description, dynamic_message) tuples."""
    cat = registry["categories"][category]
    code_type = cat["code_type"]
    for key, entry in cat["errors"].items():
        expected: object = int(key) if code_type == "int" else key
        yield (
            category,
            entry["name"],
            expected,
            entry["message"],
            entry.get("description", ""),
            bool(entry.get("dynamic_message", False)),
        )


REGISTRY = _load_registry()

CASES = (
    list(_iter_category(REGISTRY, "core_parser"))
    + list(_iter_category(REGISTRY, "columns_parser"))
    + list(_iter_category(REGISTRY, "validator"))
    + list(_iter_category(REGISTRY, "matcher"))
)

# REGISTRY-map cases exclude matcher (Decision 2: no MATCHER_REGISTRY emitted).
REGISTRY_MAP_CASES = [c for c in CASES if c[0] != "matcher"]


@pytest.mark.parametrize("category,name,expected,message,description,dynamic", CASES)
def test_constant_value(
    category: str,
    name: str,
    expected: object,
    message: str,
    description: str,
    dynamic: bool,
) -> None:
    assert hasattr(
        errors_generated, name
    ), f"{category}: constant {name} missing from generated module"
    assert (
        getattr(errors_generated, name) == expected
    ), f"{category}: {name} = {getattr(errors_generated, name)!r}; expected {expected!r}"


_MESSAGE_MAPS = {
    "core_parser": errors_generated.CORE_PARSER_MESSAGES,
    "columns_parser": errors_generated.COLUMNS_PARSER_MESSAGES,
    "validator": errors_generated.VALIDATOR_MESSAGES,
    "matcher": errors_generated.MATCHER_MESSAGES,
}


@pytest.mark.parametrize("category,name,expected,message,description,dynamic", CASES)
def test_message_map(
    category: str,
    name: str,
    expected: object,
    message: str,
    description: str,
    dynamic: bool,
) -> None:
    mmap = _MESSAGE_MAPS[category]
    assert expected in mmap, f"{category}: message map missing key {expected!r}"
    if dynamic:
        # Dynamic-message entries still carry a non-empty canonical docs message
        # (see AC 16b).
        assert (
            mmap[expected] != ""
        ), f"{category}: dynamic entry {name} has empty message"
    else:
        assert mmap[expected] == message, (
            f"{category}: {name} message mismatch: "
            f"got {mmap[expected]!r}, expected {message!r}"
        )


_REGISTRY_MAPS = {
    "core_parser": errors_generated.CORE_PARSER_REGISTRY,
    "columns_parser": errors_generated.COLUMNS_PARSER_REGISTRY,
    "validator": errors_generated.VALIDATOR_REGISTRY,
}


@pytest.mark.parametrize(
    "category,name,expected,message,description,dynamic", REGISTRY_MAP_CASES
)
def test_registry_map(
    category: str,
    name: str,
    expected: object,
    message: str,
    description: str,
    dynamic: bool,
) -> None:
    rmap = _REGISTRY_MAPS[category]
    assert expected in rmap, f"{category}: REGISTRY missing key {expected!r}"
    entry = rmap[expected]
    assert isinstance(entry, errors_generated.ErrorEntry)
    assert (
        entry.code == expected
    ), f"{category}: {name}.code = {entry.code!r}; expected {expected!r}"
    assert (
        entry.name == name
    ), f"{category}: {name}.name = {entry.name!r}; expected {name!r}"
    # REGISTRY entries always carry the canonical message (no dynamic skip).
    assert (
        entry.message == message
    ), f"{category}: {name}.message = {entry.message!r}; expected {message!r}"
    assert (
        entry.description == description
    ), f"{category}: {name}.description = {entry.description!r}; expected {description!r}"
    assert (
        entry.dynamic_message == dynamic
    ), f"{category}: {name}.dynamic_message = {entry.dynamic_message!r}; expected {dynamic!r}"
