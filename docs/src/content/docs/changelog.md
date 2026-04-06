---
title: Changelog
---

## 2026.04.06

**AST Validator** — New `diagnose()` function walks a parsed AST against a column schema and transformer registry, returning positioned `Diagnostic` records for unknown columns, unknown transformers, wrong arity, argument type mismatches, and chain type errors. Available in Python, Go, and JavaScript.

**Core Column type** — New base `Column` class in core (Python: `flyql.core.column`, Go: `flyql.Column`, JS: `flyql/core/column`) with `matchName` for case-insensitive, escape-aware validator lookups. Generator dialect columns extend the base.

**Transformer argument schema** — New `ArgSpec` type and `argSchema` property on the `Transformer` interface. Declares expected argument types and arity so the validator (and future editor integration) can check transformer arguments statically. Built-in `split` transformer declares its optional string delimiter argument.

---

## 2026.04.03
Version: **1.0.0**

Initial public release.
