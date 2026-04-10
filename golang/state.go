package flyql

type state int

const (
	stateInitial state = iota
	stateError
	stateKey
	stateSingleQuotedKey
	stateDoubleQuotedKey
	stateExpectOperator
	stateValue
	stateExpectValue
	stateSingleQuotedValue
	stateDoubleQuotedValue
	stateKeyValueOperator
	stateBoolOpDelimiter
	stateExpectBoolOp
	stateKeyOrBoolOp
	stateExpectNotTarget
	stateExpectInKeyword
	stateExpectHasKeyword
	stateExpectListStart
	stateExpectListValue
	stateInListValue
	stateInListSingleQuotedValue
	stateInListDoubleQuotedValue
	stateExpectListCommaOrEnd
	stateExpectLikeKeyword
	stateFunctionArgs
	stateFunctionDuration
	stateFunctionQuotedArg
	stateFunctionExpectCommaOrClose
	stateFunctionExpectArg
	stateParameter
	stateInListParameter
	stateFunctionParameter
)
