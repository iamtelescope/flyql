---
baseline_sha: 11d052f0e57ee61faa1633d8563c8becaa68b69b
baseline_report: pre-paren-cleanup-report.json
baseline_total: 2202
baseline_passed: 2202
baseline_parity_mismatched: 0
captured: 2026-04-20
spec: tech-spec-minimal-sql-parens.md
---

# Pre-Paren-Cleanup Baseline — Canonical Before/After Reproducers

These reproducers document the **current (pre-change) SQL output** of the
WHERE-tree generators across Python / JavaScript / Go for
ClickHouse / PostgreSQL / StarRocks, and the **target (post-change)** output
after precedence-aware paren wrapping lands.

The `baseline_sha` above pins the `main` commit the baseline report was
captured at. If `main` advances mid-implementation, rebase and re-snapshot.

Assumed column schema (per-dialect `tests-data/generators/{dialect}/columns.json`
baseline types): `a`, `b`, `c`, `d`, `status`, `x` all Int.

---

## Reproducer 1 — Same-precedence chain (user's primary complaint)

**Input:** `status > 1 and status < 2 and status > 3 and status > 5 and status > 6`

**Parser AST (left-leaning within the AND precedence level):**
```
AND(AND(AND(AND(leaf(s>1), leaf(s<2)), leaf(s>3)), leaf(s>5)), leaf(s>6))
```

**Current output (all 3 dialects):**
```
((((status > 1 AND status < 2) AND status > 3) AND status > 5) AND status > 6)
```

**Target output (all 3 dialects):**
```
status > 1 AND status < 2 AND status > 3 AND status > 5 AND status > 6
```

**Rationale:** every AND-under-AND combination is same-precedence →
child's precedence (2) is **not strictly less** than parent's (2) →
no wrap. The outermost call has `parent_op=""` (precedence 0), so the
top-level AND is also never wrapped.

---

## Reproducer 2 — Mixed precedence, AND under OR (wrap not needed)

**Input:** `a = 1 or b = 2 and c = 3`

**Parser AST (right-leaning across the precedence boundary):**
```
OR(leaf(a=1), AND(leaf(b=2), leaf(c=3)))
```

**Current output:**
```
(a = 1 OR (b = 2 AND c = 3))
```

**Target output:**
```
a = 1 OR b = 2 AND c = 3
```

**Rationale:** the AND child has precedence 2, the OR parent has
precedence 1. `precedence(child) < precedence(parent)` is `2 < 1` → false
→ no wrap on the inner AND. The outermost OR also has no parent, so no
outer wrap.

SQL semantics are identical (`OR` binds looser than `AND`), but the
target form is visually cleaner.

---

## Reproducer 3 — Right-leaning mixed tree

**Input:** `a or b and c or d`

**Parser AST (`_fold_with_precedence` folds `b and c` into the AND level,
then the rightmost OR joins at OR level):**
```
OR(OR(leaf(a), AND(leaf(b), leaf(c))), leaf(d))
```

**Current output:**
```
((a OR (b AND c)) OR d)
```

**Target output:**
```
a OR b AND c OR d
```

**Rationale:** each local wrap decision is independent of tree shape.
At the outer OR: both children are OR / leaf — same or higher precedence,
no wrap. At the inner OR: left is leaf (atom), right is AND (precedence 2 ≥
parent OR precedence 1), no wrap. At the AND node: both children are
leaves — no wrap. Outermost call has no parent, no wrap.

---

## Reproducer 4 — Lower-precedence under higher (wrap required)

**Input:** `a = 1 and (b = 2 or c = 3)`

**Parser AST (grouped-prefix wrapper around the OR, then AND merges it in):**
```
AND(leaf(a=1), OR(leaf(b=2), leaf(c=3)))
```

**Current output:**
```
(a = 1 AND (b = 2 OR c = 3))
```

**Target output:**
```
a = 1 AND (b = 2 OR c = 3)
```

**Rationale:** at the AND node, the right child is OR with precedence 1,
parent AND has precedence 2. `1 < 2` → **wrap**. The inner wrap stays.
The outer wrap disappears because the AND root has no parent operator.

---

## Reproducer 5 — NOT atomicity

### 5a — Sole NOT, composite operand

**Input:** `not (a = 1 and b = 2)`

**Parser AST (negation on the AND node):**
```
AND(leaf(a=1), leaf(b=2))   [negated = True]
```

**Current output:**
```
NOT ((a = 1 AND b = 2))
```

**Target output:**
```
NOT (a = 1 AND b = 2)
```

**Rationale:** current walker wraps the AND subtree unconditionally
(producing the inner `( ... )`), then applies the `NOT (…)` wrap on top,
yielding double parens. The new walker treats the root AND with
`parent_op=""` → no inner wrap, so NOT-wrap produces exactly one set of
parens per SQL convention.

### 5b — NOT-wrapped subtree as atom under AND

**Input:** `x = 5 and not (a = 1 or b = 2)`

**Parser AST:**
```
AND(leaf(x=5), OR(leaf(a=1), leaf(b=2)) [negated=True])
```

**Current output:**
```
(x = 5 AND NOT ((a = 1 OR b = 2)))
```

**Target output:**
```
x = 5 AND NOT (a = 1 OR b = 2)
```

**Rationale:** the NOT-wrapped subtree returns `effective_op = ""`
(atomic) — so the parent AND sees it as a leaf-like atom and never
wraps it. Top-level AND has no parent → no outer wrap.

---

## Summary — Wrap Rule

For every internal combine step:

> **Wrap a child iff** `child_effective_op != ""` **AND**
> `precedence(child_effective_op) < precedence(parent_op)`.

Where:

- `precedence("and") = 2`, `precedence("or") = 1`, everything else → 0.
- `child_effective_op == ""` means the child is a leaf OR a NOT-wrapped
  subtree (both are atoms — never wrapped here).
- Degenerate single-branch wrappers (parser's `extend_tree` with only
  `left` or only `right` populated and `bool_operator == ""`) propagate
  the child's `(text, effective_op)` upward unchanged — they are NOT
  atoms, because the grandparent needs to see the real inner operator.
- The outermost call has `parent_op=""` → precedence 0 → root subtree
  is never wrapped by the shim.

## Validation

Post-change, rerun `cd e2e && make run` and compare
`e2e/output/report.json` against `pre-paren-cleanup-report.json`:

- `summary.passed == summary.total` (2202) — row-set correctness.
- `summary.parity.mismatched == 0` — cross-language byte-parity.
- For every `(language, database, name)` triple, `results[*].actual`
  row IDs must match the baseline. SQL strings are expected to differ.
