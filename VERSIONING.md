# Versioning

FlyQL follows [Semantic Versioning 2.0.0](https://semver.org/) starting with **1.0.0**.

Versions take the form `MAJOR.MINOR.PATCH`:

- **MAJOR** — incremented for breaking changes to the stable public API.
- **MINOR** — incremented for backward-compatible additions (new operators, new transformers, new generators, additional optional fields, etc.).
- **PATCH** — incremented for backward-compatible bug fixes only.

Version numbers are kept aligned across all language ports (Python, JavaScript, Go) and the `flyql-vue` editor. A given `X.Y.Z` always refers to the same parser grammar, AST shape, and error registry across languages.

## Stable public API

The following surfaces are covered by SemVer and will only change in a backward-incompatible way in a major release:

### 1. Parser grammar

The set of expressions that parse successfully — operators, keywords, literals, list syntax, nested keys, transformers, temporal functions, escape rules. An expression that parses in `1.x.y` will continue to parse in any later `1.*.*`, with the same meaning.

Adding new accepted syntax (a new operator, a new function) is a minor change. Rejecting input that previously parsed, or changing the meaning of input that previously parsed, is a major change.

### 2. AST shape

The structure returned by `parse()` — node names, field names, field types, and the relationships between nodes. The shape is consistent across language ports (Python, JavaScript, Go) and is documented in [Advanced → AST](https://docs.flyql.dev/advanced/ast/).

Adding new optional fields, or new node variants behind a discriminator, is a minor change. Renaming, removing, or restructuring existing fields is a major change.

### 3. Error codes

The `errors/registry.json` registry — both the numeric/string `code` values exposed on `ParserError` / `Diagnostic` and the symbolic `name` values (e.g. `ERR_INVALID_CHAR_INITIAL`, `CODE_UNKNOWN_COLUMN`).

Removing or renaming a code is a major change. Adding new codes is a minor change. **Error message text is not stable** — wording may change in any release to improve clarity. Match on `code` or `name`, never on the message string.

## Not part of the stable API

These are explicitly excluded from SemVer guarantees and may change in any release:

- **Internal parser state, lexer tokens, and intermediate data structures.** Anything not documented in the public API reference.
- **Generated SQL output text.** Generators produce semantically equivalent SQL; whitespace, parenthesization, or alias choices may change without a major bump as long as the result is logically equivalent.
- **Error message wording** (see above).
- **Pre-release feature flags and experimental APIs**, which will be marked as such in the docs and changelog.
- **Build, test, and developer tooling** — `Makefile` targets, codegen scripts, test fixtures.

## Deprecation policy

When a stable API surface is being removed or changed:

1. The deprecation is announced in the [CHANGELOG](CHANGELOG.md) with the release that introduces the deprecation.
2. The old behavior continues to work for at least one minor release.
3. The removal ships in the next major release.

## Pre-1.0 history

Versions `0.0.1` through `0.0.59` were development iterations before the public release. Breaking changes were frequent during that period and are not individually documented. The `1.0.0` release marks the first version with a stability commitment; treat anything earlier as pre-release.

## Language port versions

Python (`flyql` on PyPI), JavaScript (`flyql` and `flyql-vue` on npm), and Go (Git tag `golang/vX.Y.Z` for `pkg.go.dev`) are released together with matching version numbers. A patch release on one port that fixes a port-specific bug will still bump all ports to keep them aligned.
