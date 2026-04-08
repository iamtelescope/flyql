import json
import os
import subprocess
import textwrap

import pytest

from validate_version import validate


@pytest.fixture
def repo(tmp_path):
    """Create a fake repo with pyproject.toml, package.json, and git tags."""
    python_dir = tmp_path / "python"
    python_dir.mkdir()
    js_dir = tmp_path / "javascript"
    js_dir.mkdir()

    def setup(*, pyproject_version="1.2.3", package_version="1.2.3", tags=None):
        (python_dir / "pyproject.toml").write_text(
            textwrap.dedent(f"""\
                [project]
                name = "flyql"
                version = "{pyproject_version}"
            """)
        )
        (js_dir / "package.json").write_text(
            json.dumps({"name": "flyql", "version": package_version})
        )

        subprocess.run(["git", "init"], cwd=tmp_path, capture_output=True, check=True)
        subprocess.run(
            ["git", "commit", "--allow-empty", "-m", "init"],
            cwd=tmp_path,
            capture_output=True,
            check=True,
            env={
                **os.environ,
                "GIT_AUTHOR_NAME": "test",
                "GIT_AUTHOR_EMAIL": "test@test",
                "GIT_COMMITTER_NAME": "test",
                "GIT_COMMITTER_EMAIL": "test@test",
            },
        )
        for tag in tags or []:
            subprocess.run(
                ["git", "tag", tag], cwd=tmp_path, capture_output=True, check=True
            )

        return tmp_path

    return setup


class TestVersionFormat:
    def test_valid_versions(self, repo):
        for v in ["0.0.1", "1.2.3", "10.20.30", "0.0.0"]:
            root = repo(pyproject_version=v, package_version=v)
            assert validate(v, str(root)) == []

    def test_invalid_format_v_prefix(self, repo):
        root = repo()
        errors = validate("v1.2.3", str(root))
        assert any("Invalid version format" in e for e in errors)

    def test_invalid_format_two_parts(self, repo):
        root = repo()
        errors = validate("1.2", str(root))
        assert any("Invalid version format" in e for e in errors)

    def test_invalid_format_four_parts(self, repo):
        root = repo()
        errors = validate("1.2.3.4", str(root))
        assert any("Invalid version format" in e for e in errors)

    def test_invalid_format_alpha(self, repo):
        root = repo()
        errors = validate("1.2.3-beta", str(root))
        assert any("Invalid version format" in e for e in errors)

    def test_invalid_format_empty(self, repo):
        root = repo()
        errors = validate("", str(root))
        assert any("Invalid version format" in e for e in errors)


class TestPyprojectVersion:
    def test_mismatch(self, repo):
        root = repo(pyproject_version="0.0.1", package_version="1.2.3")
        errors = validate("1.2.3", str(root))
        assert any("pyproject.toml" in e for e in errors)

    def test_match(self, repo):
        root = repo(pyproject_version="1.2.3", package_version="1.2.3")
        errors = validate("1.2.3", str(root))
        assert not any("pyproject.toml" in e for e in errors)


class TestPackageJsonVersion:
    def test_mismatch(self, repo):
        root = repo(pyproject_version="1.2.3", package_version="0.0.1")
        errors = validate("1.2.3", str(root))
        assert any("package.json" in e for e in errors)

    def test_match(self, repo):
        root = repo(pyproject_version="1.2.3", package_version="1.2.3")
        errors = validate("1.2.3", str(root))
        assert not any("package.json" in e for e in errors)


class TestGoTag:
    def test_tag_exists(self, repo):
        root = repo(tags=["golang/v1.2.3"])
        errors = validate("1.2.3", str(root))
        assert any("already exists" in e for e in errors)

    def test_tag_does_not_exist(self, repo):
        root = repo()
        errors = validate("1.2.3", str(root))
        assert not any("already exists" in e for e in errors)

    def test_different_tag_exists(self, repo):
        root = repo(tags=["golang/v0.0.1"])
        errors = validate("1.2.3", str(root))
        assert not any("already exists" in e for e in errors)


class TestMultipleErrors:
    def test_all_errors_collected(self, repo):
        root = repo(
            pyproject_version="0.0.1",
            package_version="0.0.2",
            tags=["golang/v1.2.3"],
        )
        errors = validate("1.2.3", str(root))
        assert any("pyproject.toml" in e for e in errors)
        assert any("package.json" in e for e in errors)
        assert any("already exists" in e for e in errors)
