import json
import os
import subprocess
import textwrap

import pytest

from validate_version import validate, validate_format, validate_python, validate_javascript, validate_golang


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
    def test_valid_versions(self):
        for v in ["0.0.1", "1.2.3", "10.20.30", "0.0.0"]:
            assert validate_format(v) == []

    def test_invalid_format_v_prefix(self):
        assert any("Invalid version format" in e for e in validate_format("v1.2.3"))

    def test_invalid_format_two_parts(self):
        assert any("Invalid version format" in e for e in validate_format("1.2"))

    def test_invalid_format_four_parts(self):
        assert any("Invalid version format" in e for e in validate_format("1.2.3.4"))

    def test_invalid_format_alpha(self):
        assert any("Invalid version format" in e for e in validate_format("1.2.3-beta"))

    def test_invalid_format_empty(self):
        assert any("Invalid version format" in e for e in validate_format(""))


class TestPyprojectVersion:
    def test_mismatch(self, repo):
        root = repo(pyproject_version="0.0.1")
        errors = validate_python("1.2.3", str(root))
        assert any("pyproject.toml" in e for e in errors)

    def test_match(self, repo):
        root = repo(pyproject_version="1.2.3")
        errors = validate_python("1.2.3", str(root))
        assert errors == []


class TestPackageJsonVersion:
    def test_mismatch(self, repo):
        root = repo(package_version="0.0.1")
        errors = validate_javascript("1.2.3", str(root))
        assert any("package.json" in e for e in errors)

    def test_match(self, repo):
        root = repo(package_version="1.2.3")
        errors = validate_javascript("1.2.3", str(root))
        assert errors == []


class TestGoTag:
    def test_tag_exists(self, repo):
        root = repo(tags=["golang/v1.2.3"])
        errors = validate_golang("1.2.3", str(root))
        assert any("already exists" in e for e in errors)

    def test_tag_does_not_exist(self, repo):
        root = repo()
        errors = validate_golang("1.2.3", str(root))
        assert errors == []

    def test_different_tag_exists(self, repo):
        root = repo(tags=["golang/v0.0.1"])
        errors = validate_golang("1.2.3", str(root))
        assert errors == []


class TestTargetFiltering:
    def test_all_targets(self, repo):
        root = repo(
            pyproject_version="0.0.1",
            package_version="0.0.2",
            tags=["golang/v1.2.3"],
        )
        errors = validate("1.2.3", repo_root=str(root))
        assert any("pyproject.toml" in e for e in errors)
        assert any("package.json" in e for e in errors)
        assert any("already exists" in e for e in errors)

    def test_python_only(self, repo):
        root = repo(pyproject_version="0.0.1", package_version="0.0.2")
        errors = validate("1.2.3", targets=["python"], repo_root=str(root))
        assert any("pyproject.toml" in e for e in errors)
        assert not any("package.json" in e for e in errors)

    def test_javascript_only(self, repo):
        root = repo(pyproject_version="0.0.1", package_version="0.0.2")
        errors = validate("1.2.3", targets=["javascript"], repo_root=str(root))
        assert not any("pyproject.toml" in e for e in errors)
        assert any("package.json" in e for e in errors)

    def test_golang_only(self, repo):
        root = repo(tags=["golang/v1.2.3"])
        errors = validate("1.2.3", targets=["golang"], repo_root=str(root))
        assert any("already exists" in e for e in errors)
        assert not any("pyproject.toml" in e for e in errors)
        assert not any("package.json" in e for e in errors)
