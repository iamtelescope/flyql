---
title: Changelog
---

## 2026.04.12
Version: **0.0.37**

- Collapse `jsonstring` boolean into `Type.JSONString` — a first-class canonical type across Go, Python, and JavaScript. The `jsonstring` boolean field on `Column`/`ColumnDef` has been removed. Declare columns with `type: "jsonstring"` instead. Legacy schemas trigger a migration error.

## 2026.04.09
Version: **0.0.36**

Initial public release.
