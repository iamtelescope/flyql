import re
from dataclasses import dataclass, field
from typing import List, Mapping, Optional, Tuple, Any

from flyql.core.exceptions import FlyqlError
from flyql.core.expression import Expression
from flyql.core.key import Key, parse_key
from flyql.core.constants import (
    Operator,
    VALID_KEY_VALUE_OPERATORS,
    VALID_BOOL_OPERATORS,
)
from flyql.core.tree import Node

from flyql.generators.starrocks.column import Column
from flyql.generators.starrocks.helpers import (
    validate_operation,
    validate_in_list_types,
)
from flyql.generators.starrocks.constants import (
    NORMALIZED_TYPE_STRING,
    NORMALIZED_TYPE_INT,
    NORMALIZED_TYPE_FLOAT,
    NORMALIZED_TYPE_BOOL,
    NORMALIZED_TYPE_DATE,
)
from flyql.generators.transformer_helpers import (
    apply_transformer_sql,
    validate_transformer_chain,
)
from flyql.transformers.registry import TransformerRegistry

OPERATOR_TO_STARROCKS_OPERATOR = {
    Operator.EQUALS.value: "=",
    Operator.NOT_EQUALS.value: "!=",
    Operator.REGEX.value: "regexp",
    Operator.NOT_REGEX.value: "regexp",
    Operator.GREATER_THAN.value: ">",
    Operator.LOWER_THAN.value: "<",
    Operator.GREATER_OR_EQUALS_THAN.value: ">=",
    Operator.LOWER_OR_EQUALS_THAN.value: "<=",
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
        return "'%s'" % "".join(ESCAPE_CHARS_MAP.get(c, c) for c in item)
    elif isinstance(item, bool):
        return str(item)
    elif isinstance(item, (int, float)):
        return str(item)
    else:
        raise FlyqlError(f"unsupported type for escape_param: {type(item).__name__}")


def quote_json_path_part(part: str) -> str:
    return "'\"%s\"'" % "".join(ESCAPE_CHARS_MAP.get(c, c) for c in part)


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
        if column.is_json:
            json_path = expression.key.segments[1:]
            for part in json_path:
                validate_json_path_part(part)
            json_path_str = "->".join(f"{quote_json_path_part(x)}" for x in json_path)
            return f"(`{column.name}`->{json_path_str} IS NOT NULL)"
        elif column.is_map:
            map_key = ".".join(expression.key.segments[1:])
            escaped_map_key = escape_param(map_key)
            return (
                f"(element_at(`{column.name}`, {escaped_map_key}) IS NOT NULL AND "
                f"`{column.name}`[{escaped_map_key}] != '')"
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
                f"(array_length(`{column.name}`) >= {array_index} AND "
                f"`{column.name}`[{array_index}] != '')"
            )
        elif column.is_struct:
            struct_path = expression.key.segments[1:]
            struct_column = "`.`".join(struct_path)
            return (
                f"`{column.name}`.`{struct_column}` IS NOT NULL AND "
                f"`{column.name}`.`{struct_column}` != ''"
            )
        elif column.jsonstring:
            json_path = expression.key.segments[1:]
            json_path_str = "->".join(f"{quote_json_path_part(x)}" for x in json_path)
            return (
                f"(json_exists(parse_json(`{column.name}`), {json_path_str}) AND "
                f"parse_json(`{column.name}`)->{json_path_str} != '')"
            )
        else:
            raise FlyqlError("path search for unsupported column type")
    else:
        if column.jsonstring:
            if column.is_map or column.is_struct:
                return (
                    f"(`{column.name}` IS NOT NULL AND "
                    f"json_length(to_json(`{column.name}`)) > 0)"
                )
            else:
                return (
                    f"(`{column.name}` IS NOT NULL AND `{column.name}` != '' AND "
                    f"json_length(`{column.name}`) > 0)"
                )
        elif column.normalized_type == NORMALIZED_TYPE_BOOL:
            return f"`{column.name}`"
        elif column.normalized_type == NORMALIZED_TYPE_STRING:
            return f"(`{column.name}` IS NOT NULL AND `{column.name}` != '')"
        elif column.normalized_type in (NORMALIZED_TYPE_INT, NORMALIZED_TYPE_FLOAT):
            return f"(`{column.name}` IS NOT NULL AND `{column.name}` != 0)"
        elif column.normalized_type == NORMALIZED_TYPE_DATE:
            return f"(`{column.name}` IS NOT NULL)"
        else:
            return f"(`{column.name}` IS NOT NULL)"


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
        if column.is_json:
            json_path = expression.key.segments[1:]
            for part in json_path:
                validate_json_path_part(part)
            json_path_str = "->".join(f"{quote_json_path_part(x)}" for x in json_path)
            return f"(`{column.name}`->{json_path_str} IS NULL)"
        elif column.is_map:
            map_key = ".".join(expression.key.segments[1:])
            escaped_map_key = escape_param(map_key)
            return (
                f"(element_at(`{column.name}`, '{escaped_map_key}') IS NULL OR "
                f"`{column.name}`['{escaped_map_key}'] = '')"
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
                f"(array_length(`{column.name}`) < {array_index} OR "
                f"`{column.name}`[{array_index}] = '')"
            )
        elif column.is_struct:
            struct_path = expression.key.segments[1:]
            struct_column = "`.`".join(struct_path)
            return (
                f"`{column.name}`.`{struct_column}` IS NULL OR "
                f"`{column.name}`.`{struct_column}` = ''"
            )
        elif column.jsonstring:
            json_path = expression.key.segments[1:]
            json_path_str = "->".join(f"{quote_json_path_part(x)}" for x in json_path)
            return (
                f"(NOT json_exists(parse_json(`{column.name}`), '$.{json_path_str}') OR "
                f"parse_json(`{column.name}`)->{json_path_str} = '')"
            )
        else:
            raise FlyqlError("path search for unsupported column type")
    else:
        if column.jsonstring:
            if column.is_map or column.is_struct:
                return (
                    f"(`{column.name}` IS NULL OR "
                    f"json_length(to_json(`{column.name}`)) = 0)"
                )
            else:
                return (
                    f"(`{column.name}` IS NULL OR `{column.name}` = '' OR "
                    f"json_length(`{column.name}`) = 0)"
                )
        elif column.normalized_type == NORMALIZED_TYPE_BOOL:
            return f"NOT `{column.name}`"
        elif column.normalized_type == NORMALIZED_TYPE_STRING:
            return f"(`{column.name}` IS NULL OR `{column.name}` = '')"
        elif column.normalized_type in (NORMALIZED_TYPE_INT, NORMALIZED_TYPE_FLOAT):
            return f"(`{column.name}` IS NULL OR `{column.name}` = 0)"
        elif column.normalized_type == NORMALIZED_TYPE_DATE:
            return f"(`{column.name}` IS NULL)"
        else:
            return f"(`{column.name}` IS NULL)"


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
            json_path_str = "->".join(f"{quote_json_path_part(x)}" for x in json_path)
            return f"`{column.name}`->{json_path_str} {sql_op} ({values_sql})"
        elif column.is_map:
            map_path = expression.key.segments[1:]
            map_key = "']['".join(map_path)
            return f"`{column.name}`['{map_key}'] {sql_op} ({values_sql})"
        elif column.is_array:
            array_index_str = ".".join(expression.key.segments[1:])
            try:
                array_index = int(array_index_str)
            except Exception as err:
                raise FlyqlError(
                    f"invalid array index, expected number: {array_index_str}"
                ) from err
            return f"`{column.name}`[{array_index}] {sql_op} ({values_sql})"
        elif column.is_struct:
            struct_path = expression.key.segments[1:]
            struct_column = "`.`".join(struct_path)
            return f"`{column.name}`.`{struct_column}` {sql_op} ({values_sql})"
        elif column.jsonstring:
            json_path = expression.key.segments[1:]
            json_path_str = "->".join(f"{quote_json_path_part(x)}" for x in json_path)
            return (
                f"parse_json(`{column.name}`)->{json_path_str} {sql_op} ({values_sql})"
            )
        else:
            raise FlyqlError("path search for unsupported column type")
    else:
        return f"`{column.name}` {sql_op} ({values_sql})"


def has_expression_to_sql(expression: Expression, columns: Mapping[str, Column]) -> str:
    column_name = expression.key.segments[0]
    if column_name not in columns:
        raise FlyqlError(f"unknown column: {column_name}")

    column = columns[column_name]
    is_not_has = expression.operator == Operator.NOT_HAS.value
    value = escape_param(expression.value)

    if expression.key.is_segmented:
        if column.is_json:
            json_path = expression.key.segments[1:]
            for part in json_path:
                validate_json_path_part(part)
            json_path_str = "->".join(quote_json_path_part(x) for x in json_path)
            leaf_expr = f"`{column.name}`->{json_path_str}"
            if is_not_has:
                return f"INSTR(cast({leaf_expr} as string), {value}) = 0"
            return f"INSTR(cast({leaf_expr} as string), {value}) > 0"
        elif column.is_map:
            map_path = expression.key.segments[1:]
            escaped_parts = [escape_param(part) for part in map_path]
            map_key = "][".join(escaped_parts)
            leaf_expr = f"`{column.name}`[{map_key}]"
            if is_not_has:
                return f"INSTR({leaf_expr}, {value}) = 0"
            return f"INSTR({leaf_expr}, {value}) > 0"
        elif column.is_array:
            array_index_str = ".".join(expression.key.segments[1:])
            try:
                array_index = int(array_index_str)
            except Exception as err:
                raise FlyqlError(
                    f"invalid array index, expected number: {array_index_str}"
                ) from err
            leaf_expr = f"`{column.name}`[{array_index}]"
            if is_not_has:
                return f"INSTR({leaf_expr}, {value}) = 0"
            return f"INSTR({leaf_expr}, {value}) > 0"
        elif column.is_struct:
            struct_path = expression.key.segments[1:]
            struct_column = "`.`".join(struct_path)
            leaf_expr = f"`{column.name}`.`{struct_column}`"
            if is_not_has:
                return f"INSTR({leaf_expr}, {value}) = 0"
            return f"INSTR({leaf_expr}, {value}) > 0"
        elif column.jsonstring:
            json_path = expression.key.segments[1:]
            for part in json_path:
                validate_json_path_part(part)
            json_path_str = "->".join(quote_json_path_part(x) for x in json_path)
            leaf_expr = f"parse_json(`{column.name}`)->{json_path_str}"
            if is_not_has:
                return f"INSTR(cast({leaf_expr} as string), {value}) = 0"
            return f"INSTR(cast({leaf_expr} as string), {value}) > 0"
        else:
            raise FlyqlError("path search for unsupported column type")

    if column.is_array:
        if is_not_has:
            return f"NOT array_contains(`{column.name}`, {value})"
        return f"array_contains(`{column.name}`, {value})"
    elif column.is_map:
        if is_not_has:
            return f"NOT array_contains(map_keys(`{column.name}`), {value})"
        return f"array_contains(map_keys(`{column.name}`), {value})"
    elif column.is_json:
        if is_not_has:
            return f"NOT json_exists(`{column.name}`, concat('$.', {value}))"
        return f"json_exists(`{column.name}`, concat('$.', {value}))"
    elif column.normalized_type == NORMALIZED_TYPE_STRING:
        if is_not_has:
            return f"(`{column.name}` IS NULL OR INSTR(`{column.name}`, {value}) = 0)"
        return f"INSTR(`{column.name}`, {value}) > 0"
    else:
        raise FlyqlError(
            f"has operator is not supported for column type: {column.normalized_type}"
        )


def expression_to_sql(
    expression: Expression,
    columns: Mapping[str, Column],
    registry: Optional[TransformerRegistry] = None,
) -> str:
    if expression.operator == Operator.TRUTHY.value:
        return truthy_expression_to_sql(expression, columns)

    if expression.operator in (Operator.IN.value, Operator.NOT_IN.value):
        return in_expression_to_sql(expression, columns)

    if expression.operator in (Operator.HAS.value, Operator.NOT_HAS.value):
        return has_expression_to_sql(expression, columns)

    validate_operator(expression.operator)
    text = ""

    # TODO: support arbitrary nesting for map, array, struct types
    if expression.key.is_segmented:
        if expression.key.transformers:
            raise FlyqlError(
                "transformers on segmented (nested path) keys are not supported"
            )
        reverse_operator = ""
        if expression.operator == Operator.NOT_REGEX.value:
            reverse_operator = "not "
        operator = OPERATOR_TO_STARROCKS_OPERATOR[expression.operator]
        column_name = expression.key.segments[0]
        if column_name not in columns:
            raise FlyqlError(f"unknown column: {column_name}")
        column = columns[column_name]

        if column.normalized_type is not None:
            validate_operation(
                expression.value, column.normalized_type, expression.operator
            )

        # Although any column can be marked as jsonstring, and this can provide UI
        # benefits in Telescope, we cannot actually cast Map and Array columns to JSON
        # as we can in Clickhouse. Additionally, there is no benefit in casting a JSON
        # column to JSON again. Therefore, we only do jsonstring parsing for other
        # column types.
        if column.is_json:
            # Although `parse_json` works on a JSON column, it is more efficient to not use it
            # when we know the column is already the JSON type.
            json_path = expression.key.segments[1:]
            for part in json_path:
                validate_json_path_part(part)
            json_path_str = "->".join(f"{quote_json_path_part(x)}" for x in json_path)
            value = escape_param(expression.value)

            column_exp = f"`{column.name}`->{json_path_str}"

            if (
                expression.operator == Operator.REGEX.value
                or expression.operator == Operator.NOT_REGEX.value
            ):
                column_exp = f"cast({column_exp} as string)"
            text = f"{column_exp} {reverse_operator}{operator} {value}"
        elif column.is_map:
            map_path = expression.key.segments[1:]
            map_path = [escape_param(part) for part in map_path]
            map_key = "][".join(map_path)
            value = escape_param(expression.value)
            text = f"`{column.name}`[{map_key}] {reverse_operator}{operator} {value}"
        elif column.is_array:
            array_index_str = ".".join(expression.key.segments[1:])
            try:
                array_index = int(array_index_str)
            except Exception:
                raise FlyqlError(
                    f"invalid array index, expected number: {array_index_str}"
                )
            value = escape_param(expression.value)
            text = (
                f"`{column.name}`[{array_index}] {reverse_operator}{operator} {value}"
            )
        elif column.is_struct:
            struct_path = expression.key.segments[1:]
            struct_column = "`.`".join(struct_path)
            value = escape_param(expression.value)
            text = f"`{column.name}`.`{struct_column}` {reverse_operator}{operator} {value}"
        elif column.jsonstring:
            json_path = expression.key.segments[1:]
            for part in json_path:
                validate_json_path_part(part)
            json_path_str = "->".join(
                f"{quote_json_path_part(part)}" for part in json_path
            )
            value = escape_param(expression.value)

            column_exp = f"parse_json(`{column.name}`)->{json_path_str}"

            if (
                expression.operator == Operator.REGEX.value
                or expression.operator == Operator.NOT_REGEX.value
            ):
                column_exp = f"cast({column_exp} as string)"
            text = f"{column_exp} {reverse_operator}{operator} {value}"
        else:
            raise FlyqlError("path search for unsupported column type")

    else:
        column_name = expression.key.segments[0]
        if column_name not in columns:
            raise FlyqlError(f"unknown column: {column_name}")

        column = columns[column_name]

        if column.values and str(expression.value) not in column.values:
            raise FlyqlError(f"unknown value: {expression.value}")

        if column.normalized_type is not None and not expression.key.transformers:
            validate_operation(
                expression.value, column.normalized_type, expression.operator
            )

        col_ref = f"`{column.name}`"
        if expression.key.transformers:
            validate_transformer_chain(expression.key.transformers, registry=registry)
            col_ref = apply_transformer_sql(
                col_ref, expression.key.transformers, "starrocks", registry=registry
            )

        if expression.operator == Operator.REGEX.value:
            value = escape_param(str(expression.value))
            text = f"regexp({col_ref}, {value})"
        elif expression.operator == Operator.NOT_REGEX.value:
            value = escape_param(str(expression.value))
            text = f"not regexp({col_ref}, {value})"
        elif expression.operator in [Operator.EQUALS.value, Operator.NOT_EQUALS.value]:
            operator = expression.operator
            is_like_pattern, value = prepare_like_pattern_value(str(expression.value))
            value = escape_param(value)
            if is_like_pattern:
                if expression.operator == Operator.EQUALS.value:
                    operator = "LIKE"
                else:
                    operator = "NOT LIKE"
            text = f"{col_ref} {operator} {value}"
        else:
            if isinstance(expression.value, (int, float)):
                value = str(expression.value)
            else:
                value = escape_param(str(expression.value))
            text = f"{col_ref} {expression.operator} {value}"
    return text


def to_sql(
    root: Node,
    columns: Mapping[str, Column],
    registry: Optional[TransformerRegistry] = None,
) -> str:
    """
    Returns Starrocks WHERE clause for given tree and columns
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
            text = expression_to_sql(
                expression=root.expression, columns=columns, registry=registry
            )

    if root.left is not None:
        left = to_sql(root=root.left, columns=columns, registry=registry)

    if root.right is not None:
        right = to_sql(root=root.right, columns=columns, registry=registry)

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
        return f"`{column.name}`"

    if column.is_json:
        for part in path:
            validate_json_path_part(part)
        json_path_str = "->".join(quote_json_path_part(part) for part in path)
        return f"`{column.name}`->{json_path_str}"

    if column.jsonstring:
        json_path_str = "->".join(quote_json_path_part(part) for part in path)
        return f"parse_json(`{column.name}`)->{json_path_str}"

    if column.is_map:
        map_key = ".".join(path)
        escaped_key = escape_param(map_key)
        return f"`{column.name}`[{escaped_key}]"

    if column.is_array:
        index_str = ".".join(path)
        try:
            index = int(index_str)
        except ValueError as err:
            raise FlyqlError(
                f"invalid array index, expected number: {index_str}"
            ) from err
        return f"`{column.name}`[{index}]"

    if column.is_struct:
        struct_column = "`.`".join(path)
        return f"`{column.name}`.`{struct_column}`"

    raise FlyqlError(f"path access on non-composite column type: {column.name}")


def generate_select(
    text: str,
    columns: Mapping[str, Column],
    registry: Optional[TransformerRegistry] = None,
) -> SelectResult:
    """Generate a StarRocks SELECT clause from a column expression string."""
    raws = _parse_raw_select_columns(text)
    select_columns: List[SelectColumn] = []
    exprs: List[str] = []

    for name, alias in raws:
        key = parse_key(name)
        column, path = _resolve_column(key, columns)

        sql_expr = _build_select_expr(column, path)
        if key.transformers:
            validate_transformer_chain(key.transformers, registry=registry)
            sql_expr = apply_transformer_sql(
                sql_expr, key.transformers, "starrocks", registry=registry
            )

        if alias:
            if not VALID_ALIAS_PATTERN.match(alias):
                raise FlyqlError(f"invalid alias: {alias}")
            sql_expr = f"{sql_expr} AS `{alias}`"
        elif path:
            alias = name
            if not VALID_ALIAS_PATTERN.match(alias):
                raise FlyqlError(f"invalid alias: {alias}")
            sql_expr = f"{sql_expr} AS `{alias}`"

        select_columns.append(
            SelectColumn(key=key, alias=alias, column=column, sql_expr=sql_expr)
        )
        exprs.append(sql_expr)

    return SelectResult(columns=select_columns, sql=", ".join(exprs))
