"""Tests that run every doc snippet file and verify it executes without errors.

Each snippet in python/snippets/ is the exact code shown in the docs.
If a test here fails, the corresponding doc example is broken.
"""

import os
import subprocess
import sys
from pathlib import Path

import pytest

SNIPPETS_DIR = Path(__file__).resolve().parent.parent / "snippets"
PYTHON_DIR = SNIPPETS_DIR.parent


def snippet_files():
    return sorted(SNIPPETS_DIR.glob("*.py"))


@pytest.mark.parametrize(
    "snippet",
    snippet_files(),
    ids=[f.stem for f in snippet_files()],
)
def test_snippet(snippet):
    env = os.environ.copy()
    env["PYTHONPATH"] = str(PYTHON_DIR) + os.pathsep + env.get("PYTHONPATH", "")
    result = subprocess.run(
        [sys.executable, str(snippet)],
        capture_output=True,
        text=True,
        cwd=str(PYTHON_DIR),
        env=env,
        timeout=30,
    )
    assert result.returncode == 0, (
        f"Snippet {snippet.name} failed:\n"
        f"stdout: {result.stdout}\n"
        f"stderr: {result.stderr}"
    )
