import json
import re
import subprocess
import sys
import tomllib


def validate(version, repo_root="."):
    errors = []

    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        errors.append(
            f"Invalid version format '{version}'. Expected X.Y.Z (e.g., 0.0.32)"
        )

    with open(f"{repo_root}/python/pyproject.toml", "rb") as f:
        pyproject_version = tomllib.load(f)["project"]["version"]
    if pyproject_version != version:
        errors.append(
            f"pyproject.toml has version '{pyproject_version}', expected '{version}'"
        )

    with open(f"{repo_root}/javascript/package.json") as f:
        package_version = json.load(f)["version"]
    if package_version != version:
        errors.append(
            f"package.json has version '{package_version}', expected '{version}'"
        )

    tag = f"golang/v{version}"
    result = subprocess.run(
        ["git", "tag", "-l", tag],
        capture_output=True,
        text=True,
        cwd=repo_root,
    )
    if tag in result.stdout.strip().splitlines():
        errors.append(f"Tag '{tag}' already exists")

    return errors


def main():
    if len(sys.argv) != 2:
        print("Usage: validate_version.py <version>", file=sys.stderr)
        sys.exit(1)

    errors = validate(sys.argv[1])

    for e in errors:
        print(f"::error::{e}", file=sys.stderr)
    if errors:
        sys.exit(1)

    print(f"Validation passed for version {sys.argv[1]}")


if __name__ == "__main__":
    main()
