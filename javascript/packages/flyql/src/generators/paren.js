// Shared precedence-aware wrapping for WHERE-tree generators.
//
// Wraps a child subtree's SQL output in parens iff the child's effective
// bool operator has strictly LOWER precedence than the parent's. Atoms
// (empty childOp) are never wrapped.
//
// The 2-entry precedence table is duplicated here (rather than imported
// from core/parser.js) to keep the generator helpers free of parser
// imports. The table MUST match core/parser.js's BOOL_OP_PRECEDENCE;
// drift is caught by fixture tests and e2e language-parity checks.

const BOOL_OP_PRECEDENCE = { and: 2, or: 1 }

const precedence = (op) => BOOL_OP_PRECEDENCE[op] ?? 0

export function wrapChild(childText, childOp, parentOp) {
    if (!childOp) {
        return childText
    }
    if (precedence(childOp) < precedence(parentOp)) {
        return `(${childText})`
    }
    return childText
}
