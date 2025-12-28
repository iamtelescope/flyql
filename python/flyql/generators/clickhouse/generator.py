import re
from typing import Mapping, Tuple, Any

from flyql.core.exceptions import FlyqlError
from flyql.core.expression import Expression
from flyql.core.constants import (
    Operator,
    VALID_KEY_VALUE_OPERATORS,
    VALID_BOOL_OPERATORS,
)
from flyql.core.tree import Node

from flyql.generators.clickhouse.field import Field
from flyql.generators.clickhouse.helpers import (
    validate_operation,
    validate_in_list_types,
)
from flyql.generators.clickhouse.constants import (
    NORMALIZED_TYPE_STRING,
    NORMALIZED_TYPE_INT,
    NORMALIZED_TYPE_FLOAT,
    NORMALIZED_TYPE_BOOL,
    NORMALIZED_TYPE_DATE,
)

OPERATOR_TO_CLICKHOUSE_FUNC = {
    Operator.EQUALS.value: "equals",
    Operator.NOT_EQUALS.value: "notEquals",
    Operator.REGEX.value: "match",
    Operator.NOT_REGEX.value: "match",
    Operator.GREATER_THAN.value: "greater",
    Operator.LOWER_THAN.value: "less",
    Operator.GREATER_OR_EQUALS_THAN.value: "greaterOrEquals",
    Operator.LOWER_OR_EQUALS_THAN.value: "lessOrEquals",
}

LIKE_PATTERN_CHAR = "*"
SQL_LIKE_PATTERN_CHAR = "%"
JSON_KEY_PATTERN = re.compile(r"^[a-zA-Z_][.a-zA-Z0-9_-]*$")

ESCAPE_CHARS_MAP = {
    "\b": "\\b",
    "\f": "\\f",
    "\r": "\\r",
    "\n": "\\n",
    "\t": "\\t",
    "\0": "\\0",
    "\a": "\\a",
    "\v": "\\v",
    "\\": "\\\\",
    "'": "\\'",
}


def validate_json_path_part(part: str) -> None:
    if not part:
        raise FlyqlError("Invalid JSON path part")
    if not JSON_KEY_PATTERN.match(part):
        raise FlyqlError("Invalid JSON path part")


def validate_operator(op: str) -> None:
    if op not in VALID_KEY_VALUE_OPERATORS:
        raise FlyqlError(f"invalid operator: {op}")


def validate_bool_operator(op: str) -> None:
    if op not in VALID_BOOL_OPERATORS:
        raise FlyqlError(f"invalid bool operator: {op}")


def escape_param(item: Any) -> str:
    if item is None:
        return "NULL"
    elif isinstance(item, str):
        return f"'{''.join(ESCAPE_CHARS_MAP.get(c, c) for c in item)}'"
    elif isinstance(item, bool):
        return str(item)
    elif isinstance(item, (int, float)):
        return str(item)
    else:
        raise FlyqlError(f"unsupported type for escape_param: {type(item).__name__}")


def is_number(value: Any) -> bool:
    try:
        float(value)
    except (ValueError, TypeError):
        try:
            int(value)
        except (ValueError, TypeError):
            return False
        else:
            return True
    else:
        return True


def prepare_like_pattern_value(value: str) -> Tuple[bool, str]:
    pattern_found = False
    new_value = ""
    i = 0
    while i < len(value):
        char = value[i]
        if char == LIKE_PATTERN_CHAR:
            if i > 0 and value[i - 1] == "\\":
                new_value += LIKE_PATTERN_CHAR
            else:
                new_value += SQL_LIKE_PATTERN_CHAR
                pattern_found = True
        elif char == SQL_LIKE_PATTERN_CHAR:
            pattern_found = True
            new_value += "\\"
            new_value += SQL_LIKE_PATTERN_CHAR
        elif char == "\\" and i + 1 < len(value) and value[i + 1] == LIKE_PATTERN_CHAR:
            new_value += "\\"
        else:
            new_value += char
        i += 1
    return pattern_found, new_value


