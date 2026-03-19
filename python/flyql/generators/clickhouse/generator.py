import re
from dataclasses import dataclass, field
from typing import List, Mapping, Tuple, Any

from flyql.core.exceptions import FlyqlError
from flyql.core.expression import Expression
from flyql.core.key import Key, parse_key
from flyql.core.constants import (
    Operator,
    VALID_KEY_VALUE_OPERATORS,
    VALID_BOOL_OPERATORS,
)
from flyql.core.tree import Node

from flyql.generators.clickhouse.column import Column
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
    expression: Expression, columns: Mapping[str, Column]
) -> str:
    """Generate SQL for truthy check (non-falsy value).

    Type-aware truthy checks:
    - String: column IS NOT NULL AND column != ''
    - Int/Float: column IS NOT NULL AND column != 0
    - Bool: column (ClickHouse supports boolean expressions directly)
    - Date: column IS NOT NULL
    """
    column_name = expression.key.segments[0]
    if column_name not in columns:
        raise FlyqlError(f"unknown column: {column_name}")

    column = columns[column_name]

    if expression.key.is_segmented:
        if column.jsonstring:
            json_path = expression.key.segments[1:]
            json_path_str = ", ".join([escape_param(x) for x in json_path])
            return (
                f"(JSONHas({column.name}, {json_path_str}) AND "
                f"JSONExtractString({column.name}, {json_path_str}) != '')"
            )
        elif column.is_json:
            json_path = expression.key.segments[1:]
            for part in json_path:
                validate_json_path_part(part)
            json_path_str = ".".join(f"`{part}`" for part in json_path)
            return f"({column.name}.{json_path_str} IS NOT NULL)"
        elif column.is_map:
            map_key = ".".join(expression.key.segments[1:])
            escaped_map_key = escape_param(map_key)
            return (
                f"(mapContains({column.name}, {escaped_map_key}) AND "
                f"{column.name}[{escaped_map_key}] != '')"
            )
        elif column.is_array:
            array_index_str = ".".join(expression.key.segments[1:])
            try:
                array_index = int(array_index_str)
            except Exception as err:
                raise FlyqlError(
                    f"invalid array index, expected number: {array_index_str}"
                ) from err
            return (
                f"(length({column.name}) >= {array_index} AND "
                f"{column.name}[{array_index}] != '')"
            )
        else:
            raise FlyqlError("path search for unsupported column type")
    else:
        if column.jsonstring:
            return (
                f"({column.name} IS NOT NULL AND {column.name} != '' AND "
                f"JSONLength({column.name}) > 0)"
            )
        elif column.normalized_type == NORMALIZED_TYPE_BOOL:
            return column.name
        elif column.normalized_type == NORMALIZED_TYPE_STRING:
            return f"({column.name} IS NOT NULL AND {column.name} != '')"
        elif column.normalized_type in (NORMALIZED_TYPE_INT, NORMALIZED_TYPE_FLOAT):
            return f"({column.name} IS NOT NULL AND {column.name} != 0)"
        elif column.normalized_type == NORMALIZED_TYPE_DATE:
            return f"({column.name} IS NOT NULL)"
        else:
            return f"({column.name} IS NOT NULL)"


