from enum import Enum


class State(Enum):
    INITIAL = "Initial"
    ERROR = "Error"
    KEY = "Key"
    VALUE = "Value"
    SINGLE_QUOTED_VALUE = "SingleQuotedValue"
    DOUBLE_QUOTED_VALUE = "DoubleQuotedValue"
    KEY_VALUE_OPERATOR = "KeyValueOpeator"
    BOOL_OP_DELIMITER = "BoolOpDelimiter"
    EXPECT_BOOL_OP = "ExpectBoolOp"
