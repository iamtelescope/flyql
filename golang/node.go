package flyql

type Node struct {
	BoolOperator string
	Expression   *Expression
	Left         *Node
	Right        *Node
}

func NewNode(boolOperator string, expression *Expression, left *Node, right *Node) *Node {
	return &Node{
		BoolOperator: boolOperator,
		Expression:   expression,
		Left:         left,
		Right:        right,
	}
}

func NewExpressionNode(expression *Expression) *Node {
	return &Node{
		BoolOperator: "",
		Expression:   expression,
	}
}

func NewBranchNode(boolOperator string, left *Node, right *Node) *Node {
	return &Node{
		BoolOperator: boolOperator,
		Left:         left,
		Right:        right,
	}
}
