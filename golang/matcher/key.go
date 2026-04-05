package matcher

import "github.com/iamtelescope/flyql/golang"

type Key struct {
	Value string
	Path  []string
}

func NewKey(value string) Key {
	parsed, err := flyql.ParseKey(value, 0)
	if err != nil {
		return Key{
			Value: value,
			Path:  []string{},
		}
	}

	if len(parsed.Segments) == 0 {
		return Key{
			Value: value,
			Path:  []string{},
		}
	}

	return Key{
		Value: parsed.Segments[0],
		Path:  parsed.Segments[1:],
	}
}
