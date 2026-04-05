package flyql

import "fmt"

type ParseError struct {
	Code    int
	Message string
	Range   Range
}

func (e *ParseError) Error() string {
	return fmt.Sprintf("parse error at [%d,%d): %s (code %d)", e.Range.Start, e.Range.End, e.Message, e.Code)
}

type KeyParseError struct {
	Message string
	Range   Range
}

func (e *KeyParseError) Error() string {
	return fmt.Sprintf("key parsing error: %s", e.Message)
}
