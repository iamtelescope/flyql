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
)