def truthy_expression_to_sql(
    expression: Expression, fields: Mapping[str, Field]
) -> str:
    """Generate SQL for truthy check (non-falsy value).

    Type-aware truthy checks:
    - String: field IS NOT NULL AND field != ''
    - Int/Float: field IS NOT NULL AND field != 0
    - Bool: field (ClickHouse supports boolean expressions directly)
    - Date: field IS NOT NULL
    """
    field_name = expression.key.segments[0]
    if field_name not in fields:
        raise FlyqlError(f"unknown field: {field_name}")

    field = fields[field_name]

    if expression.key.is_segmented:
        if field.jsonstring:
            json_path = expression.key.segments[1:]
            json_path_str = ", ".join([escape_param(x) for x in json_path])
            return (
                f"(JSONHas({field.name}, {json_path_str}) AND "
                f"JSONExtractString({field.name}, {json_path_str}) != '')"
            )
        elif field.is_json:
            json_path = expression.key.segments[1:]
            for part in json_path:
                validate_json_path_part(part)
            json_path_str = ".".join(f"`{part}`" for part in json_path)
            return f"({field.name}.{json_path_str} IS NOT NULL)"
        elif field.is_map:
            map_key = ":".join(expression.key.segments[1:])
            escaped_map_key = escape_param(map_key)
            return (
                f"(mapContains({field.name}, {escaped_map_key}) AND "
                f"{field.name}[{escaped_map_key}] != '')"
            )
        elif field.is_array:
            array_index_str = ":".join(expression.key.segments[1:])
            try:
                array_index = int(array_index_str)
            except Exception as err:
                raise FlyqlError(
                    f"invalid array index, expected number: {array_index_str}"
                ) from err
            return (
                f"(length({field.name}) >= {array_index} AND "
                f"{field.name}[{array_index}] != '')"
            )
        else:
            raise FlyqlError("path search for unsupported field type")
    else:
        # Simple field - type-aware truthy check
        if field.normalized_type == NORMALIZED_TYPE_BOOL:
            return field.name
        elif field.normalized_type == NORMALIZED_TYPE_STRING:
            return f"({field.name} IS NOT NULL AND {field.name} != '')"
        elif field.normalized_type in (NORMALIZED_TYPE_INT, NORMALIZED_TYPE_FLOAT):
            return f"({field.name} IS NOT NULL AND {field.name} != 0)"
        elif field.normalized_type == NORMALIZED_TYPE_DATE:
            return f"({field.name} IS NOT NULL)"
        else:
            # Fallback for other types - just check not null
            return f"({field.name} IS NOT NULL)"


def falsy_expression_to_sql(expression: Expression, fields: Mapping[str, Field]) -> str:
    """Generate SQL for falsy check (null or falsy value).

    Type-aware falsy checks (negation of truthy):
    - String: field IS NULL OR field = ''
    - Int/Float: field IS NULL OR field = 0
    - Bool: NOT field (handles NULL correctly in ClickHouse)
    - Date: field IS NULL
    """
    field_name = expression.key.segments[0]
    if field_name not in fields:
        raise FlyqlError(f"unknown field: {field_name}")

    field = fields[field_name]

    if expression.key.is_segmented:
        if field.jsonstring:
            json_path = expression.key.segments[1:]
            json_path_str = ", ".join([escape_param(x) for x in json_path])
            return (
                f"(NOT JSONHas({field.name}, {json_path_str}) OR "
                f"JSONExtractString({field.name}, {json_path_str}) = '')"
            )
        elif field.is_json:
            json_path = expression.key.segments[1:]
            for part in json_path:
                validate_json_path_part(part)
            json_path_str = ".".join(f"`{part}`" for part in json_path)
            return f"({field.name}.{json_path_str} IS NULL)"
        elif field.is_map:
            map_key = ":".join(expression.key.segments[1:])
            escaped_map_key = escape_param(map_key)
            return (
                f"(NOT mapContains({field.name}, {escaped_map_key}) OR "
                f"{field.name}[{escaped_map_key}] = '')"
            )
        elif field.is_array:
            array_index_str = ":".join(expression.key.segments[1:])
            try:
                array_index = int(array_index_str)
            except Exception as err:
                raise FlyqlError(
                    f"invalid array index, expected number: {array_index_str}"
                ) from err
            return (
                f"(length({field.name}) < {array_index} OR "
                f"{field.name}[{array_index}] = '')"
            )
        else:
            raise FlyqlError("path search for unsupported field type")
    else:
        # Simple field - type-aware falsy check
        if field.normalized_type == NORMALIZED_TYPE_BOOL:
            return f"NOT {field.name}"
        elif field.normalized_type == NORMALIZED_TYPE_STRING:
            return f"({field.name} IS NULL OR {field.name} = '')"
        elif field.normalized_type in (NORMALIZED_TYPE_INT, NORMALIZED_TYPE_FLOAT):
            return f"({field.name} IS NULL OR {field.name} = 0)"
        elif field.normalized_type == NORMALIZED_TYPE_DATE:
            return f"({field.name} IS NULL)"
        else:
            # Fallback for other types - just check null
            return f"({field.name} IS NULL)"


