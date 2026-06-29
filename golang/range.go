package flyql

// Range is a half-open character-offset span [Start, End) into the raw input
// string that the parser received. Offsets are code-point (rune) indexed: the
// parser scans the input as a []rune, so each character — ASCII or not —
// advances the offset by exactly one. These offsets coincide with the Python
// (code points) and JavaScript (code points, via Array.from scanning)
// implementations for all input. Callers converting to display coordinates
// translate on their end.
type Range struct {
	Start int
	End   int
}
