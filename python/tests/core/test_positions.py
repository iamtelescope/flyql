import glob
import json
import os
import re

import pytest

from flyql.core.parser import Parser, ParserError
from flyql.core.range import Range

FIXTURES_DIR = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__),
        "..",
        "..",
        "..",
        "tests-data",
        "core",
        "parser",
        "positions",
    )
)

_INDEX_RE = re.compile(r"^([^\[\]]+)(?:\[(\d+)\])?$")


def get_by_path(root, path: str):
    """Traverse an AST by dot-notation path, handling `[i]` index suffixes.
    Path convention: `root` refers to the root Node (no traversal needed for
    a bare `root.*` segment).
    """
    current = root
    parts = path.split(".")
    if parts and parts[0] == "root":
        parts = parts[1:]
    for part in parts:
        m = _INDEX_RE.match(part)
        if not m:
            raise ValueError(f"invalid path segment: {part!r}")
        name, idx = m.group(1), m.group(2)
        current = getattr(current, name)
        if idx is not None:
            current = current[int(idx)]
    return current


def _collect_cases():
    cases = []
    for fixture_path in sorted(glob.glob(os.path.join(FIXTURES_DIR, "*.json"))):
        with open(fixture_path) as f:
            data = json.load(f)
        for tc in data["tests"]:
            cases.append(
                pytest.param(tc, id=f"{os.path.basename(fixture_path)}::{tc['name']}")
            )
    return cases


@pytest.mark.parametrize("test_case", _collect_cases())
def test_position(test_case):
    if test_case.get("expected_result") == "error":
        p = Parser()
        with pytest.raises(ParserError) as excinfo:
            p.parse(test_case["input"])
        err = excinfo.value
        assert (
            err.errno == test_case["expected_error"]["errno"]
        ), f"errno mismatch: got {err.errno}, expected {test_case['expected_error']['errno']}"
        want = test_case["expected_error"]["range"]
        assert err.range == Range(
            want[0], want[1]
        ), f"error range mismatch: got {err.range}, expected Range{tuple(want)}"
        return

    p = Parser()
    p.parse(test_case["input"])
    for path, expected in test_case["expected_ranges"].items():
        actual = get_by_path(p.root, path)
        assert actual is not None, f"path {path!r} resolved to None"
        assert actual == Range(
            expected[0], expected[1]
        ), f"{path}: got {actual}, expected Range{tuple(expected)}"
