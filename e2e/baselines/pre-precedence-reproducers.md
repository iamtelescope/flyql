# Pre-Precedence Baseline — Reproducer AST Dumps

Baseline test count: 1743

Captured: 2026-04-14 (pre-fix, commit 5c65bb5).

These are the raw AST dumps from each language's parser **before** the
standard-operator-precedence fix is applied. They document the buggy
behavior the fix must correct.

---

## Reproducer 1 — `status = 1 or status = 2 and status = 3`

**Expected target (AC-1):** `OR(leaf(s=1), AND(leaf(s=2), leaf(s=3)))`

### Python — WRONG precedence (NOT scope N/A)
```
AND
├── left: OR
│   ├── left:  leaf(status=1)
│   └── right: leaf(status=2)
└── right: leaf(status=3)
```
Flat left-to-right: `(s=1 OR s=2) AND s=3`.

### Go — WRONG precedence (identical to Python)
```
AND
├── left: OR
│   ├── left:  leaf(status=1)
│   └── right: leaf(status=2)
└── right: leaf(status=3)
```

### JavaScript — WRONG precedence (identical to Python/Go)
```
AND
├── left: OR
│   ├── left:  leaf(status=1)
│   └── right: leaf(status=2)
└── right: leaf(status=3)
```

**Diagnosis:** All three languages have the flat-fold precedence bug.
Task 2/5/7 must fix via `_fold_with_precedence`. NOT scope not exercised.

---

## Reproducer 2 — `status = 1 or status = 2 and status = 3 and not (status = 2 or status = 3)`

**Expected target (AC-8):** `OR(leaf(s=1), AND(AND(leaf(s=2), leaf(s=3)), OR(leaf(s=2), leaf(s=3))[negated=true]))`

### Python — WRONG precedence, CORRECT NOT scope
```
AND [negated=false]
├── left: AND
│   ├── left: OR
│   │   ├── left:  leaf(status=1)
│   │   └── right: leaf(status=2)
│   └── right: leaf(status=3)
└── right: OR [negated=TRUE]   ← negation on inner sub-tree, correct
    ├── left:  leaf(status=2)
    └── right: leaf(status=3)
```

### Go — identical to Python: WRONG precedence, CORRECT NOT scope
```
AND [negated=false]
├── left: AND
│   ├── left: OR
│   │   ├── left:  leaf(status=1)
│   │   └── right: leaf(status=2)
│   └── right: leaf(status=3)
└── right: OR [negated=TRUE]
    ├── left:  leaf(status=2)
    └── right: leaf(status=3)
```

### JavaScript — WRONG precedence AND WRONG NOT scope
```
AND [negated=TRUE]                ← negation on outer merged parent! BUG
├── left: AND
│   ├── left: OR
│   │   ├── left:  leaf(status=1)
│   │   └── right: leaf(status=2)
│   └── right: leaf(status=3)
└── right: OR [negated=false]     ← should be here, isn't
    ├── left:  leaf(status=2)
    └── right: leaf(status=3)
```

**Diagnosis:** Confirmed per adversarial-review finding.
- **Python:** `parser.py:527, 545` applies negation to sub-tree BEFORE merge → correct NOT scope. Only precedence fix needed.
- **Go:** mirrors Python — only precedence fix needed.
- **JavaScript:** `applyNegationToTree()` called externally AFTER merge with zero args; operates on merged `currentNode`. Task 7 Part A/B/C rewrites signature and moves invocation inside `extendTreeFromStack`.

---

## Reproducer 3 — `(status = 1 or status = 2) and status = 3`

**Expected target (AC-6, post-fix):** canonical left-heavy `AND(OR(leaf(s=1), leaf(s=2)), leaf(s=3))`

### Python — REVERSED shape (Case 1 grouped-prefix bug)
```
AND
├── left:  leaf(status=3)         ← should be the group
└── right: OR                      ← should be right-side leaf
    ├── left:  leaf(status=1)
    └── right: leaf(status=2)
```

### Go — identical to Python: REVERSED shape
```
AND
├── left:  leaf(status=3)
└── right: OR
    ├── left:  leaf(status=1)
    └── right: leaf(status=2)
```

### JavaScript — identical to Python/Go: REVERSED shape
```
AND
├── left:  leaf(status=3)
└── right: OR
    ├── left:  leaf(status=1)
    └── right: leaf(status=2)
```

**Diagnosis:** All three produce the REVERSED shape semantically-equivalent
under AND commutativity but non-canonical. Per spec AC-6 note: the current
parser `extend_tree` Case 1 unconditionally fills `left` with the new leaf
when `left is None`, ignoring that `right` already holds the merged group
sub-tree from `extend_tree_from_stack`. Structural Fix 1 in Task 2/5/7 step 4
targets this directly.

---

## Summary (drives per-language NOT-fix decision)

| Language   | Precedence | Case 1 reversed | NOT scope    |
| ---------- | ---------- | --------------- | ------------ |
| Python     | WRONG      | WRONG           | **correct**  |
| Go         | WRONG      | WRONG           | **correct**  |
| JavaScript | WRONG      | WRONG           | WRONG        |

**Conclusion:**
- Python Task 2 step 7: **skip** (no NOT fix needed).
- Go Task 5 step 7: **skip** (no NOT fix needed).
- JavaScript Task 7 step 6 Parts A/B/C: **required** (NOT scope fix).
