package flyql

type ParseResult struct {
	Root       *Node
	TypedChars []TypedChar
}

func Parse(query string) (*ParseResult, error) {
	parser := NewParser()
	if err := parser.Parse(query); err != nil {
		return nil, err
	}
	return &ParseResult{Root: parser.Root, TypedChars: parser.TypedChars}, nil
}
