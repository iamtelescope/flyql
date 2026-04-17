#!/usr/bin/env python3
"""Generate per-language error-constant modules from errors/registry.json.

Run from repo root as `make generate-errors` (or directly via
`python errors/generate.py`). Produces six files:

    python/flyql/errors_generated.py
    javascript/packages/flyql/src/errors_generated.js
    golang/errors_generated.go              (package flyql)
    golang/errors_generated_test.go         (package flyql, test-data)
    golang/columns/errors_generated.go      (package columns)
    golang/columns/errors_generated_test.go (package columns, test-data)

Three categories in registry.json: core_parser / columns_parser (int codes)
and validator (string codes). Core_parser + 8 non-renderer validator codes
live in golang/errors_generated.go; columns_parser + 3 renderer codes live in
golang/columns/errors_generated.go (see tech spec, Decision 7).

After writing, the script invokes language-specific formatters (black,
prettier, gofmt). Formatters are mandatory so CI and local outputs match.

Use `--check` to diff generated files against committed copies without
overwriting (exit 1 on drift).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parent.parent
REGISTRY_PATH = REPO_ROOT / "errors" / "registry.json"

NAME_RE = re.compile(r"^[A-Z][A-Z0-9_]*$")

GEN_HEADER_LINES = (
    "Code generated from errors/registry.json — DO NOT EDIT.",
    "Run `make generate-errors` at the repo root to regenerate.",
    "Source: errors/registry.json",
)


def _slash_header() -> str:
    return "".join(f"// {line}\n" for line in GEN_HEADER_LINES) + "\n"


def _py_header() -> str:
    body = "\n".join(GEN_HEADER_LINES)
    return f'"""{body}"""\n\nfrom __future__ import annotations\n\n'

VALIDATOR_RENDERER_KEYS = frozenset(
    {"unknown_renderer", "renderer_arg_count", "renderer_arg_type"}
)


@dataclass(frozen=True)
class ErrorEntry:
    key: str  # JSON key (str digits for int categories, string for validator)
    name: str
    message: str
    description: str
    dynamic_message: bool


@dataclass
class Registry:
    version: int
    core_parser: list[ErrorEntry] = field(default_factory=list)
    columns_parser: list[ErrorEntry] = field(default_factory=list)
    validator: list[ErrorEntry] = field(default_factory=list)


def _fail(msg: str) -> None:
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)


def _load_registry(path: Path) -> Registry:
    with path.open("r", encoding="utf-8") as fh:
        raw = json.load(fh)

    if not isinstance(raw, dict):
        _fail("registry.json root must be an object")
    if raw.get("version") != 1:
        _fail("registry.json: unsupported or missing 'version' (expected 1)")
    categories = raw.get("categories")
    if not isinstance(categories, dict):
        _fail("registry.json: 'categories' must be an object")

    reg = Registry(version=1)
    expected = {
        "core_parser": ("int", reg.core_parser),
        "columns_parser": ("int", reg.columns_parser),
        "validator": ("string", reg.validator),
    }
    for cat_name, (expected_type, bucket) in expected.items():
        cat = categories.get(cat_name)
        if not isinstance(cat, dict):
            _fail(f"registry.json: missing category '{cat_name}'")
        code_type = cat.get("code_type")
        if code_type != expected_type:
            _fail(
                f"category '{cat_name}' has code_type={code_type!r}; expected {expected_type!r}"
            )
        errors = cat.get("errors")
        if not isinstance(errors, dict):
            _fail(f"category '{cat_name}': 'errors' must be an object")
        for key, entry in errors.items():
            if not isinstance(entry, dict):
                _fail(f"category '{cat_name}' key={key!r}: entry must be an object")
            if expected_type == "int":
                try:
                    int(key)
                except ValueError:
                    _fail(
                        f"category '{cat_name}' has key {key!r} under code_type=int"
                    )
            name = entry.get("name", "")
            if not isinstance(name, str) or not NAME_RE.match(name):
                _fail(
                    f"category '{cat_name}' key={key!r}: name={name!r} must match ^[A-Z][A-Z0-9_]*$"
                )
            message = entry.get("message", "")
            if not isinstance(message, str) or message == "":
                _fail(
                    f"category '{cat_name}' key={key!r}: message must be a non-empty string"
                )
            description = entry.get("description", "")
            if not isinstance(description, str):
                _fail(
                    f"category '{cat_name}' key={key!r}: description must be a string"
                )
            dynamic = entry.get("dynamic_message", False)
            if not isinstance(dynamic, bool):
                _fail(
                    f"category '{cat_name}' key={key!r}: dynamic_message must be a boolean"
                )
            bucket.append(
                ErrorEntry(
                    key=key,
                    name=name,
                    message=message,
                    description=description,
                    dynamic_message=dynamic,
                )
            )

    # uniqueness: names must be unique within each category
    for cat_name, (_type, bucket) in expected.items():
        seen: dict[str, str] = {}
        for e in bucket:
            if e.name in seen:
                _fail(
                    f"category '{cat_name}': duplicate name {e.name!r} at keys {seen[e.name]} and {e.key}"
                )
            seen[e.name] = e.key

    return reg


def _sorted_by_int(entries: Iterable[ErrorEntry]) -> list[ErrorEntry]:
    return sorted(entries, key=lambda e: int(e.key))


def _sorted_by_name(entries: Iterable[ErrorEntry]) -> list[ErrorEntry]:
    return sorted(entries, key=lambda e: e.name)


def _py_str(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)


def _js_str(s: str) -> str:
    # Single-quoted string with backslash-escaping for ' and \\.
    escaped = s.replace("\\", "\\\\").replace("'", "\\'")
    return f"'{escaped}'"


def _go_str(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)


def _go_ident(name: str) -> str:
    """Map ERR_X / COLUMNS_ERR_X -> errX / columnsErrX (lowercase head)."""
    parts = name.split("_")
    head, *rest = parts
    out = head.lower() + "".join(p.capitalize() for p in rest)
    return out


GO_INITIALISMS = ("AST",)


def _go_code_ident(name: str) -> str:
    """Map CODE_ARG_COUNT -> CodeArgCount (PascalCase, exported).

    Applies GO_INITIALISMS so e.g. CODE_INVALID_AST -> CodeInvalidAST
    (Go convention preserves common initialisms uppercase).

    Validator codes are exported Go identifiers; registry names
    (CODE_ARG_COUNT) come from Python/JS upper-snake convention.
    """
    parts = name.split("_")
    out_parts: list[str] = []
    for p in parts:
        if p in GO_INITIALISMS:
            out_parts.append(p)
        else:
            out_parts.append(p.capitalize())
    return "".join(out_parts)


def _render_python(reg: Registry) -> str:
    parts: list[str] = [_py_header()]

    # core_parser
    parts.append("# core_parser errnos (int)\n")
    for e in _sorted_by_int(reg.core_parser):
        parts.append(f"{e.name} = {int(e.key)}\n")
    parts.append("\nCORE_PARSER_MESSAGES: dict[int, str] = {\n")
    for e in _sorted_by_int(reg.core_parser):
        parts.append(f"    {e.name}: {_py_str(e.message)},\n")
    parts.append("}\n\n")

    # columns_parser
    parts.append("# columns_parser errnos (int)\n")
    for e in _sorted_by_int(reg.columns_parser):
        parts.append(f"{e.name} = {int(e.key)}\n")
    parts.append("\nCOLUMNS_PARSER_MESSAGES: dict[int, str] = {\n")
    for e in _sorted_by_int(reg.columns_parser):
        parts.append(f"    {e.name}: {_py_str(e.message)},\n")
    parts.append("}\n\n")

    # validator
    parts.append("# validator diagnostic codes (string)\n")
    for e in _sorted_by_name(reg.validator):
        parts.append(f"{e.name} = {_py_str(e.key)}\n")
    parts.append("\nVALIDATOR_MESSAGES: dict[str, str] = {\n")
    for e in _sorted_by_name(reg.validator):
        parts.append(f"    {e.name}: {_py_str(e.message)},\n")
    parts.append("}\n")

    return "".join(parts)


def _render_js(reg: Registry) -> str:
    parts: list[str] = [_slash_header()]

    parts.append("// core_parser errnos (int)\n")
    for e in _sorted_by_int(reg.core_parser):
        parts.append(f"export const {e.name} = {int(e.key)}\n")
    parts.append("\nexport const CORE_PARSER_MESSAGES = Object.freeze({\n")
    for e in _sorted_by_int(reg.core_parser):
        parts.append(f"    [{e.name}]: {_js_str(e.message)},\n")
    parts.append("})\n\n")

    parts.append("// columns_parser errnos (int)\n")
    for e in _sorted_by_int(reg.columns_parser):
        parts.append(f"export const {e.name} = {int(e.key)}\n")
    parts.append("\nexport const COLUMNS_PARSER_MESSAGES = Object.freeze({\n")
    for e in _sorted_by_int(reg.columns_parser):
        parts.append(f"    [{e.name}]: {_js_str(e.message)},\n")
    parts.append("})\n\n")

    parts.append("// validator diagnostic codes (string)\n")
    for e in _sorted_by_name(reg.validator):
        parts.append(f"export const {e.name} = {_js_str(e.key)}\n")
    parts.append("\nexport const VALIDATOR_MESSAGES = Object.freeze({\n")
    for e in _sorted_by_name(reg.validator):
        parts.append(f"    [{e.name}]: {_js_str(e.message)},\n")
    parts.append("})\n")

    return "".join(parts)


def _render_go_top(reg: Registry) -> str:
    """golang/errors_generated.go — package flyql.
    Contains core_parser errnos (lowercase ident) + 8 non-renderer validator Code* (PascalCase).
    """
    parts: list[str] = [_slash_header(), "package flyql\n\n"]

    parts.append("// core_parser errnos.\n")
    parts.append("const (\n")
    for e in _sorted_by_int(reg.core_parser):
        parts.append(f"    {_go_ident(e.name)} = {int(e.key)}\n")
    parts.append(")\n\n")

    parts.append("// coreParserMessages maps core_parser errnos to canonical messages.\n")
    parts.append("var coreParserMessages = map[int]string{\n")
    for e in _sorted_by_int(reg.core_parser):
        parts.append(f"    {_go_ident(e.name)}: {_go_str(e.message)},\n")
    parts.append("}\n\n")

    non_renderer = [e for e in reg.validator if e.key not in VALIDATOR_RENDERER_KEYS]
    parts.append("// Validator diagnostic codes (excluding renderer codes which live in package columns).\n")
    parts.append("const (\n")
    for e in _sorted_by_name(non_renderer):
        parts.append(f"    {_go_code_ident(e.name)} = {_go_str(e.key)}\n")
    parts.append(")\n\n")

    parts.append("// validatorMessages maps non-renderer validator codes to canonical messages.\n")
    parts.append("var validatorMessages = map[string]string{\n")
    for e in _sorted_by_name(non_renderer):
        parts.append(f"    {_go_code_ident(e.name)}: {_go_str(e.message)},\n")
    parts.append("}\n")

    return "".join(parts)


def _render_go_top_test(reg: Registry) -> str:
    """golang/errors_generated_test.go — test-data maps for parity test.
    _test.go suffix: compiled only under `go test`.
    """
    parts: list[str] = [_slash_header(), "package flyql\n\n"]

    parts.append("var generatedCoreParserConstants = map[string]int{\n")
    for e in _sorted_by_int(reg.core_parser):
        parts.append(f"    {_go_str(e.name)}: {_go_ident(e.name)},\n")
    parts.append("}\n\n")

    parts.append("var generatedCoreParserMessages = map[string]string{\n")
    for e in _sorted_by_int(reg.core_parser):
        parts.append(f"    {_go_str(e.name)}: {_go_str(e.message)},\n")
    parts.append("}\n\n")

    non_renderer = [e for e in reg.validator if e.key not in VALIDATOR_RENDERER_KEYS]
    parts.append("var generatedValidatorConstants = map[string]string{\n")
    for e in _sorted_by_name(non_renderer):
        parts.append(f"    {_go_str(e.name)}: {_go_code_ident(e.name)},\n")
    parts.append("}\n\n")

    parts.append("var generatedValidatorMessages = map[string]string{\n")
    for e in _sorted_by_name(non_renderer):
        parts.append(f"    {_go_str(e.name)}: {_go_str(e.message)},\n")
    parts.append("}\n")

    return "".join(parts)


def _render_go_columns(reg: Registry) -> str:
    """golang/columns/errors_generated.go — package columns.
    Contains columns_parser errnos (lowercase) + 3 renderer validator Code* (PascalCase).
    """
    parts: list[str] = [_slash_header(), "package columns\n\n"]

    parts.append("// columns_parser errnos.\n")
    parts.append("const (\n")
    for e in _sorted_by_int(reg.columns_parser):
        parts.append(f"    {_go_ident(e.name)} = {int(e.key)}\n")
    parts.append(")\n\n")

    parts.append("// columnsParserMessages maps columns_parser errnos to canonical messages.\n")
    parts.append("var columnsParserMessages = map[int]string{\n")
    for e in _sorted_by_int(reg.columns_parser):
        parts.append(f"    {_go_ident(e.name)}: {_go_str(e.message)},\n")
    parts.append("}\n\n")

    renderer = [e for e in reg.validator if e.key in VALIDATOR_RENDERER_KEYS]
    parts.append("// Renderer diagnostic codes (moved from package flyql; renderers are a columns feature).\n")
    parts.append("const (\n")
    for e in _sorted_by_name(renderer):
        parts.append(f"    {_go_code_ident(e.name)} = {_go_str(e.key)}\n")
    parts.append(")\n\n")

    parts.append("// rendererValidatorMessages maps renderer codes to canonical messages.\n")
    parts.append("var rendererValidatorMessages = map[string]string{\n")
    for e in _sorted_by_name(renderer):
        parts.append(f"    {_go_code_ident(e.name)}: {_go_str(e.message)},\n")
    parts.append("}\n")

    return "".join(parts)


def _render_go_columns_test(reg: Registry) -> str:
    parts: list[str] = [_slash_header(), "package columns\n\n"]

    parts.append("var generatedColumnsParserConstants = map[string]int{\n")
    for e in _sorted_by_int(reg.columns_parser):
        parts.append(f"    {_go_str(e.name)}: {_go_ident(e.name)},\n")
    parts.append("}\n\n")

    parts.append("var generatedColumnsParserMessages = map[string]string{\n")
    for e in _sorted_by_int(reg.columns_parser):
        parts.append(f"    {_go_str(e.name)}: {_go_str(e.message)},\n")
    parts.append("}\n\n")

    renderer = [e for e in reg.validator if e.key in VALIDATOR_RENDERER_KEYS]
    parts.append("var generatedRendererValidatorConstants = map[string]string{\n")
    for e in _sorted_by_name(renderer):
        parts.append(f"    {_go_str(e.name)}: {_go_code_ident(e.name)},\n")
    parts.append("}\n\n")

    parts.append("var generatedRendererValidatorMessages = map[string]string{\n")
    for e in _sorted_by_name(renderer):
        parts.append(f"    {_go_str(e.name)}: {_go_str(e.message)},\n")
    parts.append("}\n")

    return "".join(parts)


def _atomic_write(target: Path, data: str) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(
        dir=str(target.parent), prefix=target.name, suffix=".tmp"
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(data)
        os.replace(tmp_name, target)
    except BaseException:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)
        raise


def _run_formatter(name: str, argv: list[str]) -> None:
    exe = shutil.which(argv[0])
    if exe is None:
        _fail(
            f"required formatter {name!r} not found on PATH (tried {argv[0]!r}). "
            "Install it before running codegen (see CONTRIBUTING.md)."
        )
    result = subprocess.run(argv, capture_output=True, text=True)
    if result.returncode != 0:
        stderr = result.stderr.strip()
        _fail(f"{name} failed (exit {result.returncode}):\n{stderr}")


def _format_python(path: Path) -> None:
    # Prefer `black` on PATH; fall back to `python -m black` (covers venvs
    # whose bin dir isn't on PATH).
    argv: list[str]
    if shutil.which("black") is not None:
        argv = ["black", "--quiet", "--target-version", "py310", str(path)]
    else:
        argv = [
            sys.executable,
            "-m",
            "black",
            "--quiet",
            "--target-version",
            "py310",
            str(path),
        ]
    result = subprocess.run(argv, capture_output=True, text=True)
    if result.returncode != 0:
        stderr = (result.stderr or result.stdout).strip()
        _fail(
            "black failed: "
            f"exit {result.returncode}. Install black==25.1.0 (`pip install black==25.1.0`) or activate the project venv.\n{stderr}"
        )


def _format_js(path: Path) -> None:
    # Invoke prettier via package-local node_modules/.bin using `npx --no-install`
    # from within the package directory so the pinned devDependency version runs.
    pkg_dir = REPO_ROOT / "javascript" / "packages" / "flyql"
    rel = path.resolve().relative_to(pkg_dir.resolve())
    npx = shutil.which("npx")
    if npx is None:
        _fail(
            "required formatter 'npx' not found on PATH. "
            "Install Node.js and run `cd javascript/packages/flyql && npm ci`."
        )
    result = subprocess.run(
        ["npx", "--no-install", "prettier", "--log-level=silent", "--write", str(rel)],
        cwd=str(pkg_dir),
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        stderr = (result.stderr or result.stdout).strip()
        _fail(
            "prettier failed: "
            f"exit {result.returncode}. Run `cd javascript/packages/flyql && npm ci` to install devDependencies.\n{stderr}"
        )


def _format_go(path: Path) -> None:
    _run_formatter("gofmt", ["gofmt", "-w", str(path)])


def _write_and_format(
    path: Path, contents: str, formatter: str, *, check_only: bool
) -> bool:
    """Write `contents` to `path` (or to a temp file when check_only), format,
    and return True if committed file matches. In check_only mode, never
    modifies `path`.
    """
    if check_only:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir) / path.name
            tmp_path.write_text(contents, encoding="utf-8")
            if formatter == "py":
                _format_python(tmp_path)
            elif formatter == "js":
                # Prettier can't format from a random tempdir because the package.json lives elsewhere.
                # Instead: write to real path, format, diff, restore.
                original = path.read_text(encoding="utf-8") if path.exists() else None
                _atomic_write(path, contents)
                _format_js(path)
                formatted = path.read_text(encoding="utf-8")
                if original is not None:
                    _atomic_write(path, original)
                else:
                    path.unlink(missing_ok=True)
                committed = original if original is not None else ""
                return committed == formatted
            elif formatter == "go":
                _format_go(tmp_path)
            else:
                raise AssertionError(f"unknown formatter {formatter!r}")
            formatted = tmp_path.read_text(encoding="utf-8")
        committed = path.read_text(encoding="utf-8") if path.exists() else ""
        return committed == formatted

    _atomic_write(path, contents)
    if formatter == "py":
        _format_python(path)
    elif formatter == "js":
        _format_js(path)
    elif formatter == "go":
        _format_go(path)
    else:
        raise AssertionError(f"unknown formatter {formatter!r}")
    return True


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--check",
        action="store_true",
        help="Do not modify files; exit 1 if committed generated files differ from freshly-generated output.",
    )
    args = ap.parse_args()

    reg = _load_registry(REGISTRY_PATH)

    # Warn about empty descriptions (non-fatal).
    empty = 0
    for bucket in (reg.core_parser, reg.columns_parser, reg.validator):
        for e in bucket:
            if e.description == "":
                empty += 1
    if empty:
        print(
            f"WARN: {empty} registry entries have empty 'description' — user-facing docs incomplete.",
            file=sys.stderr,
        )

    targets: list[tuple[Path, str, str]] = [
        (
            REPO_ROOT / "python" / "flyql" / "errors_generated.py",
            _render_python(reg),
            "py",
        ),
        (
            REPO_ROOT
            / "javascript"
            / "packages"
            / "flyql"
            / "src"
            / "errors_generated.js",
            _render_js(reg),
            "js",
        ),
        (REPO_ROOT / "golang" / "errors_generated.go", _render_go_top(reg), "go"),
        (
            REPO_ROOT / "golang" / "errors_generated_test.go",
            _render_go_top_test(reg),
            "go",
        ),
        (
            REPO_ROOT / "golang" / "columns" / "errors_generated.go",
            _render_go_columns(reg),
            "go",
        ),
        (
            REPO_ROOT / "golang" / "columns" / "errors_generated_test.go",
            _render_go_columns_test(reg),
            "go",
        ),
    ]

    drift = False
    for path, contents, fmt in targets:
        ok = _write_and_format(path, contents, fmt, check_only=args.check)
        if args.check and not ok:
            drift = True
            print(f"DRIFT: {path.relative_to(REPO_ROOT)}", file=sys.stderr)

    if args.check:
        if drift:
            print("error: one or more generated files are out of date.", file=sys.stderr)
            sys.exit(1)
        print("OK: generated files match registry.")
    else:
        for path, _c, _f in targets:
            print(f"wrote {path.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
