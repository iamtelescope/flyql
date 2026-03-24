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
    REGEX = "~"
    NOT_REGEX = "!~"
    GREATER_THAN = ">"
    LOWER_THAN = "<"
    GREATER_OR_EQUALS_THAN = ">="
    LOWER_OR_EQUALS_THAN = "<="
    TRUTHY = "truthy"
    IN = "in"
    NOT_IN = "not in"
    HAS = "has"
    NOT_HAS = "not has"


class BoolOperator(Enum):
    AND = "and"
    OR = "or"


VALID_KEY_VALUE_OPERATORS = (
    Operator.EQUALS.value,
    Operator.NOT_EQUALS.value,
    Operator.REGEX.value,
    Operator.NOT_REGEX.value,
    Operator.GREATER_THAN.value,
    Operator.LOWER_THAN.value,
    Operator.GREATER_OR_EQUALS_THAN.value,
    Operator.LOWER_OR_EQUALS_THAN.value,
    Operator.TRUTHY.value,
    Operator.IN.value,
    Operator.NOT_IN.value,
    Operator.HAS.value,
    Operator.NOT_HAS.value,
)

IN_KEYWORD = "in"
HAS_KEYWORD = "has"

NOT_KEYWORD = "not"

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
