---
title: Changelog
---

## 2026.07.21
Version: **1.0.2**

Bug fixes:

- **Consistent character offsets for non-ASCII input.** The parser now scans input by Unicode code point in all three languages (Go scans as `[]rune`, JavaScript as `Array.from(text)`), so `Range` offsets advance one step per character regardless of byte or UTF-16 width. Previously Cyrillic and other multi-byte/astral characters desynced offsets across the Go, JavaScript, and Python ports.
- **Code-point token offsets in `tokenize()`.** `tokenize()` now reports `start`/`end` as Unicode code-point offsets in every language, identical across Python, Go, and JavaScript for all input. Previously Go emitted byte-width token spans and JavaScript emitted UTF-16-code-unit spans for non-ASCII (and astral) characters, breaking the gap-free offset invariant.
- **Valid PostgreSQL string escaping.** The PostgreSQL generator now emits escape-string literals (`E'...'`) for values that contain backslash escapes such as quotes or newlines. A plain `'...'` literal treats backslashes literally under `standard_conforming_strings` (the default), which could produce invalid SQL; values that need no escaping still render as plain `'...'`.

## 2026.05.08
Version: **1.0.0**

Initial public release.
