# Contributing to FlyQL

Thank you for your interest in contributing to FlyQL. This document outlines the expectations and process for making changes to the project.

## Before You Start

### Discuss First

Any change that affects root-level APIs, alters existing behavior, or introduces significant new functionality **must be discussed in a GitHub issue first**. The issue should include:

- A clear description of the problem or motivation
- The proposed approach
- Impact on existing implementations and dialects

Small fixes (typos, minor documentation corrections) do not require a prior issue.

## Requirements for All Changes

FlyQL maintains full parity across three language implementations (Go, Python, JavaScript) and three SQL dialects (ClickHouse, PostgreSQL, StarRocks). This shapes how contributions are evaluated.

### 1. Cross-Implementation Coverage

The vast majority of changes must be applied across **all three language implementations**. If your change touches parsing, AST generation, SQL transpilation, matching, or any shared behavior - it must be implemented in Go, Python, and JavaScript.

If a change is genuinely specific to one implementation (e.g., a packaging fix for npm), explain why in your pull request.

### 2. Comprehensive Test Coverage

Every change must include thorough unit tests. Tests are located in:

- `python/tests/`
- `javascript/test/`
- `golang/` (standard `_test.go` files)

Shared test fixtures live in `tests-data/` - use and extend them when applicable.

### 3. End-to-End Testing

Changes must pass the full E2E test suite, which exercises all implementations against real database instances (ClickHouse, PostgreSQL, StarRocks).

To run E2E tests locally:

```bash
make e2e
```

To inspect the results, launch the E2E report viewer:

```bash
make e2e-viewer
```

All tests must be green.

### 4. Documentation

If your change affects syntax, API surface, behavior, or configuration, update the relevant documentation in `docs/`.

### 5. Formatting and Linting

Run formatting and linting before submitting:

```bash
make fmt
make lint
```

| Language | Formatter | Linter |
|----------|-----------|--------|
| Python | black | - |
| JavaScript | prettier | - |
| Go | go fmt | golangci-lint, staticcheck |

### 6. All Tests Must Pass

Before opening a pull request, ensure that both unit tests and E2E tests pass:

```bash
make test       # unit tests across all implementations
make e2e        # end-to-end tests
make e2e-viewer # inspect e2e results
```

## Pull Request Process

1. Fork the repository and create a feature branch
2. Implement your changes following the requirements above
3. Open a pull request with a clear description of what changed and why
4. Link the related GitHub issue if one exists
5. Be responsive to review feedback

## What We Look For in Review

- Changes are applied consistently across all implementations
- Test coverage is comprehensive, not superficial
- E2E tests pass against all supported databases
- Documentation is updated where relevant
- The change does what it claims - no unrelated modifications

## A Note on Rigor

These requirements may seem strict. They exist because FlyQL guarantees behavioral parity across multiple languages and database backends. A change that works in one implementation but breaks another - or passes unit tests but fails against a real database - is not ready to merge. Consistency is a feature of this project, and contributions are expected to uphold it.

## Installing Codegen Dependencies

The shared error registry (`errors/registry.json`) is compiled into per-language constants by `errors/generate.py`. The generated files are checked into git, so most contributors never run the script — but if you touch error codes (or the generator) you need the same formatters CI uses:

- **Python:** `black==25.1.0`. Already installed by `cd python && make install`.
- **Go:** `gofmt`, shipped with the Go 1.21+ toolchain.
- **Prettier:** pinned devDependency of the JS package. `cd javascript/packages/flyql && npm ci` installs it.

`make generate-errors` fails fast with a clear message if any formatter is missing.

## Adding or Changing Error Codes

FlyQL's parser and validator emit numeric errnos (`ERR_*` / `COLUMNS_ERR_*`) and string diagnostic codes (`CODE_*`) that must stay identical across Go, Python, and JavaScript. The single source of truth is `errors/registry.json`; per-language constant modules are generated from it.

To add, rename, or remove an error code:

1. Edit `errors/registry.json`. Each entry has `name`, `message`, `description`, and optional `dynamic_message: true` for codes whose runtime message is interpolated.
2. Run `make generate-errors` from the repo root. This rewrites the six generated files:
   - `python/flyql/errors_generated.py`
   - `javascript/packages/flyql/src/errors_generated.js`
   - `golang/errors_generated.go` + `golang/errors_generated_test.go`
   - `golang/columns/errors_generated.go` + `golang/columns/errors_generated_test.go`
3. Commit both `errors/registry.json` and the updated generated files in the same change — CI rejects PRs that change the registry without re-running codegen (and vice versa).
4. If you're introducing a new code, wire it into the parser/validator call site in the language you're working in, then mirror the call site across the other two implementations.
5. If the change alters parse behavior, add or update the shared fixture under `tests-data/core/parser/` — remember the fixture format supports both `"errno": N` and `"errno_options": [N, M, ...]`.

The parity tests (`test_error_registry_parity.py` / `error-registry-parity.test.js` / `error_registry_parity_test.go`) run under the standard `make test` and catch any divergence between the registry and the generated modules.

## Getting Help

If you're unsure about anything, open a GitHub issue to discuss before investing time in implementation. We're happy to help clarify scope and expectations.
