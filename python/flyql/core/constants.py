from enum import Enum


class CharType(Enum):
    KEY = "flyqlKey"
    VALUE = "flyqlValue"
    OPERATOR = "flyqlOperator"
    NUMBER = "number"
    STRING = "string"
    SPACE = "space"


class Operator(Enum):
    EQUALS = "="
    NOT_EQUALS = "!="
    EQUALS_REGEX = "=~"
    NOT_EQUALS_REGEX = "!~"
    GREATER_THAN = ">"
    LOWER_THAN = "<"
    GREATER_OR_EQUALS_THAN = ">="
    LOWER_OR_EQUALS_THAN = "<="


class BoolOperator(Enum):
    AND = "and"
    OR = "or"


VALID_KEY_VALUE_OPERATORS = (
    Operator.EQUALS.value,
    Operator.NOT_EQUALS.value,
    Operator.EQUALS_REGEX.value,
    Operator.NOT_EQUALS_REGEX.value,
    Operator.GREATER_THAN.value,
    Operator.LOWER_THAN.value,
    Operator.GREATER_OR_EQUALS_THAN.value,
    Operator.LOWER_OR_EQUALS_THAN.value,
)

VALID_BOOL_OPERATORS = (
    BoolOperator.AND.value,
    BoolOperator.OR.value,
)

VALID_BOOL_OPERATORS_CHARS = (
    "a",
    "n",
    "d",
    "o",
    "r",
)
