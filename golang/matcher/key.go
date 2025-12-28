package matcher

import "strings"

type Key struct {
	Value string
	Path  []string
}

func NewKey(value string) Key {
	parts := strings.Split(value, ":")
	return Key{
		Value: parts[0],
		Path:  parts[1:],
	}
}
