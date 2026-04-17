---
title: Changelog
---

## 2026.04.17
Version: **0.0.47** (unreleased)

### Breaking changes

- **JavaScript generators: `newColumn()` and the `Column` class constructor now take an options object.** The positional API has been removed for the ClickHouse, PostgreSQL, and StarRocks generators. Call sites must be updated to `newColumn({ name, type, values? })`. The `Column` class constructor (publicly re-exported from each dialect entry point) enforces the same contract. `withRawIdentifier()` is kept but marked `@deprecated`. Python and Go are unaffected.

## 2026.04.16
Version: **0.0.46**

Initial public release.
