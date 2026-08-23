# Changelog

All notable changes to FlyQL are documented here. The format mirrors the changelog on [docs.flyql.dev/changelog](https://docs.flyql.dev/changelog/).

FlyQL follows [Semantic Versioning](VERSIONING.md) starting with `1.0.0`. Versions `0.0.x` were pre-release development iterations and are not individually documented.

## 2026.08.23
Version: **1.2.0**

The editor components gained a text label next to the existing icon, in the slot on the left of the field. See [Editor Component](/editor/#label-and-icon).

New features:

- **`label` prop on `FlyqlEditor` and `FlyqlColumns`**, in both the Vue and React packages. The label renders inside the field, ahead of the query text; an overlong one truncates with an ellipsis at half the field width instead of squeezing the input. Clicking it focuses the input, and a text label becomes the input's accessible name. Vue also exposes a `label` slot for richer content.
- **`icon` is now a prop in Vue**, where it was slot-only. It accepts a string (rendered as text), a component, or `false` to drop the built-in glyph; the `icon` slot still takes precedence over the prop. In React the existing `icon` render prop now also accepts `false`.

Behavioral changes:

- **The icon and label share a new flex prefix element.** `.flyql-<root>__icon` is no longer absolutely positioned — it lives inside `.flyql-<root>__prefix`, and the input's left padding no longer reserves room for it. Stylesheets that positioned the icon themselves need updating; overrides that only remap `--flyql-*` variables are unaffected.
- **`--flyql-code-font-family` now defaults to a real stack** — `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` — instead of bare `monospace`, which resolved to a different face in every browser (Menlo in Chrome on macOS, Courier in Safari) and changed the metrics the icon and label align against. Set the variable explicitly to keep the old behaviour.
- **The built-in magnifier glyph shifted down one viewBox unit** so its ring, rather than the ring plus handle, is centred on the text.

New theme variables — `--flyql-label-color`, `--flyql-line-height`, `--flyql-prefix-gap`, `--flyql-icon-offset` and `--flyql-label-offset` — expose the label colour, the input line box, the gap between icon, label and text, and the two optical alignment nudges. See [Theming](/editor/theming/).

## 2026.08.14
Version: **1.1.1**

Bug fixes:

- **Boolean comparisons on JSON paths in the PostgreSQL generator.** A bare boolean literal on a JSON path (`jsonb_column.enabled = true`) fell through to the default text comparison, generating invalid SQL (`text = boolean`), while a quoted boolean (`= 'true'`) was guarded by `jsonb_typeof = 'string'` and silently matched nothing against JSON booleans. Bare booleans now generate a `jsonb_typeof(...) = 'boolean'` guard with a `::boolean` cast, mirroring the number handling, in Go, Python, and JavaScript.

## 2026.08.12
Version: **1.1.0**

The `values` allowlist on columns is now enforced consistently — and only where it makes sense — across the SQL generators, the in-memory matcher, and the validator. See [Values Allowlist](https://docs.flyql.dev/syntax/values/#values-allowlist) for the full semantics.

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

- New [Values Allowlist](https://docs.flyql.dev/syntax/values/#values-allowlist) section and a [NOT IN and SQL NULL](https://docs.flyql.dev/syntax/lists/#not-in-and-sql-null) note on three-valued logic, in all 11 locales.

## 2026.07.21
Version: **1.0.2**

Bug fixes:

- **Consistent character offsets for non-ASCII input.** The parser now scans input by Unicode code point in all three languages (Go scans as `[]rune`, JavaScript as `Array.from(text)`), so `Range` offsets advance one step per character regardless of byte or UTF-16 width. Previously Cyrillic and other multi-byte/astral characters desynced offsets across the Go, JavaScript, and Python ports.
- **Code-point token offsets in `tokenize()`.** `tokenize()` now reports `start`/`end` as Unicode code-point offsets in every language, identical across Python, Go, and JavaScript for all input. Previously Go emitted byte-width token spans and JavaScript emitted UTF-16-code-unit spans for non-ASCII (and astral) characters, breaking the gap-free offset invariant.
- **Valid PostgreSQL string escaping.** The PostgreSQL generator now emits escape-string literals (`E'...'`) for values that contain backslash escapes such as quotes or newlines. A plain `'...'` literal treats backslashes literally under `standard_conforming_strings` (the default), which could produce invalid SQL; values that need no escaping still render as plain `'...'`.

## 2026.05.08
Version: **1.0.0**

Initial public release.
