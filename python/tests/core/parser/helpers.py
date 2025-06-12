def get_expression(node):
    """Helper to get expression from node (handles different AST structures)"""
    if node.expression is not None:
        return node.expression
    elif node.left is not None and node.left.expression is not None:
        return node.left.expression
    else:
        raise AssertionError("No expression found in node")


def has_expression(node):
    """Helper to check if node has expression directly or in children"""
    if node is None:
        return False
    if node.expression is not None:
        return True
    if node.left is not None and node.left.expression is not None:
        return True
    return False
