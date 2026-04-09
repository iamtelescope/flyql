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

## Getting Help

If you're unsure about anything, open a GitHub issue to discuss before investing time in implementation. We're happy to help clarify scope and expectations.
