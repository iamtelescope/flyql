---
title: Changelog
---

## 2026.08.12
Version: **1.1.0**

The `values` allowlist on columns is now enforced consistently — and only where it makes sense — across the SQL generators, the in-memory matcher, and the validator. See [Values Allowlist](/syntax/values/#values-allowlist) for the full semantics.

Behavioral changes:

- **`in` / `not in` lists are validated against the allowlist.** Each list element on an allowlisted column is checked during SQL generation; an out-of-allowlist element now fails with `unknown value` instead of silently matching zero rows. Null elements and column references are exempt. Queries that previously generated SQL with typo'd list elements will now be rejected.
- **The in-memory matcher enforces the allowlist.** When evaluating with a schema whose columns declare `values`, an out-of-allowlist `=` / `!=` value or `in`-list element raises `unknown value` (previously it evaluated silently, in parity-breaking contrast to the generators). Schema-free evaluation is unchanged.
- **New validator diagnostic `value_not_allowed`.** `diagnose()` now emits a positioned error when an equality value or in-list element falls outside the column's allowlist. The dialect-to-core schema bridges (`ToFlyQLSchema` / `toFlyQLSchema`) now carry `values`, so bridged schemas participate in the diagnostic.

To opt out of enforcement for a column, remove its `values` list from the schema.

Bug fixes:

- **`= null` works on allowlisted columns.** Null is a presence predicate, not a domain value: `col = null` / `col != null` on a column with a `values` allowlist now generate `IS NULL` / `IS NOT NULL` instead of failing with `unknown value`.
- **Patterns are no longer checked against the allowlist.** `like` / `ilike` / `~` / `!~` patterns on allowlisted columns generate normally; previously any pattern not literally present in the allowlist was rejected, making pattern matching on such columns impossible.
- **Go PostgreSQL generator resolves RHS column references before the allowlist check.** `col = other_column` on an allowlisted column now generates a column-to-column comparison on all generators; previously the Go PostgreSQL generator rejected it with `unknown value` while ClickHouse and StarRocks accepted it.

Documentation:

- New [Values Allowlist](/syntax/values/#values-allowlist) section and a [NOT IN and SQL NULL](/syntax/lists/#not-in-and-sql-null) note on three-valued logic, in all 11 locales.

## 2026.07.21
Version: **1.0.2**

Bug fixes:

- **Consistent character offsets for non-ASCII input.** The parser now scans input by Unicode code point in all three languages (Go scans as `[]rune`, JavaScript as `Array.from(text)`), so `Range` offsets advance one step per character regardless of byte or UTF-16 width. Previously Cyrillic and other multi-byte/astral characters desynced offsets across the Go, JavaScript, and Python ports.
- **Code-point token offsets in `tokenize()`.** `tokenize()` now reports `start`/`end` as Unicode code-point offsets in every language, identical across Python, Go, and JavaScript for all input. Previously Go emitted byte-width token spans and JavaScript emitted UTF-16-code-unit spans for non-ASCII (and astral) characters, breaking the gap-free offset invariant.
- **Valid PostgreSQL string escaping.** The PostgreSQL generator now emits escape-string literals (`E'...'`) for values that contain backslash escapes such as quotes or newlines. A plain `'...'` literal treats backslashes literally under `standard_conforming_strings` (the default), which could produce invalid SQL; values that need no escaping still render as plain `'...'`.

## 2026.05.08
Version: **1.0.0**

Initial public release.
