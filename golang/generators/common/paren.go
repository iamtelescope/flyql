// Package common holds cross-dialect helpers shared by the clickhouse,
// postgresql, and starrocks generator packages.
package common

import "strings"

// boolOpPrecedence MUST match golang/parser.go's precedence table;
// drift is caught by fixture tests and e2e language-parity checks. The
// 2-entry map is duplicated here (rather than imported from parser) so
// generator helpers have no parser import and public_api.go does not
// need a matching entry.
var boolOpPrecedence = map[string]int{"and": 2, "or": 1}

func precedence(op string) int { return boolOpPrecedence[op] }

// WrapChild returns childText, wrapping it in parens iff the child's
// effective bool operator has strictly lower SQL precedence than the
// parent's. Atoms (childOp == "") are never wrapped.
func WrapChild(childText, childOp, parentOp string) string {
	return WrapChildWithFormat(childText, childOp, parentOp, "", false)
}

// WrapChildWithFormat is the format-aware variant of WrapChild. When
// format is true and the wrapped child spans multiple lines, the paren
// block is emitted across lines and every internal line is re-indented
// by one indentUnit. Depth accumulates naturally across nested wraps.
func WrapChildWithFormat(childText, childOp, parentOp, indentUnit string, format bool) string {
	if childOp == "" {
		return childText
	}
	if precedence(childOp) >= precedence(parentOp) {
		return childText
	}
	if format && strings.Contains(childText, "\n") {
		reindented := strings.ReplaceAll(childText, "\n", "\n"+indentUnit)
		return "(\n" + indentUnit + reindented + "\n)"
	}
	return "(" + childText + ")"
}