def in_expression_to_sql(expression: Expression, fields: Mapping[str, Field]) -> str:
    field_name = expression.key.segments[0]
    if field_name not in fields:
        raise FlyqlError(f"unknown field: {field_name}")

    field = fields[field_name]
    is_not_in = expression.operator == Operator.NOT_IN.value

    if not expression.values:
        return "1" if is_not_in else "0"

    if field.normalized_type is not None and not expression.key.is_segmented:
        validate_in_list_types(expression.values, field.normalized_type)

    values_sql = ", ".join(escape_param(v) for v in expression.values)
    sql_op = "NOT IN" if is_not_in else "IN"

    if expression.key.is_segmented:
        if field.is_json:
            json_path = expression.key.segments[1:]
            for part in json_path:
                validate_json_path_part(part)
            json_path_str = ".".join(f"$.{part}" for part in json_path)
            return (
                f"JSON_VALUE({field.name}, '{json_path_str}') {sql_op} ({values_sql})"
            )
        elif field.jsonstring:
            json_path = expression.key.segments[1:]
            json_path_str = ", ".join([escape_param(x) for x in json_path])
            return f"JSONExtractString({field.name}, {json_path_str}) {sql_op} ({values_sql})"
        elif field.is_map:
            map_key = ":".join(expression.key.segments[1:])
            escaped_map_key = escape_param(map_key)
            return f"{field.name}[{escaped_map_key}] {sql_op} ({values_sql})"
        elif field.is_array:
            array_index_str = ":".join(expression.key.segments[1:])
            try:
                array_index = int(array_index_str)
            except Exception as err:
                raise FlyqlError(
                    f"invalid array index, expected number: {array_index_str}"
                ) from err
            return f"{field.name}[{array_index}] {sql_op} ({values_sql})"
        else:
            raise FlyqlError("path search for unsupported field type")
    else:
        return f"{field.name} {sql_op} ({values_sql})"


