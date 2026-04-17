"""Errno coverage — verify every registered errno has at least one triggering fixture
and each fixture entry produces the declared errno + message substring.

Dead branches in the parser that cannot be reached by any user input are listed in
each fixture's `known_unreachable_codes` array; those names satisfy the registry-
coverage invariant without requiring a trigger.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Tuple

import pytest

from flyql.columns.exceptions import ParserError as ColumnsParserError
from flyql.columns.parser import Parser as ColumnsParser
from flyql.core.parser import Parser as CoreParser
from flyql.core.parser import ParserError as CoreParserError

REPO_ROOT = Path(__file__).parent.parent.parent
REGISTRY_PATH = REPO_ROOT / "errors" / "registry.json"
CORE_FIXTURE_PATH = REPO_ROOT / "tests-data" / "core" / "parser" / "errno_coverage.json"
COLUMNS_FIXTURE_PATH = (
    REPO_ROOT / "tests-data" / "core" / "parser" / "columns_errno_coverage.json"
)


def _load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _resolve_input(entry: Dict[str, Any]) -> str:
    if "input" in entry:
        return entry["input"]
    c = entry["input_construction"]
    if c["type"] == "nested_parens":
        depth = c["depth"]
        return "(" * depth + "a=1" + ")" * depth
    raise AssertionError(f"unknown input_construction type: {c['type']!r}")


def _registry_names(category: str) -> List[str]:
    reg = _load_json(REGISTRY_PATH)
    return [entry["name"] for entry in reg["categories"][category]["errors"].values()]


def _fixture_cases(fixture: Dict[str, Any]) -> List[Tuple[str, Dict[str, Any]]]:
    return [(t["name"], t) for t in fixture["tests"]]


CORE_FIXTURE = _load_json(CORE_FIXTURE_PATH)
COLUMNS_FIXTURE = _load_json(COLUMNS_FIXTURE_PATH)


@pytest.mark.parametrize("name,entry", _fixture_cases(CORE_FIXTURE))
def test_core_fixture_entry_triggers_declared_errno(
    name: str, entry: Dict[str, Any]
) -> None:
    parser = CoreParser()
    text = _resolve_input(entry)
    with pytest.raises(CoreParserError) as exc_info:
        parser.parse(text)
    expected = entry["expected_error"]
    if "errno" in expected:
        assert (
            exc_info.value.errno == expected["errno"]
        ), f"{name}: expected errno {expected['errno']}, got {exc_info.value.errno} msg={parser.error_text!r}"
    if "errno_options" in expected:
        assert (
            exc_info.value.errno in expected["errno_options"]
        ), f"{name}: expected errno in {expected['errno_options']}, got {exc_info.value.errno}"
    mc = expected.get("message_contains", "")
    if mc:
        assert (
            mc in parser.error_text
        ), f"{name}: expected message to contain {mc!r}, got {parser.error_text!r}"


@pytest.mark.parametrize("name,entry", _fixture_cases(COLUMNS_FIXTURE))
def test_columns_fixture_entry_triggers_declared_errno(
    name: str, entry: Dict[str, Any]
) -> None:
    caps = entry.get("capabilities") or {}
    parser = ColumnsParser(capabilities=caps)
    text = _resolve_input(entry)
    with pytest.raises(ColumnsParserError) as exc_info:
        parser.parse(text)
    expected = entry["expected_error"]
    if "errno" in expected:
        assert (
            exc_info.value.errno == expected["errno"]
        ), f"{name}: expected errno {expected['errno']}, got {exc_info.value.errno} msg={parser.error_text!r}"
    if "errno_options" in expected:
        assert (
            exc_info.value.errno in expected["errno_options"]
        ), f"{name}: expected errno in {expected['errno_options']}, got {exc_info.value.errno}"
    mc = expected.get("message_contains", "")
    if mc:
        assert (
            mc in parser.error_text
        ), f"{name}: expected message to contain {mc!r}, got {parser.error_text!r}"


def test_core_registry_names_all_covered() -> None:
    fixture_names = {t["name"] for t in CORE_FIXTURE["tests"]}
    unreachable = set(CORE_FIXTURE.get("known_unreachable_codes", []))
    registry_names = set(_registry_names("core_parser"))
    missing = registry_names - fixture_names - unreachable
    assert not missing, (
        "core_parser registry codes without a fixture entry or unreachable marker: "
        f"{sorted(missing)}"
    )
    unknown_unreachable = unreachable - registry_names
    assert not unknown_unreachable, (
        "known_unreachable_codes references names not in registry: "
        f"{sorted(unknown_unreachable)}"
    )


def test_columns_registry_names_all_covered() -> None:
    fixture_names = {t["name"] for t in COLUMNS_FIXTURE["tests"]}
    unreachable = set(COLUMNS_FIXTURE.get("known_unreachable_codes", []))
    registry_names = set(_registry_names("columns_parser"))
    missing = registry_names - fixture_names - unreachable
    assert not missing, (
        "columns_parser registry codes without a fixture entry or unreachable marker: "
        f"{sorted(missing)}"
    )
    unknown_unreachable = unreachable - registry_names
    assert not unknown_unreachable, (
        "known_unreachable_codes references names not in registry: "
        f"{sorted(unknown_unreachable)}"
    )
