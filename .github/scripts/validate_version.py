import argparse
import json
import re
import subprocess
import sys
import tomllib

TARGETS = ("python", "javascript", "golang")


def validate_format(version):
    errors = []
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        errors.append(
            f"Invalid version format '{version}'. Expected X.Y.Z (e.g., 0.0.32)"
        )
    return errors


def validate_python(version, repo_root="."):
    errors = []
    with open(f"{repo_root}/python/pyproject.toml", "rb") as f:
        pyproject_version = tomllib.load(f)["project"]["version"]
    if pyproject_version != version:
        errors.append(
            f"pyproject.toml has version '{pyproject_version}', expected '{version}'"
        )
    return errors


def validate_javascript(version, repo_root="."):
    errors = []
    for pkg in ("flyql", "flyql-vue"):
        path = f"{repo_root}/javascript/packages/{pkg}/package.json"
        with open(path) as f:
            package_version = json.load(f)["version"]
        if package_version != version:
            errors.append(
                f"{pkg}/package.json has version '{package_version}', expected '{version}'"
            )
    return errors


def validate_golang(version, repo_root="."):
    errors = []
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


VALIDATORS = {
    "python": validate_python,
    "javascript": validate_javascript,
    "golang": validate_golang,
}


def validate(version, targets=None, repo_root="."):
    if targets is None:
        targets = TARGETS

    errors = validate_format(version)
    for target in targets:
        errors.extend(VALIDATORS[target](version, repo_root))
    return errors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("version")
    parser.add_argument(
        "targets", nargs="*", default=list(TARGETS), choices=[*TARGETS, []]
    )
    args = parser.parse_args()

    errors = validate(args.version, args.targets)

    for e in errors:
        print(f"::error::{e}", file=sys.stderr)
    if errors:
        sys.exit(1)

    print(f"Validation passed for version {args.version}")


if __name__ == "__main__":
    main()