def falsy_expression_to_sql(
    expression: Expression, columns: Mapping[str, Column]
) -> str:
    """Generate SQL for falsy check (null or falsy value).

    Type-aware falsy checks (negation of truthy):
    - String: column IS NULL OR column = ''
    - Int/Float: column IS NULL OR column = 0
    - Bool: NOT column (handles NULL correctly in ClickHouse)
    - Date: column IS NULL
    """
    column_name = expression.key.segments[0]
    if column_name not in columns:
        raise FlyqlError(f"unknown column: {column_name}")

    column = columns[column_name]

    if expression.key.is_segmented:
        if column.jsonstring:
            json_path = expression.key.segments[1:]
            json_path_str = ", ".join([escape_param(x) for x in json_path])
            return (
                f"(NOT JSONHas({column.name}, {json_path_str}) OR "
                f"JSONExtractString({column.name}, {json_path_str}) = '')"
            )
        elif column.is_json:
            json_path = expression.key.segments[1:]
            for part in json_path:
                validate_json_path_part(part)
            json_path_str = ".".join(f"`{part}`" for part in json_path)
            return f"({column.name}.{json_path_str} IS NULL)"
        elif column.is_map:
            map_key = ".".join(expression.key.segments[1:])
            escaped_map_key = escape_param(map_key)
            return (
                f"(NOT mapContains({column.name}, {escaped_map_key}) OR "
                f"{column.name}[{escaped_map_key}] = '')"
            )
        elif column.is_array:
            array_index_str = ".".join(expression.key.segments[1:])
            try:
                array_index = int(array_index_str)
            except Exception as err:
                raise FlyqlError(
                    f"invalid array index, expected number: {array_index_str}"
                ) from err
            return (
                f"(length({column.name}) < {array_index} OR "
                f"{column.name}[{array_index}] = '')"
            )
        else:
            raise FlyqlError("path search for unsupported column type")
    else:
        if column.jsonstring:
            return (
                f"({column.name} IS NULL OR {column.name} = '' OR "
                f"JSONLength({column.name}) = 0)"
            )
        elif column.normalized_type == NORMALIZED_TYPE_BOOL:
            return f"NOT {column.name}"
        elif column.normalized_type == NORMALIZED_TYPE_STRING:
            return f"({column.name} IS NULL OR {column.name} = '')"
        elif column.normalized_type in (NORMALIZED_TYPE_INT, NORMALIZED_TYPE_FLOAT):
            return f"({column.name} IS NULL OR {column.name} = 0)"
        elif column.normalized_type == NORMALIZED_TYPE_DATE:
            return f"({column.name} IS NULL)"
        else:
            return f"({column.name} IS NULL)"


def in_expression_to_sql(expression: Expression, columns: Mapping[str, Column]) -> str:
    column_name = expression.key.segments[0]
    if column_name not in columns:
        raise FlyqlError(f"unknown column: {column_name}")

    column = columns[column_name]
    is_not_in = expression.operator == Operator.NOT_IN.value

    if not expression.values:
        return "1" if is_not_in else "0"

    if column.normalized_type is not None and not expression.key.is_segmented:
        validate_in_list_types(expression.values, column.normalized_type)

    values_sql = ", ".join(escape_param(v) for v in expression.values)
    sql_op = "NOT IN" if is_not_in else "IN"

    if expression.key.is_segmented:
        if column.is_json:
            json_path = expression.key.segments[1:]
            for part in json_path:
                validate_json_path_part(part)
            json_path_str = ".".join(f"$.{part}" for part in json_path)
            return (
                f"JSON_VALUE({column.name}, '{json_path_str}') {sql_op} ({values_sql})"
            )
        elif column.jsonstring:
            json_path = expression.key.segments[1:]
            json_path_str = ", ".join([escape_param(x) for x in json_path])
            return f"JSONExtractString({column.name}, {json_path_str}) {sql_op} ({values_sql})"
        elif column.is_map:
            map_key = ".".join(expression.key.segments[1:])
            escaped_map_key = escape_param(map_key)
            return f"{column.name}[{escaped_map_key}] {sql_op} ({values_sql})"
        elif column.is_array:
            array_index_str = ".".join(expression.key.segments[1:])
            try:
                array_index = int(array_index_str)
            except Exception as err:
                raise FlyqlError(
                    f"invalid array index, expected number: {array_index_str}"
                ) from err
            return f"{column.name}[{array_index}] {sql_op} ({values_sql})"
        else:
            raise FlyqlError("path search for unsupported column type")
    else:
        return f"{column.name} {sql_op} ({values_sql})"


