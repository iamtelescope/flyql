---
title: Changelog
---

## 2026.04.14
Version: **0.0.42**

### Breaking Change

**Array element access is now uniformly 0-based across all SQL dialects.**

Previously, ClickHouse and StarRocks generators passed the flyql array index through to SQL unchanged (effectively making flyql 1-based on those targets), while PostgreSQL already normalized to 0-based with a `+1` adjustment. This inconsistency meant the same flyql expression had different semantics per backend.

Now all three dialects are uniformly 0-based at the flyql layer:

- `tags.0` accesses the first element on ClickHouse, StarRocks, and PostgreSQL
- `tags.1` accesses the second element

**Migration — primary change:** If you have flyql queries that reference array indices on ClickHouse or StarRocks, decrement each array index by 1:

- `tags.1='web'` → `tags.0='web'`
- `tags.2='api'` → `tags.1='api'`

PostgreSQL queries are unaffected.

**Migration — secondary change (empty-array behavior):** On ClickHouse and StarRocks, the length guards emitted alongside array element comparisons have also changed semantics on empty-array inputs. Previously, `tags.0 = 'x'` emitted `length(tags) >= 0 AND tags[0] != ''`, where the first half was tautologically true and the guard collapsed to the subscript comparison — meaning empty-array rows could still match depending on how CH/SR handled the out-of-bounds subscript. After this fix, the guard becomes `length(tags) >= 1 AND tags[1] != ''`, which correctly short-circuits to false on empty arrays. Conversely, `tags.0 != 'x'` on empty arrays now matches (was: didn't match). This is a rare edge case but may change row counts for queries that hit empty-array values.

**How to audit your queries:** grep your query corpus for array index paths on CH/SR columns (look for patterns like `<array_col>\.\d`). Every such occurrence needs its index decremented. There is no automatic migration tool; flyql is pre-1.0 and this is a deliberate hard break.

Non-English doc translations may temporarily lag the English source.

## 2026.04.12
Version: **0.0.41**

Initial public release.
