package flyql

import "fmt"

type ParseError struct {
	Code    int
	Message string
	Pos     int
}

func (e *ParseError) Error() string {
	return fmt.Sprintf("parse error at position %d: %s (code %d)", e.Pos, e.Message, e.Code)
}

type KeyParseError struct {
	Message string
}

func (e *KeyParseError) Error() string {
	return fmt.Sprintf("key parsing error: %s", e.Message)
}