def expression_to_sql(expression: Expression, columns: Mapping[str, Column]) -> str:
    if expression.operator == Operator.TRUTHY.value:
        return truthy_expression_to_sql(expression, columns)

    if expression.operator in (Operator.IN.value, Operator.NOT_IN.value):
        return in_expression_to_sql(expression, columns)

    validate_operator(expression.operator)
    text = ""

    if expression.key.is_segmented:
        reverse_operator = ""
        if expression.operator == Operator.NOT_REGEX.value:
            reverse_operator = "not "
        func = OPERATOR_TO_CLICKHOUSE_FUNC[expression.operator]
        column_name = expression.key.segments[0]
        if column_name not in columns:
            raise FlyqlError(f"unknown column: {column_name}")
        column = columns[column_name]

        if column.normalized_type is not None:
            validate_operation(
                expression.value, column.normalized_type, expression.operator
            )

        if column.jsonstring:
            json_path = expression.key.segments[1:]
            json_path_str = ", ".join([escape_param(x) for x in json_path])

            str_value = escape_param(expression.value)
            multi_if = [
                f"JSONType({column.name}, {json_path_str}) = 'String', {func}(JSONExtractString({column.name}, {json_path_str}), {str_value})"  # pylint: disable=line-too-long
            ]
            if is_number(expression.value) and expression.operator not in [
                Operator.REGEX.value,
                Operator.NOT_REGEX.value,
            ]:
                multi_if.extend(
                    [
                        f"JSONType({column.name}, {json_path_str}) = 'Int64', {func}(JSONExtractInt({column.name}, {json_path_str}), {expression.value})",  # pylint: disable=line-too-long
                        f"JSONType({column.name}, {json_path_str}) = 'Double', {func}(JSONExtractFloat({column.name}, {json_path_str}), {expression.value})",  # pylint: disable=line-too-long
                        f"JSONType({column.name}, {json_path_str}) = 'Bool', {func}(JSONExtractBool({column.name}, {json_path_str}), {expression.value})",  # pylint: disable=line-too-long
                    ]
                )
            multi_if.append("0")
            multi_if_str = ",".join(multi_if)
            text = f"{reverse_operator}multiIf({multi_if_str})"
        elif column.is_json:
            json_path = expression.key.segments[1:]
            for part in json_path:
                validate_json_path_part(part)
            json_path_str = ".".join(f"`{part}`" for part in json_path)
            value = escape_param(expression.value)
            text = f"{column.name}.{json_path_str} {expression.operator} {value}"
        elif column.is_map:
            map_key = ".".join(expression.key.segments[1:])
            escaped_map_key = escape_param(map_key)
            value = escape_param(expression.value)
            text = (
                f"{reverse_operator}{func}({column.name}[{escaped_map_key}], {value})"
            )
        elif column.is_array:
            array_index_str = ".".join(expression.key.segments[1:])
            try:
                array_index = int(array_index_str)
            except Exception as err:
                raise FlyqlError(
                    f"invalid array index, expected number: {array_index_str}"
                ) from err
            value = escape_param(expression.value)
            text = f"{reverse_operator}{func}({column.name}[{array_index}], {value})"
        else:
            raise FlyqlError("path search for unsupported column type")

    else:
        column_name = expression.key.segments[0]
        if column_name not in columns:
            raise FlyqlError(f"unknown column: {column_name}")

        column = columns[column_name]

        if column.values and str(expression.value) not in column.values:
            raise FlyqlError(f"unknown value: {expression.value}")

        if column.normalized_type is not None:
            validate_operation(
                expression.value, column.normalized_type, expression.operator
            )

        if expression.operator == Operator.REGEX.value:
            value = escape_param(str(expression.value))
            text = f"match({column.name}, {value})"
        elif expression.operator == Operator.NOT_REGEX.value:
            value = escape_param(str(expression.value))
            text = f"not match({column.name}, {value})"
        elif expression.operator in [Operator.EQUALS.value, Operator.NOT_EQUALS.value]:
            operator = expression.operator
            is_like_pattern, value = prepare_like_pattern_value(str(expression.value))
            value = escape_param(value)
            if is_like_pattern:
                if expression.operator == Operator.EQUALS.value:
                    operator = "LIKE"
                else:
                    operator = "NOT LIKE"
            text = f"{column.name} {operator} {value}"
        else:
            if isinstance(expression.value, (int, float)):
                value = str(expression.value)
            else:
                value = escape_param(str(expression.value))
            text = f"{column.name} {expression.operator} {value}"
    return text