def expression_to_sql(expression: Expression, fields: Mapping[str, Field]) -> str:
    if expression.operator == Operator.TRUTHY.value:
        return truthy_expression_to_sql(expression, fields)

    if expression.operator in (Operator.IN.value, Operator.NOT_IN.value):
        return in_expression_to_sql(expression, fields)

    validate_operator(expression.operator)
    text = ""

    if expression.key.is_segmented:
        reverse_operator = ""
        if expression.operator == Operator.NOT_REGEX.value:
            reverse_operator = "not "
        func = OPERATOR_TO_CLICKHOUSE_FUNC[expression.operator]
        field_name = expression.key.segments[0]
        if field_name not in fields:
            raise FlyqlError(f"unknown field: {field_name}")
        field = fields[field_name]

        if field.normalized_type is not None:
            validate_operation(
                expression.value, field.normalized_type, expression.operator
            )

        if field.jsonstring:
            json_path = expression.key.segments[1:]
            json_path_str = ", ".join([escape_param(x) for x in json_path])

            str_value = escape_param(expression.value)
            multi_if = [
                f"JSONType({field.name}, {json_path_str}) = 'String', {func}(JSONExtractString({field.name}, {json_path_str}), {str_value})"  # pylint: disable=line-too-long
            ]
            if is_number(expression.value) and expression.operator not in [
                Operator.REGEX.value,
                Operator.NOT_REGEX.value,
            ]:
                multi_if.extend(
                    [
                        f"JSONType({field.name}, {json_path_str}) = 'Int64', {func}(JSONExtractInt({field.name}, {json_path_str}), {expression.value})",  # pylint: disable=line-too-long
                        f"JSONType({field.name}, {json_path_str}) = 'Double', {func}(JSONExtractFloat({field.name}, {json_path_str}), {expression.value})",  # pylint: disable=line-too-long
                        f"JSONType({field.name}, {json_path_str}) = 'Bool', {func}(JSONExtractBool({field.name}, {json_path_str}), {expression.value})",  # pylint: disable=line-too-long
                    ]
                )
            multi_if.append("0")
            multi_if_str = ",".join(multi_if)
            text = f"{reverse_operator}multiIf({multi_if_str})"
        elif field.is_json:
            json_path = expression.key.segments[1:]
            for part in json_path:
                validate_json_path_part(part)
            json_path_str = ".".join(f"`{part}`" for part in json_path)
            value = escape_param(expression.value)
            text = f"{field.name}.{json_path_str} {expression.operator} {value}"
        elif field.is_map:
            map_key = ":".join(expression.key.segments[1:])
            escaped_map_key = escape_param(map_key)
            value = escape_param(expression.value)
            text = f"{reverse_operator}{func}({field.name}[{escaped_map_key}], {value})"
        elif field.is_array:
            array_index_str = ":".join(expression.key.segments[1:])
            try:
                array_index = int(array_index_str)
            except Exception as err:
                raise FlyqlError(
                    f"invalid array index, expected number: {array_index_str}"
                ) from err
            value = escape_param(expression.value)
            text = f"{reverse_operator}{func}({field.name}[{array_index}], {value})"
        else:
            raise FlyqlError("path search for unsupported field type")

    else:
        field_name = expression.key.segments[0]
        if field_name not in fields:
            raise FlyqlError(f"unknown field: {field_name}")

        field = fields[field_name]

        if field.values and str(expression.value) not in field.values:
            raise FlyqlError(f"unknown value: {expression.value}")

        if field.normalized_type is not None:
            validate_operation(
                expression.value, field.normalized_type, expression.operator
            )

        if expression.operator == Operator.REGEX.value:
            value = escape_param(str(expression.value))
            text = f"match({field.name}, {value})"
        elif expression.operator == Operator.NOT_REGEX.value:
            value = escape_param(str(expression.value))
            text = f"not match({field.name}, {value})"
        elif expression.operator in [Operator.EQUALS.value, Operator.NOT_EQUALS.value]:
            operator = expression.operator
            is_like_pattern, value = prepare_like_pattern_value(str(expression.value))
            value = escape_param(value)
            if is_like_pattern:
                if expression.operator == Operator.EQUALS.value:
                    operator = "LIKE"
                else:
                    operator = "NOT LIKE"
            text = f"{field.name} {operator} {value}"
        else:
            if isinstance(expression.value, (int, float)):
                value = str(expression.value)
            else:
                value = escape_param(str(expression.value))
            text = f"{field.name} {expression.operator} {value}"
    return text


def to_sql(root: Node, fields: Mapping[str, Field]) -> str:
    """
    Returns ClickHouse WHERE clause for given tree and fields
    """
    left = ""
    right = ""
    text = ""
    is_negated = getattr(root, "negated", False)

    if root.expression is not None:
        # For negated truthy expressions, generate falsy SQL directly
        if is_negated and root.expression.operator == Operator.TRUTHY.value:
            text = falsy_expression_to_sql(expression=root.expression, fields=fields)
            is_negated = False  # Already handled
        else:
            text = expression_to_sql(expression=root.expression, fields=fields)

    if root.left is not None:
        left = to_sql(root=root.left, fields=fields)

    if root.right is not None:
        right = to_sql(root=root.right, fields=fields)

    if len(left) > 0 and len(right) > 0:
        validate_bool_operator(root.bool_operator)
        text = f"({left} {root.bool_operator} {right})"
    elif len(left) > 0:
        text = left
    elif len(right) > 0:
        text = right

    if is_negated and text:
        text = f"NOT ({text})"

    return text
