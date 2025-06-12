from enum import Enum


class State(Enum):
    INITIAL = "Initial"
    ERROR = "Error"
    KEY = "Key"
    EXPECT_OPERATOR = "ExpectOperator"
    VALUE = "Value"
    EXPECT_VALUE = "ExpectValue"
    SINGLE_QUOTED_VALUE = "SingleQuotedValue"
    DOUBLE_QUOTED_VALUE = "DoubleQuotedValue"
    KEY_VALUE_OPERATOR = "KeyValueOperator"
    BOOL_OP_DELIMITER = "BoolOpDelimiter"
    EXPECT_BOOL_OP = "ExpectBoolOp"