def to_sql(root: Node, columns: Mapping[str, Column]) -> str:
    """
    Returns ClickHouse WHERE clause for given tree and columns
    """
    left = ""
    right = ""
    text = ""
    is_negated = getattr(root, "negated", False)

    if root.expression is not None:
        # For negated truthy expressions, generate falsy SQL directly
        if is_negated and root.expression.operator == Operator.TRUTHY.value:
            text = falsy_expression_to_sql(expression=root.expression, columns=columns)
            is_negated = False  # Already handled
        else:
            text = expression_to_sql(expression=root.expression, columns=columns)

    if root.left is not None:
        left = to_sql(root=root.left, columns=columns)

    if root.right is not None:
        right = to_sql(root=root.right, columns=columns)

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


# SELECT clause generation

VALID_ALIAS_PATTERN = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_.]*$")


@dataclass
class SelectColumn:
    key: Key
    alias: str
    column: Column
    sql_expr: str


@dataclass
class SelectResult:
    columns: List[SelectColumn] = field(default_factory=list)
    sql: str = ""


def _parse_raw_select_columns(text: str) -> List[Tuple[str, str]]:
    parts = text.split(",")
    result: List[Tuple[str, str]] = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        lower = part.lower()
        idx = lower.find(" as ")
        if idx >= 0:
            name = part[:idx].strip()
            alias = part[idx + 4 :].strip()
        else:
            name = part
            alias = ""
        if not name:
            raise FlyqlError("empty column name")
        result.append((name, alias))
    return result


def _resolve_column(
    key: Key, columns: Mapping[str, Column]
) -> Tuple[Column, List[str]]:
    segments = key.segments
    for i in range(len(segments), 0, -1):
        candidate_key = ".".join(segments[:i])
        if candidate_key in columns:
            return columns[candidate_key], segments[i:]
    raise FlyqlError(f"unknown column: {key.raw}")


def _build_select_expr(column: Column, path: List[str]) -> str:
    if not path:
        return column.name

    if column.is_json:
        for part in path:
            validate_json_path_part(part)
        path_parts = [f"`{part}`" for part in path]
        return f"{column.name}.{'.'.join(path_parts)}"

    if column.jsonstring:
        json_path_parts = [escape_param(p) for p in path]
        return f"JSONExtractString({column.name}, {', '.join(json_path_parts)})"

    if column.is_map:
        map_key = ".".join(path)
        escaped_key = escape_param(map_key)
        return f"{column.name}[{escaped_key}]"

    if column.is_array:
        index_str = ".".join(path)
        try:
            index = int(index_str)
        except ValueError as err:
            raise FlyqlError(
                f"invalid array index, expected number: {index_str}"
            ) from err
        return f"{column.name}[{index}]"

    raise FlyqlError(f"path access on non-composite column type: {column.name}")


def generate_select(text: str, columns: Mapping[str, Column]) -> SelectResult:
    """Generate a ClickHouse SELECT clause from a column expression string."""
    raws = _parse_raw_select_columns(text)
    select_columns: List[SelectColumn] = []
    exprs: List[str] = []

    for name, alias in raws:
        key = parse_key(name)
        column, path = _resolve_column(key, columns)

        sql_expr = _build_select_expr(column, path)

        if alias:
            if not VALID_ALIAS_PATTERN.match(alias):
                raise FlyqlError(f"invalid alias: {alias}")
            quoted_alias = f"`{alias}`" if "." in alias else alias
            sql_expr = f"{sql_expr} AS {quoted_alias}"
        elif path:
            alias = name
            if not VALID_ALIAS_PATTERN.match(alias):
                raise FlyqlError(f"invalid alias: {alias}")
            quoted_alias = f"`{alias}`" if "." in alias else alias
            sql_expr = f"{sql_expr} AS {quoted_alias}"

        select_columns.append(
            SelectColumn(key=key, alias=alias, column=column, sql_expr=sql_expr)
        )
        exprs.append(sql_expr)

    return SelectResult(columns=select_columns, sql=", ".join(exprs))
