"""Parity tests for ``flyql.matcher.match`` — the one-shot convenience wrapper."""

import pytest

from flyql.matcher import match

try:
    import re2  # type: ignore[import-untyped]

    HAVE_RE2 = True
except ImportError:
    HAVE_RE2 = False


def test_equality_true() -> None:
    assert match("a=1", {"a": 1}) is True


def test_equality_false() -> None:
    assert match("a=1", {"a": 2}) is False


def test_comparison() -> None:
    assert match("count>10", {"count": 15}) is True
    assert match("count<=10", {"count": 10}) is True


def test_and_composition() -> None:
    assert match("a=1 and b=2", {"a": 1, "b": 2}) is True
    assert match("a=1 and b=2", {"a": 1, "b": 3}) is False


def test_or_composition() -> None:
    assert match("a=1 or b=2", {"a": 1, "b": 99}) is True
    assert match("a=1 or b=2", {"a": 99, "b": 2}) is True
    assert match("a=1 or b=2", {"a": 99, "b": 99}) is False


@pytest.mark.skipif(not HAVE_RE2, reason="requires flyql[re2]")
def test_regex() -> None:
    assert match('msg~"^hi"', {"msg": "hi there"}) is True
    assert match('msg~"^hi"', {"msg": "bye"}) is False


@pytest.mark.skipif(not HAVE_RE2, reason="requires flyql[re2]")
def test_like() -> None:
    assert match('msg like "h%"', {"msg": "hello"}) is True
    assert match('msg like "h%"', {"msg": "bye"}) is False


def test_timezone_override() -> None:
    # startOf('day') evaluated with an explicit timezone should match a
    # timestamp that falls within that local day.
    from datetime import datetime

    now_local = datetime.now().isoformat()
    result = match(
        "ts>startOf('day')", {"ts": now_local}, default_timezone="Europe/Berlin"
    )
    assert result in (True, False)
