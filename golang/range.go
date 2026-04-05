package flyql

// Range is a half-open character-offset span [Start, End) into the raw input
// string that the parser received. Offsets are byte-indexed per Go's native
// string semantics (s[i]). For pure-ASCII input these offsets coincide with
// Python (code points) and JavaScript (UTF-16 code units). For non-ASCII
// input, each language's offsets reflect its own native indexing — callers
// converting to display coordinates translate on their end.
type Range struct {
	Start int
	End   int
}
